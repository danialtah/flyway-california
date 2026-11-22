// Feed logic with no page code, so it can be tested on its own.

// List sizes for the rarest birds; the first is the default.
export const TOP_SIZES = [10, 25, 50];

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Parse a CSV file into objects keyed by the header row. Handles quoted fields
// and doubled quotes, which is all our data files use.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

// ebird_code -> species row from ca_species_final.csv, plus its status line
// and, when ca_species_all.csv rows are given, its scientific name.
export function speciesByCode(finalRows, lineRows, allRows = []) {
  const lines = new Map(lineRows.map((r) => [r.ebird_code, r.status_line]));
  const sciNames = new Map(allRows.map((r) => [r.ebird_code, r.scientific_name]));
  return new Map(finalRows.map((r) => [r.ebird_code, {
    ...r, status_line: withoutTier(lines.get(r.ebird_code) ?? "", r.tier),
    scientific_name: sciNames.get(r.ebird_code) ?? "",
  }]));
}

// The tier tag already says "Rare in California", so status lines drop
// their opening "Rare in California." (or "Rare in California, vagrant ...")
// when it names the species' own tier:
// "Common in California. Summer visitor, ..." -> "Summer visitor, ..."
export function withoutTier(line, tier) {
  if (!tier) return line;
  const rest = line.replace(new RegExp(`^${tier} in California[.,]\\s*`), "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

export function firstSentence(line) {
  const end = line.indexOf(". ");
  return end === -1 ? line : line.slice(0, end + 1);
}

// "2026-11-12 16:34" or "2026-11-12" -> "Nov 12"
export function formatDate(obsDt) {
  const [, month, day] = obsDt.slice(0, 10).split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

export function placeText(sighting) {
  return sighting.private
    ? `${sighting.county} (private location, no map pin)`
    : `${sighting.locName}, ${sighting.county} County`;
}

// One row per reported taxon, newest first. `species` is the species of the
// row: the reported species itself, the parent species of a subspecies form,
// or null for hybrids and other entries with no species page.
export function groupBySpecies(sightings, species, forms) {
  const groups = new Map();
  for (const s of sightings) {
    let g = groups.get(s.speciesCode);
    if (!g) {
      const code = species.has(s.speciesCode) ? s.speciesCode : forms[s.speciesCode];
      g = { speciesCode: s.speciesCode, comName: s.comName, sciName: s.sciName,
            species: species.get(code) ?? null, sightings: [] };
      groups.set(s.speciesCode, g);
    }
    g.sightings.push(s);
  }
  return [...groups.values()]
    .map((g) => {
      g.sightings.sort((a, b) => b.date.localeCompare(a.date));
      // Private sightings have no place id, so each county counts as one place.
      const places = new Set(g.sightings.map((s) => (s.private ? `private:${s.countyCode}` : s.locId)));
      const counties = [...new Set(g.sightings.map((s) => s.county))].sort();
      return { ...g, latest: g.sightings[0], placeCount: places.size, counties };
    })
    .sort((a, b) => b.latest.date.localeCompare(a.latest.date));
}

// Species not on the CBRC checklist: escapees, and wild birds that aren't
// native to California. They get their own section instead of the main feed.
export function isOffList(group) {
  return group.species?.cbrc_list === "none";
}

// The season filter's options (the home page menu and the A–Z chips).
export const SEASONS = [
  { value: "", text: "All birds" },
  { value: "year-round", text: "Year-round birds" },
  { value: "winter visitor", text: "Winter visitors" },
  { value: "summer visitor", text: "Summer visitors" },
  { value: "migrant", text: "Migrants" },
  { value: "vagrant", text: "Rare visitors / vagrants" },
];

// The season filter: a migration type from ca_species_final.csv, or
// "vagrant" for wild birds too rare in California for Status and Trends to
// give a season (on the CBRC list, no migration data). Escapees and hybrids
// only show under "All birds".
export function inSeason(group, season) {
  if (!season) return true;
  if (season === "vagrant") return group.species?.migration_type === "no data" && !isOffList(group);
  return group.species?.migration_type === season;
}

// The rarest birds in `groups`: full species on the CBRC Main list only, which
// leaves out escapes, subspecies forms, and hybrids. Ranked by CBRC review
// species first, then the hand-picked RANK_NEAR_TOP species, then species with
// no Status and Trends data (no tier), then by the tier shown on the badge,
// then lowest average occurrence within a tier; fewer sightings break ties.
// Ranking by tier first keeps hand-set tiers (like Common Loon's Rare) in the
// same order as their badges.
const TIER_ORDER = { "": 0, Rare: 1, Uncommon: 2, Common: 3 };

// Species that always rank right after CBRC review species, whatever their
// statewide average.
const RANK_NEAR_TOP = new Set([
  "calcon",  // California Condor: critically endangered
]);

function rankGroup(s) {
  if (s.cbrc_review === "true") return 0;
  return RANK_NEAR_TOP.has(s.ebird_code) ? 1 : 2;
}

export function topRarest(groups, count = TOP_SIZES[0]) {
  const avg = (s) => Number(s.avg_occurrence) || 0;  // blank or "NA" count as 0
  return groups
    .filter((g) => g.species?.ebird_code === g.speciesCode && g.species.cbrc_list === "Main")
    .sort((a, b) =>
      rankGroup(a.species) - rankGroup(b.species) ||
      TIER_ORDER[a.species.tier] - TIER_ORDER[b.species.tier] ||
      avg(a.species) - avg(b.species) ||
      a.sightings.length - b.sightings.length)
    .slice(0, count);
}

// The sizes worth offering for `available` ranked birds: a larger size only
// when there are more birds than the size before it shows.
export function offeredSizes(available, sizes = TOP_SIZES) {
  return sizes.filter((size, i) => i === 0 || available > sizes[i - 1]);
}

// Migration types in ca_species_final.csv, with how the site shows them.
// Species without Status and Trends data have "no data" and no label.
export const MIGRATION_LABELS = {
  "year-round": "Year-round",
  "winter visitor": "Winter visitor",
  "summer visitor": "Summer visitor",
  "migrant": "Migrant",
};

// Straight-line distance in miles between two { lat, lng } points.
export function milesBetween(a, b) {
  const EARTH_MILES = 3958.8;
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.sqrt(h));
}
