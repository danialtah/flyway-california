import csv, json, os, sys, time, urllib.parse, urllib.request

# Build ca_species_photos.json: one iNaturalist photo per California species,
# with the photographer credit and license to show next to it. Species are
# matched to iNaturalist by scientific name. Each species gets its iNaturalist
# default photo if its license is allowed, else the first allowed photo in the
# species' photo list, unless pipeline/photo_overrides.json names a photo for
# it. Species with no match or no allowed photo are left out and listed at
# the end; the site shows a placeholder for them.
#
# The site loads the images from iNaturalist's open-data storage; it never
# calls the iNaturalist API. Rerun this when the species list changes.
#
# Usage (from public/data/, which holds ca_species_all.csv):
#   python3 build_photos.py [output.json]   # default ca_species_photos.json
# If Python can't verify HTTPS certificates, set SSL_CERT_FILE=/etc/ssl/cert.pem.

OUT_FILE = sys.argv[1] if len(sys.argv) > 1 else "ca_species_photos.json"
if os.path.exists(OUT_FILE):
    sys.exit(f"{OUT_FILE} already exists; not overwriting")

# Public domain, CC0, CC BY, CC BY-NC, CC BY-SA, CC BY-NC-SA. No "no
# derivatives" licenses, since the site crops photos to fit, and nothing
# with all rights reserved (no license code).
ALLOWED = {"pd", "cc0", "cc-by", "cc-by-nc", "cc-by-sa", "cc-by-nc-sa"}
API = "https://api.inaturalist.org/v1"
HEADERS = {"User-Agent": "FlyWayCalifornia/1.0 (free non-commercial birding site; species photos)"}


def get(url, tries=5):
    for attempt in range(tries):
        time.sleep(1.1 if attempt == 0 else 10 * attempt)  # about 1 request a second; back off on errors
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as r:
                return json.load(r)
        except (OSError, ValueError) as err:  # timeouts, dropped connections, 429s and 5xx
            print(f"retrying after {err}: {url}", file=sys.stderr)
    sys.exit(f"gave up after {tries} tries: {url}")


def photo_entry(taxon, photo):
    return {
        "taxon_id": taxon["id"],
        "photo_id": photo["id"],
        "url": photo["medium_url"],  # swap "medium" for "large" or "small" for other sizes
        "license": photo["license_code"],
        "attribution": photo["attribution"],
        "page": f"https://www.inaturalist.org/photos/{photo['id']}",
    }


species = list(csv.DictReader(open("ca_species_all.csv", encoding="utf-8")))

# Scientific name -> iNaturalist taxon id.
taxon_ids, no_match = {}, []
for s in species:
    name = s["scientific_name"]
    found = get(f"{API}/taxa?" + urllib.parse.urlencode({"q": name, "rank": "species", "per_page": 30}))  # better-known species can outrank the exact name
    hit = next((t for t in found["results"] if t["name"].lower() == name.lower()), None)
    if hit:
        taxon_ids[s["ebird_code"]] = hit["id"]
    else:
        no_match.append(s)

# Full taxon records (with each species' photo list), 30 at a time.
taxa = {}
ids = sorted(set(taxon_ids.values()))
for i in range(0, len(ids), 30):
    for t in get(f"{API}/taxa/" + ",".join(map(str, ids[i:i + 30])))["results"]:
        taxa[t["id"]] = t

photos, no_photo = {}, []
for s in species:
    taxon = taxa.get(taxon_ids.get(s["ebird_code"]))
    if not taxon:
        continue
    candidates = [taxon.get("default_photo")] + [tp["photo"] for tp in taxon.get("taxon_photos", [])]
    photo = next((p for p in candidates if p and p.get("license_code") in ALLOWED), None)
    if photo:
        photos[s["ebird_code"]] = photo_entry(taxon, photo)
    else:
        no_photo.append(s)

# Photos picked by hand in the photo review replace the automatic choice.
# "crop" ("top" or "bottom") says where the card's crop should sit; the site
# leaves it centered when it's missing.
overrides = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "photo_overrides.json"), encoding="utf-8"))
codes = {s["ebird_code"] for s in species}
for code, o in overrides.items():
    if code not in codes:
        print(f"override for {code} ignored: not in ca_species_all.csv", file=sys.stderr)
        continue
    # A self-hosted photo (license "macaulay") has a local url and no taxon id.
    photos[code] = {"taxon_id": o.get("taxon_id") or photos.get(code, {}).get("taxon_id", taxon_ids.get(code)),
                    **{k: o[k] for k in ("photo_id", "url", "license", "attribution", "page")}}
    if o.get("crop"):
        photos[code]["crop"] = o["crop"]
no_photo = [s for s in no_photo if s["ebird_code"] not in overrides]
no_match = [s for s in no_match if s["ebird_code"] not in overrides]

with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump(dict(sorted(photos.items())), f, ensure_ascii=False, separators=(",", ":"))
    f.write("\n")

print(len(photos), "of", len(species), "species photos written to", OUT_FILE)
for label, rows in (("No iNaturalist match", no_match), ("No photo with an allowed license", no_photo)):
    if rows:
        print(f"\n{label} ({len(rows)}):")
        for s in rows:
            print(f"  {s['ebird_code']}  {s['common_name']} ({s['scientific_name']})")
