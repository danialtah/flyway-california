# Data pipeline

These scripts built the two data files in `public/data/`. The app doesn't
run them; they are kept here to show how the data was made.

Run each one from a folder that holds its input files. Raw eBird downloads
and the eBird access keys are never stored in this repo. Status and Trends
data goes to the ebirdst data folder (`ebirdst_data_dir()` in R), and the
Status and Trends key is read from `EBIRDST_KEY` in `~/.Renviron`.

Inputs not kept in this repo:
- `ca_species_codes.json`: eBird's California species list, from the eBird API.
- `ebird_taxonomy_codes.json`: the eBird taxonomy, from the eBird API.
- `cbrc_checklist.txt`: the CBRC official California checklist.

## Run order

1. `build_ca_species.py` writes `ca_species_all.csv`: the 903 California
   species, with names, order, and family.
2. `classify_ca_status.R` downloads the Status and Trends data each species
   needs. Run with no options, it writes no file.
3. `cbrc_crosscheck.py` writes `ca_species_reference_v2.csv`: the species
   list plus each species' CBRC list and review status.
4. `classify_ca_status_v5.R` writes `ca_species_status.csv`: migration type,
   months present, and notes for each species.
5. `cbrc_crosscheck.py` (run again, now that the status file exists) writes
   `cbrc_crosscheck_v2.csv`: the no-data species with their CBRC details, for
   review.
6. `compute_rarity_check.R` writes `ca_species_rarity_check.csv`: peak
   California occurrence on the land-only outline, read by the next step.
7. `compute_rarity_check_v2.R` writes `ca_species_rarity_check_v2.csv`: peak
   occurrence on the expanded outline (islands and a 20 km offshore strip)
   and the highest single-cell occurrence.
8. `build_species_final.py` writes `ca_species_final.csv`: the status file
   plus a rarity tier for each species. This is one of the app's two data
   files.
9. `build_status_lines.py` writes `ca_species_status_lines_v2.csv`: the
   status line shown on each species page. This is the app's other data file.
10. `build_forms.py` writes `ca_species_forms.json`: each eBird subspecies
    form (like "Dark-eyed Junco (Slate-colored)") mapped to its parent
    species, so the feed can link forms to the parent's species page. It
    only needs `ca_species_all.csv` and `ebird_taxonomy_codes.json`.

`public/data/ca_counties.json` (the 58 California counties) was saved
straight from the eBird API (`/v2/ref/region/list/subnational2/US-CA`); no
script builds it.

`build_county_bounds.py` writes `ca_county_bounds.json`: the map bounds of
each county, from the eBird API, for the county pages. Run it from
`public/data/` with `EBIRD_API_KEY` set.

`build_county_shapes.py` writes `ca_county_shapes.json`: each county's
outline, from the US Census Bureau's 2023 cartographic boundary file
(1:5,000,000, public domain), so `/api/species` can say which county a
sighting is in. Download `cb_2023_us_county_5m.zip` first (the URL is in the
script), then run it from `public/data/` with the zip's path.

No script overwrites an existing output file; delete or move the old file
first.

## First draft

`classify_status_first_draft.R` is kept only to compare with the final
classifier (`classify_ca_status_v5.R`). It isn't part of the run order.

It is a copy of `classify_ca_status.R` (step 2), which still holds the
first-draft rules: migration types from eBird's seasonal abundance, on a
California outline without the islands or offshore waters. Since then the
script has also gained a download-only mode and options, and a fix for how
months are averaged; the original first-draft file no longer exists.
