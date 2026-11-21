import csv, json, os, sys

# Build ca_species_forms.json: eBird subspecies forms (issf, form, intergrade)
# -> their parent species code, for parents on the California species list.
# The feed uses it to link a sighting like "Dark-eyed Junco (Slate-colored)" to
# the Dark-eyed Junco species page. Domestic types are left out.
#
# Usage:
#   python3 build_forms.py [output.json]   # default ca_species_forms.json

OUT_FILE = sys.argv[1] if len(sys.argv) > 1 else "ca_species_forms.json"
if os.path.exists(OUT_FILE):
    sys.exit(f"{OUT_FILE} already exists; not overwriting")

FORM_CATEGORIES = {"issf", "form", "intergrade"}

ca_codes = {r["ebird_code"] for r in csv.DictReader(open("ca_species_all.csv", encoding="utf-8"))}
tax = json.load(open("ebird_taxonomy_codes.json", encoding="utf-8"))

forms = {t["speciesCode"]: t["reportAs"] for t in tax
         if t["category"] in FORM_CATEGORIES and t.get("reportAs") in ca_codes}
forms = dict(sorted(forms.items()))

with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump(forms, f, separators=(",", ":"))
    f.write("\n")
print(len(forms), "forms written to", OUT_FILE)
