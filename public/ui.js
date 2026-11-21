// Page code shared by the home page and the species page.

import { parseCsv, speciesByCode, formatDate, milesBetween } from "./feed.js";
import { SEARCH_DAYS, sightingText, privateText } from "./search.js";

export const $ = (id) => document.getElementById(id);

// Build an element. Text always goes in as text, never as HTML, because
// place names come from eBird users.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children.filter((c) => c != null && c !== ""));
  return node;
}

export function speciesLink(group) {
  return group.species
    ? el("a", { href: `species.html?code=${encodeURIComponent(group.species.ebird_code)}` }, group.comName)
    : group.comName;
}

// A card's name, cut to 2 lines. Hovering over or focusing a name that was
// cut shows it in full in a tooltip; the check runs then because the cut
// depends on the card's width.
export function cardName(content, fullName) {
  const name = el("span", { class: "card-name" }, content);
  const wrap = el("span", { class: "name-wrap" }, name,
    el("span", { class: "tooltip", "aria-hidden": "true" }, fullName));
  const check = () => wrap.classList.toggle("cut", name.scrollHeight > name.clientHeight);
  wrap.addEventListener("mouseenter", check);
  wrap.addEventListener("focusin", check);
  return wrap;
}

// eBird names hybrids like "Gadwall x Mallard (hybrid)".
const isHybrid = (comName) => / \(hybrid\)$/.test(comName ?? "");

export function badges({ species: s, comName }) {
  if (!s) return isHybrid(comName) ? [el("span", { class: "tier" }, " [Hybrid]")] : [];
  return [
    s.tier ? el("span", { class: "tier" }, ` [${s.tier}]`) : null,
    s.cbrc_review === "true" ? el("a", { class: "review", href: "#review-note" }, " CBRC review species") : null,
  ];
}

// Buttons for picking one of `values`; the current one is marked pressed.
export function choiceButtons(values, current, label, onPick) {
  return values.map((value) => {
    const button = el("button", { type: "button", "aria-pressed": String(value === current) }, label(value));
    button.addEventListener("click", () => onPick(value));
    return button;
  });
}

// ebird_code -> species row, with status line and scientific name.
export async function loadSpecies() {
  const [finalCsv, linesCsv, allCsv] = await Promise.all([
    fetch("data/ca_species_final.csv").then((r) => r.text()),
    fetch("data/ca_species_status_lines_v2.csv").then((r) => r.text()),
    fetch("data/ca_species_all.csv").then((r) => r.text()),
  ]);
  return speciesByCode(parseCsv(finalCsv), parseCsv(linesCsv), parseCsv(allCsv));
}

// Fill the county dropdown, which starts with "All of California".
export async function loadCounties(select) {
  const counties = await fetch("data/ca_counties.json").then((r) => r.json());
  select.append(...counties.map((c) => el("option", { value: c.code }, c.name)));
}

// Where to look: all of California, one county, or a radius around a point.
// `phrase` finishes sentences like "Rarest birds in Marin County".
export const RADIUS_MILES = [5, 10, 25];  // eBird's lookup by point stops at 50 km
const KM_PER_MILE = 1.609344;

export function countyArea(select) {
  return select.value
    ? { region: select.value, phrase: `in ${select.selectedOptions[0].text} County` }
    : { region: "US-CA", phrase: "in California" };
}

// `point` is { name, lat, lng }; name is a place or "your location".
export function nearArea(point, miles) {
  return { point, miles, phrase: `within ${miles} miles of ${point.name}` };
}

// Whether a notable sighting is in the area. Private sightings have no
// position, so a radius never includes them.
export function inArea(sighting, area) {
  if (area.point) return !sighting.private && milesBetween(sighting, area.point) <= area.miles;
  return area.region === "US-CA" || sighting.countyCode === area.region;
}

function areaParams(area) {
  return area.point
    ? { lat: area.point.lat.toFixed(2), lng: area.point.lng.toFixed(2), dist: Math.round(area.miles * KM_PER_MILE) }
    : { region: area.region };
}

// Load a species' recent sightings in `area` from /api/species and list them
// in `box`: named places, then one line counting the private ones. Returns
// the named places, for a map, and when the sightings were fetched.
export async function showSightings(box, code, area, days) {
  box.replaceChildren(el("p", {}, "Loading…"));
  const params = new URLSearchParams({ code, ...areaParams(area), back: days });
  try {
    const data = await fetch(`/api/species?${params}`).then((r) => r.json());
    if (data.error) throw new Error(data.error);
    const listed = data.sightings.filter((x) => !x.private);
    const hidden = data.sightings.filter((x) => x.private);
    box.replaceChildren(...data.sightings.length
      ? [listed.length ? el("ul", {}, ...listed.map((x) => el("li", {}, sightingText(x, formatDate)))) : null,
         hidden.length ? el("p", {}, privateText(hidden, listed.length > 0, formatDate)) : null].filter(Boolean)
      : [el("p", {}, `No confirmed sightings ${area.phrase} in the last ${days} days.`
                     + (days === SEARCH_DAYS[0] ? ` Try ${SEARCH_DAYS[1]} days.` : ""))]);
    return { places: listed, fetchedAt: data.fetchedAt };
  } catch (err) {
    box.replaceChildren(el("p", { class: "error" }, `Couldn't load sightings: ${err.message}`));
    return { places: [], fetchedAt: null };
  }
}

// Show an error message in `node`, in the error text color.
export function showError(node, message) {
  node.classList.add("error");
  node.textContent = message;
}

// "Nov 13, 2026, 6:40 PM" in the visitor's time zone.
export function updatedText(isoTime) {
  return new Date(isoTime).toLocaleString();
}
