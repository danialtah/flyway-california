# FlyWay California

A small, free web app for finding rare and migratory birds in California:
a feed of notable sightings, a map with a radius search, a season filter,
and a page for each species. It is a non-commercial UX portfolio project.
There are no ads, affiliate links, or paid features.

## Data sources

- **eBird API** (Cornell Lab of Ornithology): recent and notable sightings.
- **eBird Status and Trends** (Data Version 2023; Released 2025): migration
  type, months present, and rarity tier for each species.
- **California Bird Records Committee (CBRC) checklist**: which species are on
  the official California list and which are review species.

The files in `public/data/` were built ahead of time from these sources by
the scripts in `pipeline/` (see `pipeline/README.md` for the run order). The
app reads them as they are.

- `ca_species_final.csv`: one row per species, with its migration type,
  months present, rarity tier, and CBRC status.
- `ca_species_status_lines_v2.csv`: the short status line shown on each
  species page.

## Attribution

This text is shown on the site:

> Data from eBird (Cornell Lab of Ornithology) and eBird Status and Trends.

Full citation for Status and Trends:

> eBird Status and Trends, Data Version: 2023; Released: 2025. Cornell Lab of
> Ornithology, Ithaca, New York.

## Project layout

- `api/`: server functions. All eBird API calls go through these, so the key
  never reaches the browser. `api/suggest.js` suggests eBird hotspots for
  the site search. `api/place.js` looks up typed places for the near-me
  search with OpenStreetMap's Nominatim, cached for a day as its usage
  policy asks. (Nominatim's policy doesn't allow suggest-as-you-type, so
  the site search suggests eBird hotspots instead.)
- `public/`: the website, plus the data files in `public/data/`. Pages:
  `index.html` (home), `counties.html`, `county.html?code=US-CA-073`,
  `birds.html` (California Bird Species), `species.html?code=comloo`, and
  `about.html`. `tokens.css` holds the design tokens from Figma, and
  `fonts/` the self-hosted Noto Sans files (SIL Open Font License, see
  `fonts/OFL.txt`), so pages make no requests to Google.
- `pipeline/`: the scripts that built the data files. The app doesn't run
  them.
- `vercel.json`: Vercel settings. It is empty for now because Vercel serves
  files in `api/` as functions automatically, so no rewrites are needed.

## Setup

The eBird API key goes in a Vercel environment variable named
`EBIRD_API_KEY`, never in code.

1. Add the key in the Vercel project settings under Environment Variables, as
   `EBIRD_API_KEY`.
2. To run the site locally, install the Vercel CLI (`npm i -g vercel`), link
   the folder with `vercel link`, then pull the key with `vercel env pull`.
   This writes `.env.local`, which is gitignored.
3. Start the local server with `npm start`, which runs `vercel dev`.

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
