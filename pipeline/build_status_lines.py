import csv, os, sys

# Build ca_species_status_lines_v2.csv: one status line per species, from
# ca_species_final.csv. Lines are joined with a space.
#
# Usage:
#   python3 build_status_lines.py [output.csv]   # default ca_species_status_lines_v2.csv

OUT_FILE = sys.argv[1] if len(sys.argv) > 1 else "ca_species_status_lines_v2.csv"
if os.path.exists(OUT_FILE):
    sys.exit(f"{OUT_FILE} already exists; not overwriting")

MONTHS = {"Jan": "January", "Feb": "February", "Mar": "March", "Apr": "April",
          "May": "May", "Jun": "June", "Jul": "July", "Aug": "August",
          "Sep": "September", "Oct": "October", "Nov": "November", "Dec": "December"}

ESCAPEE_LINES = {
    "escapee found in California; may have settled here": "Escaped birds; may have settled here.",
    "escapee established in very small numbers": "Escaped birds, established in very small numbers.",
}
STAND_IN_LINE = "Status based on its older combined form."
NO_DATA_LINE = (
    "No established California population. The few records here are escaped or released "
    "birds, wild birds far off course, small local introductions, or misidentifications.")
# No-data species on the CBRC Main list that are not review species.
VAGRANT_LINE = ("Not native to California. Very rarely seen in California, more common in "
                "other states or reached here from the ocean.")

HAND_EDIT = {"California Condor", "Common Loon", "Snow Goose", "Osprey", "Brant",
             "Western Meadowlark", "Black Oystercatcher", "Harris's Hawk",
             "Island Scrub-Jay", "Thick-billed Kingbird", "Northern Yellow Warbler"}

# Hand-written lines that replace the generated ones.
HAND_LINES = {
    "California Condor": "Extremely rare. Critically endangered; only recently has this "
                         "species started breeding successfully again in the wild.",
    "Common Loon": "Rare in California. Resident year-round, most often October through May "
                   "on the coast.",
    "Brant": "Uncommon in California. Winter visitor, present November through May. "
             "Common in a few coastal bays.",
    "Harris's Hawk": "Rare in California. Resident all year. "
                     "Very few birds, in the southeastern desert.",
    "Island Scrub-Jay": "Uncommon in California. Found only on Santa Cruz Island.",
    "Osprey": "Uncommon in California. Year-round resident mainly on the coast "
              "or near bodies of water.",
    "Snow Goose": "Uncommon in California. Winter visitor, present November through April. "
                  "Huge winter flocks in the Central Valley.",
    "Thick-billed Kingbird": "Rare in California, vagrant with extremely small population.",
}


def months_in_full(text):
    """'Apr-May, Sep-Feb' -> 'April through May and September through February'."""
    if text == "all year":
        return text
    parts = []
    for part in (p.strip() for p in text.split(",")):
        a, _, b = part.partition("-")
        parts.append(f"{MONTHS[a]} through {MONTHS[b]}" if b else MONTHS[a])
    return " and ".join(parts)


def season_line(migration_type, months):
    full = months_in_full(months)
    if migration_type == "year-round":
        return "Resident all year." if months == "all year" else f"Resident year-round, most often {full}."
    prefix = {"winter visitor": "Winter visitor", "summer visitor": "Summer visitor",
              "migrant": "Passes through"}[migration_type]
    return f"{prefix}, present {full}."


rows = []
for s in csv.DictReader(open("ca_species_final.csv", encoding="utf-8")):
    if s["tier"]:
        lines = [f"{s['tier']} in California.", season_line(s["migration_type"], s["occupied_months"])]
        lines += [line for note, line in ESCAPEE_LINES.items() if note in s["notes"]]
        if s["tier_source"] == "pre-split stand-in":
            lines.append(STAND_IN_LINE)
        status_line = " ".join(lines)
    elif s["cbrc_list"] == "Main" and s["cbrc_review"] == "false":
        status_line = VAGRANT_LINE
    else:
        status_line = NO_DATA_LINE
    status_line = HAND_LINES.get(s["common_name"], status_line)
    rows.append({"ebird_code": s["ebird_code"], "common_name": s["common_name"],
                 "status_line": status_line,
                 "hand_edit_candidate": str(s["common_name"] in HAND_EDIT).lower()})

with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), quoting=csv.QUOTE_ALL)
    w.writeheader()
    w.writerows(rows)
print(len(rows), "species written to", OUT_FILE)
