import csv, os, re, sys

# Cross-check California species against the CBRC official checklist.
#   reads:  cbrc_checklist.txt, ca_species_all.csv, ca_species_status.csv
#   writes: ca_species_reference_v2.csv, then cbrc_crosscheck_v2.csv once the
#           status file exists. Existing output files are never overwritten.

STATUS_FILE = "ca_species_status.csv"
OUT_CROSSCHECK = "cbrc_crosscheck_v2.csv"
OUT_REFERENCE = "ca_species_reference_v2.csv"

# Approved name table: CBRC scientific name -> eBird scientific name, for
# species that are the same bird under a different name.
NAME_TABLE = {
    "Porphyrio martinicus": "Porphyrio martinica",                 # Purple Gallinule
    "Ardea egretta": "Ardea alba",                                 # American Egret = Great Egret
    "Dryobates villosus": "Leuconotopicus villosus",               # Hairy Woodpecker
    "Dryobates albolarvatus": "Leuconotopicus albolarvatus",       # White-headed Woodpecker
    "Coccothraustes vespertinus": "Hesperiphona vespertina",       # Evening Grosbeak
    "Emberiza pusilla": "Schoeniclus pusillus",                    # Little Bunting
    "Emberiza rustica": "Schoeniclus rusticus",                    # Rustic Bunting
    "Anthropoides virgo": "Grus virgo",                            # Demoiselle Crane
    "Phylloscopus borealis/examinandus": "Phylloscopus borealis",  # Arctic Warbler
}
# On the CBRC checklist but not on eBird's California list; left out.
NOT_IN_CA_LIST = {"Diomedea exulans", "Saxicola maurus"}  # Wandering Albatross, Asian Stonechat

write_reference = not os.path.exists(OUT_REFERENCE)
write_crosscheck = os.path.exists(STATUS_FILE) and not os.path.exists(OUT_CROSSCHECK)
if not (write_reference or write_crosscheck):
    sys.exit("nothing to write: outputs already exist or the status file is missing")

HEADER = re.compile(r"^[A-Z][a-z]+(formes|idae)\s*-")
# "Common Name Genus species[/alt]" or "Common Name {Genus species}", then optional " - CODES"
SPECIES = re.compile(
    r"^(?P<common>.+?)\s+\{?(?P<sci>[A-Z][a-z]+ [a-z]+(?:/[a-z]+)?)\}?"
    r"(?:\s*-\s*(?P<codes>[*A-Z]+))?\s*$")


def parse_codes(codes):
    codes = codes or ""
    marker = ""
    rest = codes.replace("*", "")
    if rest.startswith("RI"):
        marker, rest = "RI", rest[2:]
    elif rest[:1] in ("I", "E"):
        marker, rest = rest[0], rest[1:]
    return "*" in codes, marker, rest  # rest = evidence letters (P, V, A, T, S)


cbrc = []
section = None
for line in open("cbrc_checklist.txt", encoding="utf-8"):
    line = line.strip()
    if line == "Main List":
        section = "Main"
        continue
    if line == "Supplemental List":
        section = "Supplemental"
        continue
    if section is None or not line or HEADER.match(line):
        continue
    m = SPECIES.match(line)
    if not m:
        continue  # prose paragraph under the Supplemental List heading
    review, marker, evidence = parse_codes(m["codes"])
    cbrc.append({"common": m["common"], "sci": m["sci"], "list": section,
                 "review": review, "evidence": evidence, "marker": marker})

species = list(csv.DictReader(open("ca_species_all.csv", encoding="utf-8")))
by_sci = {s["scientific_name"]: s for s in species}

matched = {}      # ebird_code -> cbrc entry
unmatched = []
for c in cbrc:
    if c["sci"] in NOT_IN_CA_LIST:
        continue
    s = by_sci.get(NAME_TABLE.get(c["sci"], c["sci"]))
    if s:
        matched[s["ebird_code"]] = c
    else:
        unmatched.append(c)

# hints only, never used for matching: same common name, or same species epithet
by_common = {s["common_name"].lower(): s for s in species}
def hint(c):
    s = by_common.get(c["common"].lower())
    if s:
        return s
    epithet = c["sci"].split()[1].split("/")[0]
    hits = [s for s in species if s["scientific_name"].split()[1] == epithet
            and s["ebird_code"] not in matched]
    return hits[0] if len(hits) == 1 else None

if write_reference:
    with open(OUT_REFERENCE, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(list(species[0].keys()) + ["cbrc_list", "cbrc_review"])
        for s in species:
            c = matched.get(s["ebird_code"])
            w.writerow(list(s.values()) + [c["list"] if c else "none",
                                           str(c["review"]).lower() if c else "false"])
    print("wrote", OUT_REFERENCE)

if write_crosscheck:
    status = {r["ebird_code"]: r for r in csv.DictReader(open(STATUS_FILE, encoding="utf-8"))}
    with open(OUT_CROSSCHECK, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(["ebird_code", "common_name", "scientific_name", "no_data_reason",
                    "cbrc_list", "cbrc_review", "cbrc_evidence", "cbrc_marker"])
        for s in species:
            st = status[s["ebird_code"]]
            if st["migration_type"] != "no data":
                continue
            c = matched.get(s["ebird_code"])
            w.writerow([s["ebird_code"], s["common_name"], s["scientific_name"], st["notes"],
                        c["list"] if c else "none", str(c["review"]).lower() if c else "false",
                        c["evidence"] if c else "", c["marker"] if c else ""])
    print("wrote", OUT_CROSSCHECK)

print(f"parsed {len(cbrc)} CBRC species "
      f"({sum(c['list'] == 'Main' for c in cbrc)} Main, {sum(c['list'] == 'Supplemental' for c in cbrc)} Supplemental)")
print(f"review {sum(c['review'] for c in cbrc)}, I {sum(c['marker'] == 'I' for c in cbrc)}, "
      f"E {sum(c['marker'] == 'E' for c in cbrc)}, RI {sum(c['marker'] == 'RI' for c in cbrc)}")
print(f"matched {len(matched)}, unmatched {len(unmatched)}")
for c in unmatched:
    h = hint(c)
    print(f"UNMATCHED|{c['common']}|{c['sci']}|{c['list']}|{'*' if c['review'] else ''}|"
          + (f"{h['common_name']}|{h['scientific_name']}|{h['ebird_code']}" if h else "||"))
