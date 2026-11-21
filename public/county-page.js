// County page, county.html?code=US-CA-073: one county's notable sightings
// from the last 7 or 30 days, with the map zoomed to the county, the top 5
// rarest birds, the top 3 rare bird hotspots, and the tier cards. Picking 7
// or 30 days reloads the sightings.

import { groupBySpecies, topRarest } from "./feed.js";
import { SEARCH_DAYS } from "./search.js";
import { $, el, choiceButtons, loadSpecies, updatedText, showError } from "./ui.js";
import { makeMap, showPins, addLegend } from "./map.js";
import { period, topItem, placesFor, fillList, showHotspots, setUpTiers } from "./notable-ui.js";

const TOP_COUNT = 5;
const HOTSPOT_COUNT = 3;

async function load() {
  const code = new URLSearchParams(location.search).get("code") ?? "";
  const [counties, bounds, species, forms, photos] = await Promise.all([
    fetch("data/ca_counties.json").then((r) => r.json()),
    fetch("data/ca_county_bounds.json").then((r) => r.json()),
    loadSpecies(),
    fetch("data/ca_species_forms.json").then((r) => r.json()),
    fetch("data/ca_species_photos.json").then((r) => r.json()),
  ]);
  const county = counties.find((c) => c.code === code);
  if (!county) {
    $("status").replaceChildren("We don't have that county. ", el("a", { href: "counties.html" }, "See all counties"));
    return;
  }

  const name = `${county.name} County`;
  document.title = `${name} · FlyWay California`;
  $("county-heading").textContent = `${name}, notable sightings`;
  const area = { region: code, phrase: `in ${name}`, bounds: bounds[code] };
  const mapParts = makeMap("map");
  addLegend(mapParts.map);
  const showTiers = setUpTiers();
  let days = SEARCH_DAYS[0];
  let latest = 0;  // only the newest request draws, if days change mid-load

  async function show() {
    $("days").replaceChildren(...choiceButtons(SEARCH_DAYS, days, (d) => `Last ${d} days`,
      (d) => { days = d; show(); }));
    const request = ++latest;
    const status = $("status");
    status.hidden = false;
    status.classList.remove("error");
    status.textContent = "Loading sightings…";
    const notable = await fetch(`/api/notable?${new URLSearchParams({ region: code, back: days })}`)
      .then((r) => r.json())
      .catch(() => ({ error: "Couldn't reach the server." }));
    if (request !== latest) return;
    if (notable.error) {
      showError(status, `Couldn't load sightings: ${notable.error}`);
      return;
    }

    const when = period(days);
    const groups = groupBySpecies(notable.sightings, species, forms);
    const places = placesFor(groups);
    const ctx = { mapParts, photos, places };
    showPins(mapParts, places, area);
    $("map-heading").textContent = `Notable sightings map, last ${days} days`;
    showHotspots(ctx, area, when, HOTSPOT_COUNT);
    $("top-heading").textContent = `Rarest Birds ${area.phrase} ${when.heading}`;
    fillList($("top"), topRarest(groups, TOP_COUNT).map((g) => topItem(g, ctx)), `No rare birds reported here ${when.span}.`);
    $("tier-heading").textContent = `Notable sightings, last ${days} days`;
    showTiers(groups, ctx);
    $("updated").textContent = updatedText(notable.fetchedAt);
    status.hidden = true;
  }

  await show();
}

load().catch((err) => {
  showError($("status"), `Couldn't load sightings: ${err.message}`);
});
