// Page code shared by the home page and the species page.

import { parseCsv, speciesByCode, formatDate, milesBetween, MONTHS } from "./feed.js";
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
// `className` styles them, like "pill pill-sm" for the home page's list sizes.
export function choiceButtons(values, current, label, onPick, className = "") {
  return values.map((value) => {
    const attrs = { type: "button", "aria-pressed": String(value === current) };
    if (className) attrs.class = className;
    const button = el("button", attrs, label(value));
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
// The home page filters its statewide notable sightings by distance in the
// browser, so it isn't held to eBird's 50 km limit on lookups by point
// (which /api/species has).
export const RADIUS_MILES = [10, 25, 50];
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

export const icon = (name) => el("span", { class: `icon icon-${name}`, "aria-hidden": "true" });

export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

// "10:24 PM" and "Nov 18, 10:24 PM" in the visitor's time zone.
export const timeText = (isoTime) =>
  new Date(isoTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const dateTimeText = (isoTime) =>
  new Date(isoTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// A Directions link to a place, opened in the visitor's maps app or site.
export function directionsLink({ lat, lng }, small = false) {
  const href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  return el("a", { class: small ? "button button-sm" : "button", href, target: "_blank", rel: "noopener" },
    icon(small ? "near-me-16" : "near-me-18"), "Directions");
}

// "Show on map" text button.
export function showOnMapButton(onClick, small = false) {
  const button = el("button", { type: "button", class: small ? "text-button text-button-sm" : "text-button" },
    icon(small ? "location-14" : "location-18"), el("span", { class: "label" }, "Show on map"));
  button.addEventListener("click", onClick);
  return button;
}

// Photo credits from ca_species_photos.json. iNaturalist attributions look
// like "(c) Name, some rights reserved (CC BY-NC)", "no rights reserved,
// uploaded by Name" (CC0), or "Name, no known copyright restrictions (public
// domain)"; the Macaulay Library photo is "(c) Name, Macaulay Library".
const LICENSES = {
  "cc-by":       { label: "CC BY",       url: "https://creativecommons.org/licenses/by/4.0/" },
  "cc-by-nc":    { label: "CC BY-NC",    url: "https://creativecommons.org/licenses/by-nc/4.0/" },
  "cc-by-sa":    { label: "CC BY-SA",    url: "https://creativecommons.org/licenses/by-sa/4.0/" },
  "cc-by-nc-sa": { label: "CC BY-NC-SA", url: "https://creativecommons.org/licenses/by-nc-sa/4.0/" },
  "cc0":         { label: "CC0",         url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  "pd":          { label: "Public domain", url: "https://creativecommons.org/publicdomain/mark/1.0/" },
  "macaulay":    { label: "Macaulay Library", url: null },
};

// -> { name, copyright, license: { label, url }, source }, where name has
// no "(c)" and copyright says whether to show "©" (not for CC0 or public
// domain).
export function photoCredit(photo) {
  const text = photo.attribution.replace(/\s+/g, " ").trim();
  const uploaded = text.match(/uploaded by (.+)$/);
  let name;
  if (text.startsWith("(c) ")) name = text.slice(4).split(",")[0].trim();
  else if (uploaded) name = uploaded[1].trim();
  else name = text.split(",")[0].trim();
  const license = LICENSES[photo.license] ?? { label: photo.license.toUpperCase(), url: null };
  const free = photo.license === "cc0" || photo.license === "pd";
  return { name, copyright: !free, license, source: photo.license === "macaulay" ? null : "iNaturalist" };
}

// Credit as elements: the name links to the photo's page, the license to
// its terms. `withSource` adds "· iNaturalist" (open list rows).
export function creditParts(photo, withSource = false) {
  const credit = photoCredit(photo);
  const external = { target: "_blank", rel: "noopener" };
  const parts = [
    credit.copyright ? "© " : "",
    el("a", { href: photo.page, ...external }, credit.name),
    " · ",
    credit.license.url ? el("a", { href: credit.license.url, ...external }, credit.license.label) : credit.license.label,
  ];
  if (withSource && credit.source) parts.push(` · ${credit.source}`);
  return parts;
}

// A photo box: the photo cropped to fill it (the photo's crop field moves
// the focus up or down), or an image icon when there's no photo.
const CROPS = { top: "50% 15%", bottom: "50% 85%" };
export function photoBox(photo, alt, extra = null) {
  if (!photo) return el("div", { class: "photo" }, el("div", { class: "empty" }, icon("image")), extra);
  const img = el("img", { src: photo.url, alt, loading: "lazy", decoding: "async" });
  if (CROPS[photo.crop]) img.style.objectPosition = CROPS[photo.crop];
  return el("div", { class: "photo" }, img, extra);
}

// Filter pill with a menu under it (the Figma "Filter pill" and its
// dropdown). `options` are { value, text }; the pill reads label(option).
// Keyboard: arrows move through the options, Enter or Space picks, Escape
// closes. Returns { set(value), disable(on) }.
let menuCount = 0;
export function dropdown(container, { options, value, label, onPick }) {
  const id = `menu-${++menuCount}`;
  const button = el("button", { type: "button", class: "pill", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-controls": id });
  const menu = el("ul", { class: "menu", role: "listbox", id, tabindex: "-1" });
  const text = el("span", {});
  button.append(text, icon("expand-more"));
  menu.hidden = true;
  let active = -1;

  function draw() {
    const current = options.find((o) => o.value === value);
    text.textContent = label(current);
    menu.replaceChildren(...options.map((o, i) => {
      const option = el("li", { role: "option", id: `${id}-${i}`, "aria-selected": String(o.value === value) },
        el("span", { class: "check", "aria-hidden": "true" }), o.text);
      option.classList.toggle("active", i === active);
      option.addEventListener("click", () => pick(o.value));
      return option;
    }));
    if (active >= 0) menu.setAttribute("aria-activedescendant", `${id}-${active}`);
    else menu.removeAttribute("aria-activedescendant");
    menu.children[active]?.scrollIntoView({ block: "nearest" });  // long menus scroll
  }

  function open() {
    active = options.findIndex((o) => o.value === value);
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    draw();
    menu.focus();
  }

  function close(focusButton = true) {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (focusButton) button.focus();
  }

  function pick(newValue) {
    close();
    if (newValue === value) return;
    value = newValue;
    draw();
    onPick(value);
  }

  button.addEventListener("click", () => (menu.hidden ? open() : close()));
  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); open(); }
  });
  menu.addEventListener("keydown", (event) => {
    const last = options.length - 1;
    if (event.key === "ArrowDown") active = Math.min(active + 1, last);
    else if (event.key === "ArrowUp") active = Math.max(active - 1, 0);
    else if (event.key === "Home") active = 0;
    else if (event.key === "End") active = last;
    else if (event.key === "Enter" || event.key === " ") { if (active >= 0) pick(options[active].value); }
    else if (event.key === "Escape") close();
    else if (event.key === "Tab") { close(false); return; }
    else return;
    event.preventDefault();
    if (!menu.hidden) draw();
  });
  // composedPath, not contains: an option clicked is gone from the page by
  // the time the click reaches the document.
  document.addEventListener("click", (event) => {
    if (!menu.hidden && !event.composedPath().includes(container)) close(false);
  });

  container.replaceChildren(button, menu);
  draw();
  return {
    set(newValue) { value = newValue; draw(); },
    disable(on) {
      if (on && !menu.hidden) close(false);
      button.disabled = on;
    },
  };
}

// The 12-month timeline (Figma "Month segment"), as list items for an
// <ol class="timeline">: `present` is 12 true/false values, Jan first. The
// current month gets the "Now" marker.
export const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

export function monthItems(present) {
  const now = new Date().getMonth();
  return present.map((on, i) => el("li",
    { class: `month${on ? " present" : ""}${i === now ? " now" : ""}` },
    i === now ? el("span", { class: "now-marker", "aria-hidden": "true" }, "Now") : null,
    el("span", { class: "bar", "aria-hidden": "true" }),
    el("span", { class: "label", "aria-hidden": "true" }, MONTHS[i]),
    el("span", { class: "visually-hidden" },
      `${FULL_MONTHS[i]}: ${on ? "usually here" : "usually not here"}${i === now ? " (this month)" : ""}`)));
}
