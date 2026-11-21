// GET /api/notable: confirmed notable California sightings from the last 7
// (or 30) days, from the eBird API. The eBird key stays here on the server; the
// browser only gets the trimmed list below. For a county page:
// /api/notable?region=US-CA-073&back=30.
//
// - Only California or a California county, and 7 or 30 days, are accepted,
//   so this can't be used to make other eBird calls with the key.
// - Unconfirmed reports are left out.
// - eBird repeats some sightings; each obsId is kept once.
// - Observer names are never sent.
// - Private locations keep only their county: no place name or coordinates.
// - Responses are cached for 15 minutes.

const DAYS_BACK = [7, 30];
const CACHE_SECONDS = 15 * 60;
const CA_REGION = /^US-CA(-\d{3})?$/;

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const region = params.get("region") || "US-CA";
  const back = Number(params.get("back") || DAYS_BACK[0]);
  if (!CA_REGION.test(region)) return error(400, "Region must be California or a California county.");
  if (!DAYS_BACK.includes(back)) return error(400, `Days back must be ${DAYS_BACK.join(" or ")}.`);

  const key = process.env.EBIRD_API_KEY;
  if (!key) return error(500, "The server is missing EBIRD_API_KEY.");

  let res;
  try {
    res = await fetch(`https://api.ebird.org/v2/data/obs/${region}/recent/notable?back=${back}&detail=full`,
                      { headers: { "X-eBirdApiToken": key } });
  } catch {
    return error(502, "Couldn't reach eBird.");
  }
  if (!res.ok) return error(502, `eBird request failed (HTTP ${res.status}).`);

  const seen = new Set();
  const sightings = [];
  for (const o of await res.json()) {
    if (!o.obsValid || seen.has(o.obsId)) continue;
    seen.add(o.obsId);
    const isPrivate = Boolean(o.locationPrivate);
    sightings.push({
      speciesCode: o.speciesCode,
      comName: o.comName,
      sciName: o.sciName,
      date: o.obsDt,
      howMany: o.howMany ?? null,
      countyCode: o.subnational2Code,
      county: o.subnational2Name,
      private: isPrivate,
      locId: isPrivate ? null : o.locId,
      locName: isPrivate ? null : o.locName,
      lat: isPrivate ? null : o.lat,
      lng: isPrivate ? null : o.lng,
    });
  }

  return Response.json(
    { fetchedAt: new Date().toISOString(), region, daysBack: back, sightings },
    { headers: { "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=60` } },
  );
}

function error(status, message) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
