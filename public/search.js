// Search logic with no page code, so it can be tested on its own. The
// server's /api/suggest uses the same matching.

export const SEARCH_DAYS = [7, 30];

// Lowercase, without accents or apostrophes, and with other punctuation as
// spaces, so "coopers hawk" finds "Cooper's Hawk", "scrub jay" finds "Island
// Scrub-Jay", and "pinos" finds "Pt. Pinos--seawatch only".
export function normalize(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// How well `name` matches a normalized query: 0 when the name starts with it,
// 1 when a later word does, or -1 for no match.
export function matchScore(name, q) {
  const n = normalize(name);
  if (n.startsWith(q)) return 0;
  return ` ${n}`.includes(` ${q}`) ? 1 : -1;
}

// Site search suggestions: the best SUGGESTION_COUNT matches among birds,
// counties, and places, in three bands: bird and county names, then places,
// then birds by scientific name. Places come after names because thousands
// of hotspot names would crowd out birds ("loon" means loons before Loon
// Lake); scientific names come last so "marin" finds Marin County before
// Larus marinus. Within a band, better matches come first; among
// equal ones, birds before counties, more common birds first (people typing
// "American" likely mean American Robin before American Bittern), counties A
// to Z, and places in the order the server sent them (most checklists first).
// `places` are { name, ... } from /api/suggest.
export const SUGGESTION_COUNT = 3;
const KINDS = ["bird", "county", "place"];

export function suggestions(query, species, counties, places = []) {
  const q = normalize(query);
  if (q.length < 2) return [];
  const hits = [];
  for (const s of species.values()) {
    const order = -(Number(s.avg_occurrence) || 0);
    const common = matchScore(s.common_name, q);
    const sci = matchScore(s.scientific_name ?? "", q);
    if (common >= 0) hits.push({ kind: "bird", band: 0, score: common, order, name: s.common_name, item: s });
    else if (sci >= 0) hits.push({ kind: "bird", band: 2, score: sci, order, name: s.common_name, item: s });
  }
  for (const c of counties) {
    const score = matchScore(`${c.name} County`, q);
    if (score >= 0) hits.push({ kind: "county", band: 0, score, order: 0, name: `${c.name} County`, item: c });
  }
  places.forEach((p, i) => {
    const score = matchScore(p.name, q);
    if (score >= 0) hits.push({ kind: "place", band: 1, score, order: i, name: p.name, item: p });
  });
  return hits
    .sort((a, b) => a.band - b.band || a.score - b.score ||
                    KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.order - b.order ||
                    a.name.localeCompare(b.name))
    .slice(0, SUGGESTION_COUNT);
}

// "Cesar Chavez Park · Nov 12 · 2 birds"
export function sightingText(sighting, formatDate) {
  const parts = [sighting.locName, formatDate(sighting.date)];
  if (sighting.howMany) parts.push(sighting.howMany === 1 ? "1 bird" : `${sighting.howMany} birds`);
  return parts.join(" · ");
}

// Private places have no name or map pin, so they're counted in one line
// instead of listed: "Also seen at 51 private locations, most recently Nov 12".
// `sightings` are the private ones, newest first.
export function privateText(sightings, hasPublic, formatDate) {
  const count = sightings.length;
  const places = count === 1 ? "1 private location" : `${count} private locations`;
  const when = count === 1 ? `on ${formatDate(sightings[0].date)}` : `most recently ${formatDate(sightings[0].date)}`;
  return `${hasPublic ? "Also seen" : "Seen"} at ${places}, ${when}`;
}
