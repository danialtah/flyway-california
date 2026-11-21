import json, csv

TAX = "ebird_taxonomy_codes.json"

codes = json.load(open("ca_species_codes.json"))
tax = json.load(open(TAX, encoding="utf-8"))
if isinstance(tax, dict):
    for k in ("data", "taxonomy", "items"):
        if k in tax:
            tax = tax[k]
            break

by_code = {t["speciesCode"]: t for t in tax}
rows = []
for code in codes:
    t = by_code.get(code)
    if t and t.get("category") == "species":
        rows.append({
            "ebird_code": code,
            "common_name": t["comName"],
            "scientific_name": t["sciName"],
            "order": t.get("order", ""),
            "family": t.get("familyComName", ""),
        })

rows.sort(key=lambda r: r["common_name"])
with open("ca_species_all.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)
print(len(rows), "California species written to ca_species_all.csv")
