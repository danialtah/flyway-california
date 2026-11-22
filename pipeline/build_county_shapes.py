import json, os, struct, sys, zipfile

# Build ca_county_shapes.json: the outline of each California county, so
# /api/species can say which county a sighting's place is in (eBird's
# species lookup doesn't send it). The outlines are the US Census Bureau's
# 2023 cartographic boundary file at 1:5,000,000 (public domain), with
# coordinates rounded to 4 decimals (about 10 m). Needs no keys. Download
# the file first:
#   curl -LO https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_5m.zip
#
# Usage:
#   python3 build_county_shapes.py cb_2023_us_county_5m.zip [output.json]   # default ca_county_shapes.json

ZIP_FILE = sys.argv[1] if len(sys.argv) > 1 else sys.exit("Give the Census zip file")
OUT_FILE = sys.argv[2] if len(sys.argv) > 2 else "ca_county_shapes.json"
if os.path.exists(OUT_FILE):
    sys.exit(f"{OUT_FILE} already exists; not overwriting")

archive = zipfile.ZipFile(ZIP_FILE)
shp = archive.read("cb_2023_us_county_5m.shp")
dbf = archive.read("cb_2023_us_county_5m.dbf")

# The .dbf holds one record per shape, in the same order: read STATEFP and
# COUNTYFP.
count, header_len, record_len = struct.unpack("<xxxxIHH", dbf[:12])
fields, pos = {}, 1
for i in range(32, header_len - 1, 32):
    name = dbf[i:i + 11].split(b"\0")[0].decode()
    size = dbf[i + 16]
    fields[name] = (pos, size)
    pos += size
def field(record, name):
    start, size = fields[name]
    return record[start:start + size].decode().strip()
records = [dbf[header_len + n * record_len:header_len + (n + 1) * record_len] for n in range(count)]

# The .shp holds polygons (shape type 5): a list of rings, each a list of
# x, y points.
def polygons(data):
    pos = 100
    while pos < len(data):
        length = struct.unpack(">I", data[pos + 4:pos + 8])[0] * 2
        body = data[pos + 8:pos + 8 + length]
        pos += 8 + length
        num_parts, num_points = struct.unpack("<II", body[36:44])
        parts = list(struct.unpack(f"<{num_parts}I", body[44:44 + 4 * num_parts])) + [num_points]
        start = 44 + 4 * num_parts
        points = [struct.unpack("<dd", body[start + 16 * k:start + 16 * k + 16]) for k in range(num_points)]
        yield [points[parts[p]:parts[p + 1]] for p in range(num_parts)]

# eBird county code ("US-CA-001") -> rings of [lng, lat].
shapes = {}
for record, rings in zip(records, polygons(shp)):
    if field(record, "STATEFP") != "06":
        continue
    code = f"US-CA-{field(record, 'COUNTYFP')}"
    shapes[code] = [[[round(x, 4), round(y, 4)] for x, y in ring] for ring in rings]

ebird_codes = {c["code"] for c in json.load(open("ca_counties.json", encoding="utf-8"))}
if set(shapes) != ebird_codes:
    sys.exit(f"Counties don't match ca_counties.json: {sorted(set(shapes) ^ ebird_codes)}")

with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump(shapes, f, separators=(",", ":"))
    f.write("\n")
print(len(shapes), "counties written to", OUT_FILE)
