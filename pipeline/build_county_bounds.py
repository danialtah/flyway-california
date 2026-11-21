import json, os, sys, urllib.request

# Build ca_county_bounds.json: the map bounds of each California county, from
# the eBird API (/v2/ref/region/info), so a county page can zoom its map to
# the county without an extra API call. Reads the county list from
# ca_counties.json and the eBird key from EBIRD_API_KEY.
#
# Usage:
#   python3 build_county_bounds.py [output.json]   # default ca_county_bounds.json

OUT_FILE = sys.argv[1] if len(sys.argv) > 1 else "ca_county_bounds.json"
if os.path.exists(OUT_FILE):
    sys.exit(f"{OUT_FILE} already exists; not overwriting")

KEY = os.environ.get("EBIRD_API_KEY") or sys.exit("EBIRD_API_KEY isn't set")

def region_info(code):
    req = urllib.request.Request(f"https://api.ebird.org/v2/ref/region/info/{code}",
                                 headers={"X-eBirdApiToken": KEY})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)

# code -> [[south, west], [north, east]], the order Leaflet's fitBounds takes.
bounds = {}
for county in json.load(open("ca_counties.json", encoding="utf-8")):
    b = region_info(county["code"])["bounds"]
    bounds[county["code"]] = [[b["minY"], b["minX"]], [b["maxY"], b["maxX"]]]

with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump(bounds, f, separators=(",", ":"))
    f.write("\n")
print(len(bounds), "counties written to", OUT_FILE)
