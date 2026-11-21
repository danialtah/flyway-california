// GET /api/species?code=comloo&region=US-CA-001&back=7: recent confirmed
// sightings of one species in California or one county, from the eBird API.
// Or, for the near-me search, around a point in California:
// /api/species?code=comloo&lat=37.87&lng=-122.27&dist=16&back=7 (dist in km).
// eBird returns the species' latest sighting at each place. The key stays here
// on the server.
//
// - Only species codes, California regions or points, distances up to
//   eBird's 50 km, and 7 or 30 days are accepted, so this can't be used to
//   make other eBird calls with the key.
// - Unconfirmed reports are left out, and each place appears once.
// - Private locations keep no place name or coordinates.
// - Responses are cached for 15 minutes.

const DAYS_BACK = [7, 30];
const CACHE_SECONDS = 15 * 60;
const SPECIES_CODE = /^[a-z0-9]{4,10}$/;
const CA_REGION = /^US-CA(-\d{3})?$/;
const CA_BOX = { south: 32.5, north: 42.1, west: -124.5, east: -114.1 };
const MAX_KM = 50;

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code") ?? "";
  const region = params.get("region") || "US-CA";
  const back = Number(params.get("back") || DAYS_BACK[0]);
  if (!SPECIES_CODE.test(code)) return error(400, "Unknown species code.");
  if (!DAYS_BACK.includes(back)) return error(400, `Days back must be ${DAYS_BACK.join(" or ")}.`);

  let where;
  if (params.has("lat")) {
    // Rounded to about 1 km, which is plenty for a radius search.
    const lat = Math.round(Number(params.get("lat")) * 100) / 100;
    const lng = Math.round(Number(params.get("lng")) * 100) / 100;
    const dist = Number(params.get("dist"));
    if (!(lat >= CA_BOX.south && lat <= CA_BOX.north && lng >= CA_BOX.west && lng <= CA_BOX.east)) {
      return error(400, "The point must be in California.");
    }
    if (!Number.isInteger(dist) || dist < 1 || dist > MAX_KM) return error(400, `Distance must be 1 to ${MAX_KM} km.`);
    where = { path: `geo/recent/${code}`, query: `&lat=${lat}&lng=${lng}&dist=${dist}`, echo: { lat, lng, dist } };
  } else {
    if (!CA_REGION.test(region)) return error(400, "Region must be California or a California county.");
    where = { path: `${region}/recent/${code}`, query: "", echo: { region } };
  }

  const key = process.env.EBIRD_API_KEY;
  if (!key) return error(500, "The server is missing EBIRD_API_KEY.");

  let res;
  try {
    res = await fetch(`https://api.ebird.org/v2/data/obs/${where.path}?back=${back}${where.query}`,
                      { headers: { "X-eBirdApiToken": key } });
  } catch {
    return error(502, "Couldn't reach eBird.");
  }
  if (res.status === 400) return error(400, "Unknown species code.");
  if (!res.ok) return error(502, `eBird request failed (HTTP ${res.status}).`);

  // eBird already sends one sighting per place; the locId check makes sure, so
  // the page can count private places without repeats.
  const places = new Set();
  const sightings = (await res.json())
    .filter((o) => o.obsValid && !places.has(o.locId) && places.add(o.locId))
    .map((o) => {
      const isPrivate = Boolean(o.locationPrivate);
      return {
        date: o.obsDt,
        howMany: o.howMany ?? null,
        private: isPrivate,
        locId: isPrivate ? null : o.locId,
        locName: isPrivate ? null : o.locName,
        lat: isPrivate ? null : o.lat,
        lng: isPrivate ? null : o.lng,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return Response.json(
    { fetchedAt: new Date().toISOString(), code, ...where.echo, daysBack: back, sightings },
    { headers: { "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=60` } },
  );
}

function error(status, message) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
