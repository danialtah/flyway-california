// GET /api/suggest?q=bolsa: eBird hotspots in California whose name matches
// what the visitor is typing, for the site search. The key stays here on the
// server.
//
// - The hotspot list (about 19,000 places) comes from eBird once a day per
//   server instance and is matched here, so each keystroke doesn't reach eBird.
// - Names that start with the query come first, then names with a word that
//   does; ties go to the hotspot with the most checklists.
// - Responses are cached for a day.

import { normalize, matchScore, SUGGESTION_COUNT } from "../public/search.js";

const HOTSPOTS_URL = "https://api.ebird.org/v2/ref/hotspot/US-CA?fmt=json";
const LIST_MAX_AGE = 24 * 60 * 60 * 1000;
const CACHE_SECONDS = 24 * 60 * 60;
const QUERY_LENGTH = { min: 2, max: 60 };

let hotspots = null;  // { loadedAt, list: Promise of [{ name, countyCode, lat, lng, checklists }] }

function loadHotspots(key) {
  if (hotspots && Date.now() - hotspots.loadedAt < LIST_MAX_AGE) return hotspots.list;
  const list = fetch(HOTSPOTS_URL, { headers: { "X-eBirdApiToken": key } })
    .then((res) => {
      if (!res.ok) throw new Error(`eBird request failed (HTTP ${res.status}).`);
      return res.json();
    })
    .then((all) => all.map((h) => ({
      name: h.locName, countyCode: h.subnational2Code, lat: h.lat, lng: h.lng,
      checklists: h.numChecklistsAllTime ?? 0,
    })));
  hotspots = { loadedAt: Date.now(), list };
  list.catch(() => { hotspots = null; });  // try again on the next request
  return list;
}

export async function GET(request) {
  const raw = new URL(request.url).searchParams.get("q") ?? "";
  if (raw.length > QUERY_LENGTH.max) return error(400, `The search can be up to ${QUERY_LENGTH.max} characters.`);
  const q = normalize(raw);
  if (q.length < QUERY_LENGTH.min) return error(400, `The search needs at least ${QUERY_LENGTH.min} characters.`);

  const key = process.env.EBIRD_API_KEY;
  if (!key) return error(500, "The server is missing EBIRD_API_KEY.");

  let list;
  try {
    list = await loadHotspots(key);
  } catch {
    return error(502, "Couldn't load eBird hotspots.");
  }

  const places = list
    .map((h) => ({ h, score: matchScore(h.name, q) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => a.score - b.score || b.h.checklists - a.h.checklists)
    .slice(0, SUGGESTION_COUNT)
    .map(({ h }) => ({ name: h.name, countyCode: h.countyCode, lat: h.lat, lng: h.lng }));

  return Response.json({ q: raw, places },
    { headers: { "Cache-Control": `public, s-maxage=${CACHE_SECONDS}` } });
}

function error(status, message) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
