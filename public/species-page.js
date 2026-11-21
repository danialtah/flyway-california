// Species page, species.html?code=calcon: names, badges, status line,
// migration type, the 12-month strip, and recent sightings with a map.
// Picking a county or a number of days reloads the sightings.

import { MONTHS, MIGRATION_LABELS, formatDate } from "./feed.js";
import { SEARCH_DAYS } from "./search.js";
import { monthsIn, noSeasonText } from "./months.js";
import { makeMap, showPins, markerGroup } from "./map.js";
import {
  $, el, showError, badges, choiceButtons, loadSpecies, loadCounties, countyArea, showSightings, updatedText,
} from "./ui.js";

function fillMonths(s) {
  if (!s.occupied_months) {
    $("months-text").textContent = noSeasonText(s);
    $("months").hidden = true;
    return;
  }
  $("months-text").textContent = s.occupied_months === "all year"
    ? "In California all year."
    : `In California ${s.occupied_months}.`;
  $("months").replaceChildren(...monthsIn(s.occupied_months).map((on, i) =>
    el("li", { "data-present": String(on) }, `${MONTHS[i]} ${on ? "●" : "○"}`)));
}

async function load() {
  const code = new URLSearchParams(location.search).get("code") ?? "";
  const select = $("county");
  const [species, photos] = await Promise.all([
    loadSpecies(), fetch("data/ca_species_photos.json").then((r) => r.json()), loadCounties(select),
  ]);
  const s = species.get(code);
  if (!s) {
    $("status").replaceChildren("We don't have that bird. ", el("a", { href: "./" }, "Back to FlyWay California"));
    return;
  }

  document.title = `${s.common_name} · FlyWay California`;
  const ebirdUrl = `https://ebird.org/species/${encodeURIComponent(code)}`;
  // More photos come from iNaturalist (where the page's photo is from); eBird
  // already shows photos on its own species page.
  const taxonId = photos[code]?.taxon_id;
  $("photo").href = taxonId
    ? `https://www.inaturalist.org/taxa/${taxonId}/browse_photos`
    : `https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(s.scientific_name)}`;
  $("ebird-link").href = ebirdUrl;
  $("name").textContent = s.common_name;
  $("sci").textContent = s.scientific_name;
  $("badges").replaceChildren(...badges({ species: s }).filter(Boolean));
  $("status-line").textContent = s.status_line;
  $("migration-type").textContent = MIGRATION_LABELS[s.migration_type] ?? "";
  $("migration-type").hidden = !MIGRATION_LABELS[s.migration_type];
  fillMonths(s);

  $("status").hidden = true;
  $("species").hidden = false;
  const mapParts = makeMap("map");  // after unhiding, so Leaflet can measure the map

  let days = SEARCH_DAYS[0];
  async function showRecent() {
    const area = countyArea(select);
    $("sightings-heading").textContent = `Recent sightings ${area.phrase}`;
    $("days").replaceChildren(...choiceButtons(SEARCH_DAYS, days, (d) => `Last ${d} days`,
      (d) => { days = d; showRecent(); }));
    const { places, fetchedAt } = await showSightings($("sightings"), code, area, days);
    if (fetchedAt) $("updated").textContent = updatedText(fetchedAt);
    const group = markerGroup(s);
    showPins(mapParts, places.map((p) => ({
      lat: p.lat, lng: p.lng, group, popup: el("div", {}, `${p.locName} · ${formatDate(p.date)}`),
    })));
  }
  select.addEventListener("change", showRecent);
  showRecent();
}

load().catch((err) => {
  showError($("status"), `Couldn't load this bird: ${err.message}`);
});
