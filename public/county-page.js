// County page, county.html?code=US-CA-073, from the Figma frame "County page
// · San Diego · Desktop (1440)": one county's notable sightings from the last
// 7 or 30 days, with the map zoomed to the county, the top 5 rarest birds,
// the top 3 rare bird hotspots, and the notable list. Picking 7 or 30 days
// reloads the sightings.

import { groupBySpecies, topRarest } from "./feed.js";
import { SEARCH_DAYS } from "./search.js";
import { $, el, choiceButtons, loadSpecies, showError, plural, timeText, dateTimeText, titleCase } from "./ui.js";
import { makeMap, showPins, addLegend } from "./map.js";
import { period, topItem, placesFor, fillList, showHotspots, setUpTiers } from "./notable-ui.js";

const TOP_COUNT = 5;
const HOTSPOT_COUNT = 3;

// Everything under the heading, hidden for an unknown county.
const SECTIONS = ["days", "map-frame", "top-section", "hotspots-section", "notable-section"];

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
    for (const id of SECTIONS) $(id).hidden = true;
    $("county-heading").parentElement.hidden = true;
    $("status").className = "page-status";
    $("status").replaceChildren(el("span", { class: "error" }, "Unfortunately, we do not currently have data on that county."),
      el("a", { class: "back-link", href: "counties.html" }, el("span", { class: "label" }, "See all counties")));
    return;
  }

  const name = `${county.name} County`;
  document.title = `${name} · FlyWay California`;
  $("county-heading").textContent = name;
  const area = { region: code, phrase: `in ${name}`, bounds: bounds[code] };
  const mapParts = makeMap("map");
  addLegend(mapParts.map);
  const showTiers = setUpTiers();
  let days = SEARCH_DAYS[0];
  let latest = 0;  // only the newest request draws, if days change mid-load

  async function show() {
    $("days").replaceChildren(...choiceButtons(SEARCH_DAYS, days, (d) => `Last ${d} days`,
      (d) => { days = d; show(); }, "pill chip"));
    $("county-intro").textContent = `Rare and notable birds reported in ${name} in the last ${days} days. Data from eBird.`;
    $("hotspots-intro").textContent = `eBird hotspots with the most confirmed rare birds in the last ${days} days. `
      + "Ties go to the most notable birds overall.";
    const request = ++latest;
    const status = $("status");
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
    const ctx = { mapParts, photos, places, inCounty: true, emptyText: `No notable birds reported ${area.phrase} ${when.span}.` };
    const count = groups.reduce((n, g) => n + g.sightings.length, 0);
    const counts = `${plural(count, "notable sighting")} of ${plural(groups.length, "species", "species")}`;
    status.replaceChildren(el("span", { class: "count" }, count ? `${counts}.` : `No notable sightings in the last ${days} days.`),
      el("span", { class: "hint" }, `Map shows ${name}. · Updated ${timeText(notable.fetchedAt)}`));
    showPins(mapParts, places, area);
    showHotspots(ctx, area, when, HOTSPOT_COUNT);
    $("top-heading").textContent = `Rarest Birds ${titleCase(area.phrase)} ${when.heading}`;
    fillList($("top"), topRarest(groups, TOP_COUNT).map((g) => topItem(g, ctx)), `No rare birds reported ${area.phrase} ${when.span}.`);
    $("tier-heading").textContent = `Notable Sightings ${when.heading}`;
    $("tier-summary").textContent = `${plural(count, "sighting")} of ${plural(groups.length, "species", "species")} ${area.phrase}, `
      + "grouped by how rare they are in California.";
    $("tier-summary").hidden = !count;  // the list's note says there are none
    showTiers(groups, ctx);
    $("updated").textContent = dateTimeText(notable.fetchedAt);
    $("updated-wrap").hidden = false;
  }

  await show();
}

load().catch((err) => {
  showError($("status"), `Couldn't load sightings: ${err.message}`);
});
