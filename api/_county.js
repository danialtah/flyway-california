// Which California county a point is in, from the Census county outlines in
// public/data/ca_county_shapes.json (built by pipeline/build_county_shapes.py).
// The file starts with an underscore so Vercel doesn't serve it as an API
// route.

import shapes from "../public/data/ca_county_shapes.json" with { type: "json" };
import counties from "../public/data/ca_counties.json" with { type: "json" };

const NAMES = new Map(counties.map((c) => [c.code, c.name]));

// Even-odd rule over all of a county's rings, so islands count and holes don't.
function inside(rings, lng, lat) {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

// { countyCode, county } for a point. A point in no outline (offshore, or
// on a coast the outlines simplify away) gets the county with the nearest
// outline point.
export function countyAt(lat, lng) {
  let code = Object.keys(shapes).find((c) => inside(shapes[c], lng, lat));
  if (!code) {
    let best = Infinity;
    const cos = Math.cos((lat * Math.PI) / 180);
    for (const [c, rings] of Object.entries(shapes)) {
      for (const ring of rings) {
        for (const [x, y] of ring) {
          const d = ((x - lng) * cos) ** 2 + (y - lat) ** 2;
          if (d < best) { best = d; code = c; }
        }
      }
    }
  }
  return { countyCode: code, county: NAMES.get(code) };
}
