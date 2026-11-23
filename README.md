# FlyWay California

A small, free web app for finding rare and migratory birds in California:
the rarest birds and hotspots this week, a map with a radius search, a
season filter, a page for each county and each species, and an A–Z list of
every California species. Every page has a desktop and a mobile layout. It
is a non-commercial UX portfolio project. There are no ads, affiliate links,
or paid features.

## Data sources

- **eBird API** (Cornell Lab of Ornithology): recent and notable sightings.
- **eBird Status and Trends** (Data Version 2023; Released 2025): migration
  type, months present, and rarity tier for each species.
- **California Bird Records Committee (CBRC) checklist**: which species are on
  the official California list and which are review species.
- **iNaturalist** and the **Macaulay Library**: bird photos, each shown with
  its photographer and Creative Commons license.
- **OpenStreetMap** (map tiles and Nominatim place search) and **Leaflet**
  (the map viewer).
- **US Census Bureau** county outlines (2023 cartographic boundary file,
  public domain): which county each species-page sighting is in.

The files in `public/data/` were built ahead of time from these sources by
the scripts in `pipeline/` (see `pipeline/README.md` for the run order). The
app reads them as they are.

- `ca_species_final.csv`: one row per species, with its migration type,
  months present, rarity tier, and CBRC status.
- `ca_species_status_lines_v2.csv`: the short status line shown on each
  species page.
- `ca_species_photos.json`: the photo, credit, and license for each species.
- `ca_counties.json`, `ca_county_bounds.json`, `ca_county_shapes.json`: the 58
  counties, the map area for each, and their outlines.

## Attribution

Every page's footer says "Bird data from eBird", and the About page lists
every source with its credit.

Full citation for Status and Trends:

> eBird Status and Trends, Data Version: 2023; Released: 2025. Cornell Lab of
> Ornithology, Ithaca, New York.

## Project layout

- `api/`: server functions. All eBird API calls go through these, so the key
  never reaches the browser. `api/notable.js` and `api/species.js` fetch
  sightings, and `api/_county.js` finds the county a sighting is in.
  `api/suggest.js` suggests eBird hotspots for the site search.
  `api/place.js` looks up typed places for the near-me search with
  OpenStreetMap's Nominatim, cached for a day as its usage policy asks. (Nominatim's policy doesn't allow suggest-as-you-type, so
  the site search suggests eBird hotspots instead.)
- `public/`: the website, plus the data files in `public/data/`. Pages:
  `index.html` (home), `counties.html`, `county.html?code=US-CA-073`,
  `birds.html` (California Bird Species), `species.html?code=comloo`, and
  `about.html`. `tokens.css` holds the design tokens from Figma, `site.css`
  the shared components, and `mobile.js` the phone header, menus, and press
  effects. `fonts/` holds the self-hosted Noto Sans files (SIL Open Font
  License, see `fonts/OFL.txt`), so pages make no requests to Google.
- `pipeline/`: the scripts that built the data files. The app doesn't run
  them.
- `vercel.json`: Vercel settings. It is empty for now because Vercel serves
  files in `api/` as functions automatically, so no rewrites are needed.

## Setup

The site needs one secret: an eBird API key, named `EBIRD_API_KEY`. It
lives only in environment variables, never in code, and only the functions
in `api/` read it, so it never reaches the browser.

1. Get a key at https://ebird.org/api/keygen.
2. For local use, put it in a file named `.env` in this folder:
   `EBIRD_API_KEY=<your key>`. `.env` is gitignored, so it is never
   committed.
3. Install the Vercel CLI (`npm i -g vercel`) and link the folder once with
   `vercel link`.
4. Start the local server with `npm start` (it runs `vercel dev`), then
   open http://localhost:3000.
5. To try the site on a phone on the same Wi-Fi, start it with
   `npm start -- --listen 0.0.0.0:3000` and open
   `http://<your computer's IP>:3000` on the phone. "Use my location" only
   works over https, so it won't work this way.
6. Before deploying, add the same key in the Vercel project settings under
   Environment Variables as `EBIRD_API_KEY`.

## Yearly data refresh

Live sightings come from the eBird API on every page load, so they are
always current. The Status and Trends data in `public/data/` doesn't change
between releases: Cornell publishes a new version about once a year, and
the files here match the release they were built from (Data Version 2023;
Released 2025). Refreshing it is a deliberate yearly step, not automated,
because a new release can change rarity tiers and the results need a look
before they go live.

When a new release is out:

1. Run the scripts in `pipeline/` in the order in `pipeline/README.md`. They
   need the Status and Trends key (`EBIRDST_KEY`); the site doesn't.
2. Review the new files, especially tier changes and the hand-written status
   lines in `build_status_lines.py`, then replace the files in `public/data/`.
3. Update the data version in the citations: `about.html`, this README, and
   anywhere else the site names it.
4. Redeploy.
