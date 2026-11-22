// Home page: loads this week's notable sightings from /api/notable and the
// species data from public/data, then draws the map, the rarest birds, the
// rare bird hotspots, and the notable list, for all of California or near a
// point. The location, radius and season controls redraw all four.
//
// The site search opens the home page near a place with ?lat=&lng=&name=
// (a hotspot) or ?place= (anything else, looked up like a typed place).

import { TOP_SIZES, groupBySpecies, topRarest, offeredSizes, inSeason } from "./feed.js";
import {
  $, el, choiceButtons, loadSpecies, showError, RADIUS_MILES, nearArea, inArea, dropdown,
  timeText, dateTimeText,
} from "./ui.js";
import { makeMap, showPins, addLegend } from "./map.js";
import { period, topItem, placesFor, fillList, showHotspots, setUpTiers } from "./notable-ui.js";

const STATEWIDE = { region: "US-CA", phrase: "in California" };
const THIS_WEEK = period(7);
const DEFAULT_MILES = 25;

const SEASONS = [
  { value: "", text: "All birds" },
  { value: "year-round", text: "Year-round birds" },
  { value: "winter visitor", text: "Winter visitors" },
  { value: "summer visitor", text: "Summer visitors" },
  { value: "migrant", text: "Migrants" },
  { value: "vagrant", text: "Rare visitors / vagrants" },
];

// A typed place -> { name, lat, lng } in California, or null if not found.
async function lookUpPlace(q) {
  const data = await fetch(`/api/place?${new URLSearchParams({ q })}`).then((r) => r.json());
  if (data.error) throw new Error(data.error);
  return data.place;
}

// The line under the controls: where the page is showing, a hint or a
// message (looking up a place, an error), and when the data was fetched.
function statusLine() {
  let point = null, miles = DEFAULT_MILES, message = null, updated = null, onClear = null;

  function render() {
    const parts = point
      ? [el("span", { class: "where-now" }, `Showing birds within ${miles} miles of ${point.name}.`)]
      : [el("span", { class: "where-now" }, "Showing all of California.")];
    if (message) parts.push(el("span", { class: message.error ? "error" : "hint" }, message.text));
    else if (point) {
      const clear = el("button", { type: "button", class: "text-button" }, el("span", { class: "label" }, "Show all of California"));
      clear.addEventListener("click", onClear);
      parts.push(el("span", { class: "hint" }, "Private locations aren't included."), clear);
    } else parts.push(el("span", { class: "hint" }, "Pick a place to see birds near you."));
    if (updated) parts.push(el("span", { class: "hint" }, `·  Updated ${timeText(updated)}`));
    $("status").classList.remove("error");
    $("status").replaceChildren(...parts);
  }

  return {
    set(changes) { ({ point = point, miles = miles, updated = updated, onClear = onClear } = changes); message = changes.message ?? null; render(); },
    say(text, error = false) { message = { text, error }; render(); },
  };
}

// Location controls: the visitor's location or a typed place, and a radius.
// Calls onChange() when the search point or radius changes.
function setUpNear(status, onChange) {
  let point = null;
  let miles = DEFAULT_MILES;

  // "Use my location" stays pressed (sky blue) while it's finding the
  // visitor's location and while the page shows birds near it. Pressing it
  // again goes back to all of California. The radius can only be picked
  // while there's a place to measure from.
  let finding = 0;  // bumped on each press, so a late answer to an old press is ignored
  const usingLocation = () => point?.name === "your location";
  const pressed = (on) => $("near-locate").setAttribute("aria-pressed", String(on));

  const near = {
    area: () => (point ? nearArea(point, miles) : null),
    set(newPoint) {
      finding++;
      point = newPoint;
      pressed(usingLocation());
      radius.disable(!point);
      status.set({ point, miles });
      onChange();
    },
    async findPlace(q) {
      status.say(`Looking up ${q}…`);
      try {
        const place = await lookUpPlace(q);
        if (!place) status.say(`Couldn't find "${q}" in California. Try a city or park name.`, true);
        else near.set(place);
      } catch (err) {
        status.say(`Couldn't look up that place: ${err.message}`, true);
      }
    },
  };

  const radius = dropdown($("radius"), {
    options: RADIUS_MILES.map((m) => ({ value: m, text: `Within ${m} miles` })),
    value: miles,
    label: (o) => o.text,
    onPick(m) { miles = m; status.set({ point, miles }); if (point) onChange(); },
  });
  radius.disable(true);

  if (!navigator.geolocation) $("near-locate").hidden = true;
  $("near-locate").addEventListener("click", () => {
    if ($("near-locate").getAttribute("aria-pressed") === "true") {
      if (usingLocation()) near.set(null);
      else { finding++; pressed(false); status.set({}); }  // still finding: stop waiting
      return;
    }
    const request = ++finding;
    pressed(true);
    status.say("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (request !== finding) return;
        $("near-place").value = "";
        near.set({ name: "your location", lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        if (request !== finding) return;
        pressed(usingLocation());
        status.say(`Couldn't get your location: ${err.message}`, true);
      },
      { timeout: 10000, maximumAge: 5 * 60 * 1000 });
  });

  $("near-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const q = $("near-place").value.trim();
    if (q) near.findPlace(q);
  });

  status.set({ onClear: () => { $("near-place").value = ""; near.set(null); } });
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
  const [notable, species, forms, photos] = await Promise.all([
    fetch("/api/notable").then((r) => r.json()),
    loadSpecies(),
    fetch("data/ca_species_forms.json").then((r) => r.json()),
    fetch("data/ca_species_photos.json").then((r) => r.json()),
  ]);
  if (notable.error) throw new Error(notable.error);

  const status = statusLine();
  const near = setUpNear(status, () => draw());
  const area = () => near.area() ?? STATEWIDE;
  const showTiers = setUpTiers();
  const mapParts = makeMap("map");
  addLegend(mapParts.map);
  let season = "";

  dropdown($("season"), {
    options: SEASONS,
    value: season,
    label: (o) => `Season: ${o.text}`,
    onPick(value) { season = value; draw(); },
  });

  // The chosen list size stays when the filters change; an area with fewer
  // birds just shows all it has.
  let topSize = TOP_SIZES[0];

  function sizeButtons(available) {
    const sizes = offeredSizes(available);
    if (sizes.length < 2) return [];
    return [el("span", { class: "label" }, "Show"),
      ...choiceButtons(sizes, topSize, (n) => `Top ${n}`, (size) => { topSize = size; draw(); }, "pill pill-sm")];
  }

  function draw() {
    const where = area();
    const sightings = notable.sightings.filter((s) => inArea(s, where));
    const groups = groupBySpecies(sightings, species, forms).filter((g) => inSeason(g, season));
    const places = placesFor(groups);
    const ctx = { mapParts, photos, places, emptyText: `No notable birds reported ${where.phrase} ${THIS_WEEK.span}.` };
    showPins(mapParts, places, where);
    showHotspots(ctx, where, THIS_WEEK);
    $("top-heading").textContent = `Rarest Birds ${where.phrase} ${THIS_WEEK.heading}`;
    const ranked = topRarest(groups, Infinity);  // leaves out escapees and hybrids
    $("top-sizes").replaceChildren(...sizeButtons(ranked.length));
    fillList($("top"), ranked.slice(0, topSize).map((g) => topItem(g, ctx)), `No rare birds reported ${where.phrase} ${THIS_WEEK.span}.`);
    $("tier-heading").textContent = `Notable Sightings ${THIS_WEEK.heading}`;
    const count = groups.reduce((n, g) => n + g.sightings.length, 0);
    $("tier-summary").textContent = `${count.toLocaleString("en-US")} sightings of ${groups.length.toLocaleString("en-US")} species, `
      + "grouped by how rare they are in California.";
    $("tier-summary").hidden = !count;  // the list's note says there are none
    showTiers(groups, ctx);
  }

  status.set({ updated: notable.fetchedAt });
  draw();
  startPlace(near);

  $("updated").textContent = dateTimeText(notable.fetchedAt);
  $("updated-wrap").hidden = false;
}

load().catch((err) => {
  showError($("status"), `Couldn't load sightings: ${err.message}`);
});
