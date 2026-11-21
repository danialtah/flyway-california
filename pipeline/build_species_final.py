import csv, os, subprocess, sys, tempfile

# Build ca_species_final.csv: ca_species_status.csv plus a rarity tier.
#   tier from avg_occurrence (peak monthly CA-averaged occurrence on the
#   expanded outline, from ca_species_rarity_check_v2.csv):
#     Common   >= COMMON_CUTOFF
#     Uncommon >= RARE_CUTOFF
#     Rare     <  RARE_CUTOFF
#   Labeled birds that land in the wrong tier take their eBird label.
#   Six eBird splits take avg_occurrence from pre-split Status and Trends data.
#   cbrc_review is carried as a column only; it does not affect the tier.
#
# Usage:
#   python3 build_species_final.py [output.csv]   # default ca_species_final.csv

OUT_FILE = sys.argv[1] if len(sys.argv) > 1 else "ca_species_final.csv"
if os.path.exists(OUT_FILE):
    sys.exit(f"{OUT_FILE} already exists; not overwriting")

COMMON_CUTOFF = 0.05
RARE_CUTOFF = 0.001

EBIRD_LABELS = {
    "House Finch": "Common", "Northern Mockingbird": "Common", "House Sparrow": "Common",
    "Yellow-rumped Warbler": "Common", "Black Phoebe": "Common",
    "Osprey": "Uncommon", "Belted Kingfisher": "Uncommon",
    "Vermilion Flycatcher": "Uncommon", "Snow Goose": "Uncommon",
    "Common Loon": "Rare", "Wood Duck": "Rare", "California Condor": "Rare",
}

# Tiers set by hand, overriding the cutoffs (tier_source "manual").
MANUAL_TIERS = {
    "Black Oystercatcher": "Rare",
}


# eBird code -> pre-split Status and Trends code (same table as classify_ca_status_v5.R)
STAND_IN = {
    "yelwar1": "yelwar",   # Northern Yellow Warbler <- Yellow Warbler
    "marwre1": "marwre",   # Western Marsh Wren <- Marsh Wren
    "houwre": "y01309",    # Northern House Wren <- Northern/Southern House Wren
    "wewvir2": "warvir",   # Western Warbling Vireo <- Warbling Vireo
    "willet3": "willet1",  # Prairie Willet <- Willet
    "whimbr3": "whimbr",   # Hudsonian Whimbrel <- Whimbrel
}
STAND_IN_NOTE = "pre-split Status and Trends data; eBird split not modeled"

# Same expanded outline and averaging as compute_rarity_check_v2.R, run on the
# pre-split codes. Prints "ebird_code,avg" lines.
STAND_IN_R = r"""
suppressPackageStartupMessages({library(ebirdst); library(terra); library(sf); library(maps)})
data_dir <- file.path(ebirdst_data_dir(), "2023")
states <- st_read(file.path(ebirdst_data_dir(), "boundaries", "cb_2023_us_state_5m",
                            "cb_2023_us_state_5m.shp"), quiet = TRUE)
aea <- "EPSG:3310"
ca <- st_union(st_transform(states[states$STUSPS == "CA", ], aea))
nb <- st_union(st_transform(states[states$STUSPS %in% c("OR", "NV", "AZ"), ], aea))
mx <- st_union(st_transform(st_make_valid(st_as_sf(
  maps::map("world", "Mexico", plot = FALSE, fill = TRUE))), aea))
ex <- st_union(st_difference(st_difference(st_buffer(ca, 20000), nb), mx), ca)
pairs <- strsplit(commandArgs(trailingOnly = TRUE), "=")
for (p in pairs) {
  tif <- list.files(file.path(data_dir, p[2]), "_occurrence_median_27km_.*\\.tif$",
                    recursive = TRUE, full.names = TRUE)[1]
  r <- rast(tif)
  v <- vect(st_transform(ex, crs(r)))
  avg <- global(mask(crop(r, v), v), "mean", na.rm = TRUE)$mean
  mon <- tapply(avg, factor(as.integer(format(as.Date(names(r)), "%m")), levels = 1:12), mean)
  cat(p[1], ",", format(max(mon, na.rm = TRUE), digits = 15), "\n", sep = "")
}
"""


def stand_in_averages():
    with tempfile.NamedTemporaryFile("w", suffix=".R", delete=False) as f:
        f.write(STAND_IN_R)
    try:
        out = subprocess.run(["Rscript", f.name] + [f"{k}={v}" for k, v in STAND_IN.items()],
                             capture_output=True, text=True, check=True).stdout
    finally:
        os.unlink(f.name)
    return {code: float(avg) for code, avg in (line.split(",") for line in out.split())}


def number(text):
    return float(text) if text not in ("", "NA") else None


def tier_for(avg):
    if avg >= COMMON_CUTOFF:
        return "Common"
    if avg >= RARE_CUTOFF:
        return "Uncommon"
    return "Rare"


status = list(csv.DictReader(open("ca_species_status.csv", encoding="utf-8")))
rarity = {r["ebird_code"]: r for r in csv.DictReader(open("ca_species_rarity_check_v2.csv", encoding="utf-8"))}
stand_in = stand_in_averages()

rows = []
for s in status:
    rk = rarity.get(s["ebird_code"], {})
    avg = number(rk.get("peak_ca_occurrence_expanded", ""))
    row = dict(s)
    row["tier"], row["tier_source"] = "", "no data"
    if s["migration_type"] != "no data" and avg is not None:
        row["tier"], row["tier_source"] = tier_for(avg), "average cutoff"
        label = EBIRD_LABELS.get(s["common_name"])
        if label and label != row["tier"]:
            row["tier"], row["tier_source"] = label, "eBird label"
        if s["common_name"] in MANUAL_TIERS:
            row["tier"], row["tier_source"] = MANUAL_TIERS[s["common_name"]], "manual"
    row["avg_occurrence"] = rk.get("peak_ca_occurrence_expanded", "")
    row["peak_max_cell_occurrence"] = rk.get("peak_max_cell_occurrence", "")
    if s["ebird_code"] in stand_in:
        if STAND_IN_NOTE not in s["notes"]:
            sys.exit(f"{s['common_name']} is missing the stand-in note")
        avg = stand_in[s["ebird_code"]]
        row["tier"], row["tier_source"] = tier_for(avg), "pre-split stand-in"
        row["avg_occurrence"] = repr(avg)
    rows.append(row)

fields = [f for f in status[0].keys() if f not in ("cbrc_list", "cbrc_review")] + [
    "tier", "tier_source", "avg_occurrence", "peak_max_cell_occurrence", "cbrc_list", "cbrc_review"]
with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fields, quoting=csv.QUOTE_ALL)
    w.writeheader()
    w.writerows(rows)
print(len(rows), "species written to", OUT_FILE)
