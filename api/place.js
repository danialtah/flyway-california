// GET /api/place?q=Pacific%20Grove: the location of a place in California,
// for the near-me search. Uses OpenStreetMap's Nominatim geocoder.
//
// - Only places inside California are returned.
// - Nominatim's usage policy asks for an identifying User-Agent, at most one
//   request a second, and caching, so answers are cached for a day.

const CACHE_SECONDS = 24 * 60 * 60;
const MAX_QUERY = 100;
const USER_AGENT = "FlyWayCalifornia/1.0 (non-commercial birding site)";
// west, north, east, south
const CALIFORNIA_BOX = "-124.5,42.1,-114.1,32.5";

export async function GET(request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > MAX_QUERY) return error(400, "Type a place name.");

  const params = new URLSearchParams({
    q, format: "jsonv2", limit: "1", countrycodes: "us", viewbox: CALIFORNIA_BOX, bounded: "1",
  });
  let res;
  try {
    res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`,
                      { headers: { "User-Agent": USER_AGENT } });
  } catch {
    return error(502, "Couldn't reach the place search.");
  }
  if (!res.ok) return error(502, `Place search failed (HTTP ${res.status}).`);

  const [hit] = await res.json();
  const place = hit
    ? { name: hit.name || hit.display_name.split(",")[0], lat: Number(hit.lat), lng: Number(hit.lon) }
    : null;
  return Response.json(
    { q, place },
    { headers: { "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=3600` } },
  );
}

function error(status, message) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
