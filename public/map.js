// Leaflet map code shared by the home page map and the species page map.
// Leaflet itself loads from a <script> tag as the global L.

import { el } from "./ui.js";
import { isOffList } from "./feed.js";

const CALIFORNIA = { center: [37.2, -119.5], zoom: 5 };
const PIN_ZOOM = 10;  // zoom for a single pin
const RADIUS = 7;
const OUTLINE = "#FFFFFF";
const METERS_PER_MILE = 1609.344;
const CIRCLE_COLOR = "#5E574A";  // the map's label color
// Popups are 280px cards (Figma "Map popup"): 16px padding left, 12px right,
// so 252px of content. Leaflet adds 1px to the width it's given.
const POPUP = { minWidth: 251, maxWidth: 251 };

// Marker look for each group, with its label in the map legend. Later
// entries draw on top, so rarer birds are never hidden under common ones, and
// a place with several birds gets the marker of the latest entry among them.
// Escapees are diamonds, which Leaflet draws above every circle.
export const MARKERS = {
  Common:   { color: "#5B7083", shape: "circle",  label: "Common" },
  Uncommon: { color: "#9A6A00", shape: "circle",  label: "Uncommon" },
  Rare:     { color: "#D9342B", shape: "circle",  label: "Rare" },
  noTier:   { color: "#B0186B", shape: "ring",    label: "Rare (no seasonal data)" },
  escapee:  { color: "#B85CD2", shape: "diamond", label: "Escapee or non-native" },
};
const DRAW_ORDER = Object.keys(MARKERS);

// Which marker a species gets: escapee, its tier, or noTier.
export function markerGroup(species) {
  if (isOffList({ species })) return "escapee";
  return species.tier || "noTier";
}

function marker(latLng, group) {
  const { color, shape } = MARKERS[group];
  if (shape === "diamond") {
    return L.marker(latLng, {
      icon: L.divIcon({ className: "marker-diamond", iconSize: [18, 18],
                        html: `<span style="--color: ${color}"></span>` }),
    });
  }
  if (shape === "ring") {
    // A dashed ring with a hollow center, over a solid white ring as its outline.
    return L.featureGroup([
      L.circleMarker(latLng, { radius: RADIUS, color: OUTLINE, weight: 5, fill: false }),
      L.circleMarker(latLng, { radius: RADIUS, color, weight: 3, dashArray: "4 3",
                               fill: true, fillOpacity: 0 }),
    ]);
  }
  return L.circleMarker(latLng, { radius: RADIUS, color: OUTLINE, weight: 2,
                                  fillColor: color, fillOpacity: 1 });
}

// Map colors: water and greenery keep their OpenStreetMap colors; everything
// else (land, roads, buildings, labels) becomes a shade of one neutral.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const NEUTRAL = [0xF6, 0xF1, 0xDF];  // what OpenStreetMap's land color becomes
const INK = [0x5E, 0x57, 0x4A];      // what black becomes (labels, borders)
const LAND_LUMA = luma(0xF2, 0xEF, 0xE9);  // OpenStreetMap's land color
const KEEP_HUES = [[75, 170], [175, 230]];  // greens; water blues
const MIN_SATURATION = 0.12;  // below this a pixel counts as gray, whatever its hue

function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function hueAndSaturation(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return [0, 0];
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, d / max];
}

const mix = (from, to, t, i) => from[i] + (to[i] - from[i]) * t;

// Recolor RGBA pixel data in place. Neutral pixels keep their lightness:
// OpenStreetMap's land becomes NEUTRAL, lighter pixels (minor roads) head
// toward white, and darker ones (labels, borders) toward INK.
export function recolor(data) {
  const WHITE = [255, 255, 255];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [hue, sat] = hueAndSaturation(r, g, b);
    if (sat >= MIN_SATURATION && KEEP_HUES.some(([lo, hi]) => hue >= lo && hue <= hi)) continue;
    const y = luma(r, g, b);
    const [from, to, t] = y >= LAND_LUMA
      ? [NEUTRAL, WHITE, (y - LAND_LUMA) / (255 - LAND_LUMA)]
      : [INK, NEUTRAL, y / LAND_LUMA];
    for (let c = 0; c < 3; c++) data[i + c] = mix(from, to, t, c);
  }
}

// OpenStreetMap tiles drawn through a canvas so they can be recolored. The
// tile server allows this (it sends Access-Control-Allow-Origin: *).
function recoloredTiles(options) {
  const Layer = L.GridLayer.extend({
    createTile(coords, done) {
      const canvas = document.createElement("canvas");
      const size = this.getTileSize();
      canvas.width = size.x;
      canvas.height = size.y;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, size.x, size.y);
        recolor(pixels.data);
        ctx.putImageData(pixels, 0, 0);
        done(null, canvas);
      };
      img.onerror = (err) => done(err, canvas);
      img.src = L.Util.template(TILE_URL, coords);
      return canvas;
    },
  });
  return new Layer(options);
}

// The credit shows in the map corner.
export function makeMap(id) {
  const map = L.map(id).setView(CALIFORNIA.center, CALIFORNIA.zoom);
  recoloredTiles({
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  return { map, pins: L.layerGroup().addTo(map) };
}

// One pin per named place: { lat, lng, group, popup }, where popup is an
// element, never an HTML string, because place names come from eBird users.
// Each place gets its pin as `marker`, for openPin.
// With a near-me `area`, the map also shows the search circle and zooms to
// it; an area with `bounds` (a county page) zooms to those; otherwise it zooms
// to fit the pins.
export function showPins(mapParts, places, area = null) {
  const { map, pins } = mapParts;
  pins.clearLayers();
  mapParts.circle?.remove();
  mapParts.circle = null;
  const points = places
    .filter((p) => p.lat != null && p.lng != null)
    .sort((a, b) => DRAW_ORDER.indexOf(a.group) - DRAW_ORDER.indexOf(b.group));
  for (const p of points) {
    p.marker = marker([p.lat, p.lng], p.group).bindPopup(p.popup, POPUP).addTo(pins);
  }
  if (area?.point) {
    mapParts.circle = L.circle([area.point.lat, area.point.lng], {
      radius: area.miles * METERS_PER_MILE, color: CIRCLE_COLOR, weight: 2, dashArray: "6 4",
      fillOpacity: 0.05, interactive: false,
    }).addTo(map);
    map.fitBounds(mapParts.circle.getBounds());
  } else if (area?.bounds) map.fitBounds(area.bounds);
  else if (points.length === 1) map.setView([points[0].lat, points[0].lng], PIN_ZOOM);
  else if (points.length) map.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [20, 20] });
  else map.setView(CALIFORNIA.center, CALIFORNIA.zoom);
}

// Zoom to a place drawn by showPins and open its popup.
export function openPin({ map }, place) {
  map.setView([place.lat, place.lng], PIN_ZOOM);
  place.marker.openPopup([place.lat, place.lng]);
}

// A small copy of a group's marker, for the legend and the tier cards.
export function swatch(group) {
  const { color, shape } = MARKERS[group];
  return el("span", { class: `swatch swatch-${shape}`, style: `--color: ${color}` });
}

// The map key, in the map's bottom-left corner: rarest first, escapees last.
const LEGEND_ORDER = ["noTier", "Rare", "Uncommon", "Common", "escapee"];
export function addLegend(map) {
  const items = () => LEGEND_ORDER.map((group) => el("div", {}, swatch(group), MARKERS[group].label));
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = () => el("div", { class: "map-legend" }, el("span", { class: "title" }, "Map key"), ...items());
  legend.addTo(map);
  // On phones the key is a panel along the bottom of the map's frame instead
  // (site.css shows one or the other).
  map.getContainer().closest(".map-frame")?.append(el("div", { class: "map-key-mobile", "aria-hidden": "true" },
    el("span", { class: "title" }, "Legend"), el("div", { class: "items" }, ...items())));
}

// Named places from groupBySpecies groups: each place lists the birds seen
// there (the latest report of each, rarest first) and takes the marker of its
// rarest bird. Hybrids have no species page or tier, so they're listed but
// don't set the marker; a place with only hybrids gets the Common marker.
// Private places have no coordinates and are left out.
export function groupByPlace(groups) {
  const rank = (group) => (group ? DRAW_ORDER.indexOf(group) : -1);
  const places = new Map();
  for (const bird of groups) {
    const group = bird.species ? markerGroup(bird.species) : null;
    const seenAt = new Set();
    for (const s of bird.sightings) {  // newest first
      if (s.private || seenAt.has(s.locId)) continue;
      seenAt.add(s.locId);
      let place = places.get(s.locId);
      if (!place) {
        place = { locId: s.locId, locName: s.locName, county: s.county, lat: s.lat, lng: s.lng, birds: [] };
        places.set(s.locId, place);
      }
      place.birds.push({ bird, group, sighting: s });
    }
  }
  return [...places.values()].map((place) => {
    place.birds.sort((a, b) => rank(b.group) - rank(a.group) || a.bird.comName.localeCompare(b.bird.comName));
    return { ...place, group: place.birds[0].group ?? "Common" };
  });
}

// The best groupByPlace places for rare birds: at least HOTSPOT_MIN_RARE rare
// species (Rare, no seasonal data, or CBRC review), most rare species first,
// then most notable species. Every named place is an eBird hotspot: eBird
// marks personal locations private, and those have no place name.
const HOTSPOT_MIN_RARE = 2;
export const HOTSPOT_COUNT = 6;

export function isRareBird({ bird, group }) {
  return group === "Rare" || group === "noTier" || bird.species?.cbrc_review === "true";
}

export function topHotspots(places, count = HOTSPOT_COUNT) {
  return places
    .map((place) => ({ place, rare: place.birds.filter(isRareBird) }))
    .filter(({ rare }) => rare.length >= HOTSPOT_MIN_RARE)
    .sort((a, b) =>
      b.rare.length - a.rare.length ||
      b.place.birds.length - a.place.birds.length ||
      a.place.locName.localeCompare(b.place.locName))
    .slice(0, count);
}
