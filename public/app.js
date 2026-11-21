// Home page: loads this week's notable sightings from /api/notable and the
// species data from public/data, then draws the map, the top 10, the rare
// bird hotspots, and the tier cards, for all of California or near a point.
// The near-me and season filters redraw all four.
//
// The site search opens the home page near a place with ?lat=&lng=&name=
// (a hotspot) or ?place= (anything else, looked up like a typed place).

import { TOP_SIZES, groupBySpecies, topRarest, offeredSizes, inSeason } from "./feed.js";
import {
  $, el, choiceButtons, loadSpecies, updatedText, showError, RADIUS_MILES, nearArea, inArea,
} from "./ui.js";
import { makeMap, showPins, addLegend } from "./map.js";
import { period, topItem, placesFor, fillList, showHotspots, setUpTiers } from "./notable-ui.js";

const STATEWIDE = { region: "US-CA", phrase: "in California" };
const THIS_WEEK = period(7);

// A typed place -> { name, lat, lng } in California, or null if not found.
async function lookUpPlace(q) {
  const data = await fetch(`/api/place?${new URLSearchParams({ q })}`).then((r) => r.json());
  if (data.error) throw new Error(data.error);
  return data.place;
}

// Near-me controls: the visitor's location or a typed place, and a radius.
// Calls onChange() when the search point or radius changes.
function setUpNear(onChange) {
  let point = null;
  let miles = RADIUS_MILES[1];
  const say = (...parts) => $("near-status").replaceChildren(...parts);

  function render() {
    $("near-radius").replaceChildren(...choiceButtons(RADIUS_MILES, miles, (m) => `${m} miles`,
      (m) => { miles = m; render(); if (point) onChange(); }));
    if (!point) return;
    const clear = el("button", { type: "button" }, "Clear");
    clear.addEventListener("click", () => near.set(null));
    say(el("p", {}, `Showing sightings within ${miles} miles of ${point.name}. `
      + "Private locations aren't included because they have no map position. "), clear);
  }

  async function findPlace(q) {
    say(el("p", {}, `Looking up ${q}…`));
    try {
      const place = await lookUpPlace(q);
      if (!place) say(el("p", { class: "error" }, `Couldn't find "${q}" in California. Try a city or park name.`));
      else near.set(place);
    } catch (err) {
      say(el("p", { class: "error" }, `Couldn't look up that place: ${err.message}`));
    }
  }

  const near = {
    area: () => (point ? nearArea(point, miles) : null),
    set(newPoint) {
      point = newPoint;
      if (!point) say();
      render();
      onChange();
    },
    findPlace,
  };

  if (!navigator.geolocation) $("near-locate").hidden = true;
  $("near-locate").addEventListener("click", () => {
    say(el("p", {}, "Finding your location…"));
    navigator.geolocation.getCurrentPosition(
      (pos) => near.set({ name: "your location", lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => say(el("p", { class: "error" }, `Couldn't get your location: ${err.message}`)),
      { timeout: 10000, maximumAge: 5 * 60 * 1000 });
  });

  $("near-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const q = $("near-place").value.trim();
    if (q) findPlace(q);
  });

  render();
  return near;
}

// Start near the place in the address, if the site search sent one.
function startPlace(near) {
  const params = new URLSearchParams(location.search);
  if (params.has("lat") && params.get("name")) {
    const lat = Number(params.get("lat"));
    const lng = Number(params.get("lng"));
    if (Number.isFinite(lat) && Number.isFinite(lng)) near.set({ name: params.get("name"), lat, lng });
  } else if (params.get("place")) {
    $("near-place").value = params.get("place");
    near.findPlace(params.get("place"));
  }
}

async function load() {
  const [notable, species, forms] = await Promise.all([
    fetch("/api/notable").then((r) => r.json()),
    loadSpecies(),
    fetch("data/ca_species_forms.json").then((r) => r.json()),
  ]);
  if (notable.error) throw new Error(notable.error);

  const near = setUpNear(() => draw());
  const area = () => near.area() ?? STATEWIDE;
  const showTiers = setUpTiers();
  const mapParts = makeMap("map");
  addLegend(mapParts.map);

  // The chosen list size stays when the filters change; an area with fewer
  // birds just shows all it has.
  let topSize = TOP_SIZES[0];

  function sizeButtons(available) {
    const sizes = offeredSizes(available);
    if (sizes.length < 2) return [];
    return choiceButtons(sizes, topSize, String, (size) => { topSize = size; draw(); });
  }

  function draw() {
    const where = area();
    const season = $("season").value;
    const sightings = notable.sightings.filter((s) => inArea(s, where));
    const groups = groupBySpecies(sightings, species, forms)
      .filter((g) => inSeason(g, season));
    const places = placesFor(groups);
    showPins(mapParts, places, where);
    showHotspots(mapParts, places, where, THIS_WEEK);
    $("top-heading").textContent = `Rarest Birds ${where.phrase} ${THIS_WEEK.heading}`;
    const ranked = topRarest(groups, Infinity);  // leaves out escapees and hybrids
    $("top-sizes").replaceChildren(...sizeButtons(ranked.length));
    fillList($("top"), ranked.slice(0, topSize).map(topItem), "No rare birds reported here this week.");
    showTiers(groups, THIS_WEEK);
  }

  $("season").addEventListener("change", draw);
  draw();
  startPlace(near);

  $("updated").textContent = updatedText(notable.fetchedAt);
  $("status").hidden = true;
}

load().catch((err) => {
  showError($("status"), `Couldn't load sightings: ${err.message}`);
});
