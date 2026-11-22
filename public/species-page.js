// Species page, species.html?code=bawwar, from the Figma frame "Species Page -
// WORKING VERSION": the photo, names, rarity tags, status line and facts;
// the 12-month timeline; and recent sightings with a county menu, 7 or 30
// days, a map, and a card for each place. Picking a county or a number of
// days reloads the sightings.

import { MONTHS, MIGRATION_LABELS, formatDate, withoutTier } from "./feed.js";
import { SEARCH_DAYS, privateText } from "./search.js";
import { monthsIn, noSeasonText } from "./months.js";
import { birdsPopup } from "./notable-ui.js";
import { MARKERS, makeMap, showPins, markerGroup, openPin } from "./map.js";
import {
  $, el, showError, choiceButtons, loadSpecies, dropdown, plural, directionsLink, showOnMapButton,
  creditParts, photoBox, timeText, dateTimeText, monthItems, FULL_MONTHS,
} from "./ui.js";

const CARDS_SHOWN = 6;  // place cards before "Show all N places"
const STATEWIDE = { region: "US-CA", phrase: "in California" };

// "Apr-May, Sep-Feb" -> "April–May and September–February".
function monthsText(occupied) {
  const parts = occupied.split(", ").map((part) =>
    part.split("-").map((m) => FULL_MONTHS[MONTHS.indexOf(m)]).join("–"));
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
}

// /api/species for one area and number of days.
async function fetchSightings(code, area, days) {
  const params = new URLSearchParams({ code, region: area.region, back: days });
  const data = await fetch(`/api/species?${params}`).then((r) => r.json());
  if (data.error) throw new Error(data.error);
  return data;
}

const countyText = (s) => (s.county ? `${s.county} County` : "");

// Rarity tags: the tier (or escapee, or no seasonal data) with its map
// color, and CBRC review species get a second tag.
function tags(s) {
  const group = markerGroup(s);
  const text = group === "escapee" ? MARKERS.escapee.label
    : s.tier ? `${s.tier} in California` : "No seasonal data";
  const tag = (...children) => el("span", { class: "tag" }, ...children);
  return [
    tag(el("span", { class: "dot", style: `--color: ${MARKERS[group].color}`, "aria-hidden": "true" }), text),
    s.cbrc_review === "true" ? tag("CBRC review species") : null,
  ];
}

function fact(label, value) {
  return el("div", { class: "fact" }, el("dt", {}, label), el("dd", {}, value));
}

// "Last seen" and "This week" come from the last 30 days in all of
// California, whatever the sightings section below shows.
function fillFacts(s, recent) {
  const rows = [];
  if (MIGRATION_LABELS[s.migration_type]) rows.push(fact("Seasonal pattern", MIGRATION_LABELS[s.migration_type]));
  rows.push(fact("In California", !s.occupied_months ? "No seasonal data"
    : s.occupied_months === "all year" ? "All year" : monthsText(s.occupied_months)));
  if (recent) {
    const [latest] = recent.sightings;  // newest first
    const where = latest?.private ? "a private location" : latest?.locName;
    rows.push(fact("Last seen", latest
      ? [`${formatDate(latest.date)} at ${where}`, countyText(latest)].filter(Boolean).join(", ")
      : `Not reported in the last ${SEARCH_DAYS[1]} days`));
    const weekAgo = Date.now() - SEARCH_DAYS[0] * 24 * 60 * 60 * 1000;
    const thisWeek = recent.sightings.filter((x) => new Date(x.date.replace(" ", "T")) >= weekAgo).length;
    rows.push(fact("This week", thisWeek ? `Reported at ${plural(thisWeek, "place")} in California`
      : "Not reported in California this week"));
  }
  $("facts").replaceChildren(...rows);
}

// The 12 months as one bar: filled where the bird is usually here, with a
// "Now" marker over the current month.
function fillMonths(s) {
  if (!s.occupied_months) {
    $("months-text").textContent = noSeasonText(s);
    $("months").hidden = true;
    return;
  }
  $("months-text").textContent = s.occupied_months === "all year"
    ? "Here all year, from eBird Status and Trends."
    : `Usually here ${monthsText(s.occupied_months)}, from eBird Status and Trends.`;
  $("months").replaceChildren(...monthItems(monthsIn(s.occupied_months)));
}

// One card per named place: when, how many birds, the place and county,
// Directions and Show on map.
function placeCard(place, onShow) {
  const meta = [formatDate(place.date), place.howMany ? plural(place.howMany, "bird") : null];
  return el("li", { class: "sighting-card" },
    el("span", { class: "meta" }, meta.filter(Boolean).join(" · ")),
    el("span", { class: "spot" }, place.locName),
    countyText(place) ? el("span", { class: "county" }, countyText(place)) : null,
    el("div", { class: "actions" }, directionsLink(place, true), showOnMapButton(onShow, true)));
}

async function load() {
  const code = new URLSearchParams(location.search).get("code") ?? "";
  const [species, photos, counties] = await Promise.all([
    loadSpecies(),
    fetch("data/ca_species_photos.json").then((r) => r.json()),
    fetch("data/ca_counties.json").then((r) => r.json()),
  ]);
  const s = species.get(code);
  if (!s) {
    $("status").replaceChildren(el("span", { class: "error" }, "Unfortunately, we do not currently have data on that bird."),
      el("a", { class: "back-link", href: "./" }, "Back to FlyWay California"));
    return;
  }

  document.title = `${s.common_name} · FlyWay California`;
  // The page's photo is iNaturalist's "large" size (1024px), sharp in the
  // 640px box; the lists use "medium".
  const photo = photos[code];
  const big = photo && { ...photo, url: photo.url.replace("/medium.", "/large.") };
  $("photo").replaceWith(photoBox(big, s.common_name));
  if (photo) $("photo-credit").replaceChildren(...creditParts(photo, true));
  else $("photo-credit").hidden = true;
  // More photos come from iNaturalist (where the page's photo is from); eBird
  // already shows photos on its own species page.
  $("photos-link").href = photo?.taxon_id
    ? `https://www.inaturalist.org/taxa/${photo.taxon_id}/browse_photos`
    : `https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(s.scientific_name)}`;
  $("ebird-link").href = `https://ebird.org/species/${encodeURIComponent(code)}`;
  $("name").textContent = s.common_name;
  $("sci").textContent = s.scientific_name;
  $("tags").replaceChildren(...tags(s).filter(Boolean));
  $("status-line").textContent = withoutTier(s.status_line, s.tier);
  fillFacts(s, null);
  fillMonths(s);

  $("status").hidden = true;
  $("species").hidden = false;
  const mapParts = makeMap("map");  // after unhiding, so Leaflet can measure the map
  const group = markerGroup(s);

  fetchSightings(code, STATEWIDE, SEARCH_DAYS[1])
    .then((recent) => fillFacts(s, recent))
    .catch(() => {});  // the facts just leave out Last seen and This week

  // The home page's "See all locations" links here with #sightings-heading:
  // then every place shows from the start.
  let area = STATEWIDE;
  let days = SEARCH_DAYS[0];
  let showAll = location.hash === "#sightings-heading";
  let places = [];
  let request = 0;

  dropdown($("county"), {
    options: [{ value: "", text: "All of California" }, ...counties.map((c) => ({ value: c.code, text: c.name }))],
    value: "",
    label: (o) => `County: ${o.text}`,
    onPick(value) {
      const county = counties.find((c) => c.code === value);
      area = county ? { region: county.code, phrase: `in ${county.name} County` } : STATEWIDE;
      showAll = false;
      showRecent();
    },
  });

  function drawCards() {
    const shown = showAll ? places : places.slice(0, CARDS_SHOWN);
    $("sightings").replaceChildren(...shown.map((p) =>
      placeCard(p, () => { openPin(mapParts, p); $("map").scrollIntoView({ behavior: "smooth", block: "center" }); })));
    $("show-all").hidden = places.length <= CARDS_SHOWN;
    $("show-all").textContent = showAll ? "Show fewer places" : `Show all ${places.length} places`;
  }

  $("show-all").addEventListener("click", () => {
    showAll = !showAll;
    drawCards();
    if (!showAll) $("sightings-heading").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Map popup, the same as on the other pages.
  const bird = { species: s, comName: s.common_name };
  const popup = (p) => birdsPopup([{ bird, sighting: p }], p);

  async function showRecent() {
    const mine = ++request;  // a late answer to an earlier pick is ignored
    $("sightings-heading").textContent = `Recent Sightings ${area.phrase}`;
    $("days").replaceChildren(...choiceButtons(SEARCH_DAYS, days, (d) => `Last ${d} days`,
      (d) => { days = d; showRecent(); }, "pill chip"));
    $("sightings-summary").classList.remove("error");
    $("sightings-summary").textContent = "Loading sightings…";
    let data;
    try {
      data = await fetchSightings(code, area, days);
    } catch (err) {
      if (mine !== request) return;
      showError($("sightings-summary"), `Couldn't load sightings: ${err.message}`);
      places = [];
      drawCards();
      $("private-note").hidden = true;
      showPins(mapParts, []);
      return;
    }
    if (mine !== request) return;

    places = data.sightings.filter((x) => !x.private);
    const hidden = data.sightings.filter((x) => x.private);
    const total = data.sightings.length;
    const span = `in the last ${days} days`;
    $("sightings-summary").textContent = (total
      ? `Reported at ${plural(total, "place")} ${span}.`
      : `No confirmed sightings ${area.phrase} ${span}.${days === SEARCH_DAYS[0] ? ` Try ${SEARCH_DAYS[1]} days.` : ""}`)
      + ` Data from eBird. · Updated ${timeText(data.fetchedAt)}`;
    $("private-note").hidden = !hidden.length;
    if (hidden.length) $("private-note").textContent = `${privateText(hidden, places.length > 0, formatDate)}.`;
    drawCards();
    showPins(mapParts, places.map((p) => Object.assign(p, {
      group, popup: popup(p),
    })));
    $("updated").textContent = dateTimeText(data.fetchedAt);
    $("updated-wrap").hidden = false;
  }
  await showRecent();
  if (location.hash === "#sightings-heading") $("sightings-heading").scrollIntoView({ block: "start" });
}

load().catch((err) => {
  showError($("status"), `Couldn't load this bird: ${err.message}`);
});
