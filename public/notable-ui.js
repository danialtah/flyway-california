// Notable sightings sections shared by the home page and the county pages:
// the rarest bird cards, map popups, the rare bird hotspot cards, and the
// notable list (tier tabs and rows that open). Each page loads its own
// sightings and calls these to draw them.
//
// `ctx` is { mapParts, photos, places, inCounty, emptyText }: the map,
// ca_species_photos.json, placesFor()'s places, so cards can open a place's
// pin, whether this is a county page, and what the notable list says when
// there are no birds ("No notable birds reported in Inyo County this week.").

import { firstSentence, formatDate, placeText } from "./feed.js";
import {
  $, el, speciesLink, cardName, plural, icon, directionsLink, showOnMapButton, creditParts, photoBox,
} from "./ui.js";
import { MARKERS, markerGroup, openPin, groupByPlace, topHotspots, swatch } from "./map.js";

// How a time window reads in headings ("Rarest Birds in California This
// Week") and in sentences ("None this week").
export function period(days) {
  return days === 7
    ? { days, heading: "This Week", span: "this week" }
    : { days, heading: `in the Last ${days} Days`, span: `in the last ${days} days` };
}

const isReview = (bird) => bird.species?.cbrc_review === "true";
const isHybrid = (bird) => !bird.species && / \(hybrid\)$/.test(bird.comName);
const photoFor = (ctx, bird) => (bird.species ? ctx.photos[bird.species.ebird_code] : null);

// Which marker, dot color and tab a bird gets. Hybrids have no species row or
// tier; they're crosses of native birds and mostly turn up every year, so
// they go with Common, as on the map.
const groupOf = (bird) => (bird.species ? markerGroup(bird.species) : "Common");
const dot = (group) => el("span", { class: "dot", style: `--color: ${MARKERS[group].color}`, "aria-hidden": "true" });

// The rarity badge: the tier, then "CBRC review" for review species;
// species with neither say they have no seasonal data.
function badgeText(bird) {
  const parts = [];
  if (groupOf(bird) === "escapee") parts.push(MARKERS.escapee.label);
  else if (bird.species?.tier) parts.push(bird.species.tier);
  if (isReview(bird)) parts.push("CBRC review");
  return parts.join(" · ") || "No seasonal data";
}

// Zoom the map to a named place and open its pin.
function showPlace(ctx, locId) {
  const place = ctx.places.find((p) => p.locId === locId);
  if (!place) return;
  openPin(ctx.mapParts, place);
  $("map").scrollIntoView({ behavior: "smooth", block: "center" });
}

// "Morro Bay--Audubon overlook, San Luis Obispo Co." or
// "Humboldt Co. (private location)".
// On a county page (ctx.inCounty) every place is in that county, so the
// county is left off: "Morro Bay--Audubon overlook", "Private location".
const shortPlace = (s, ctx) => (ctx.inCounty
  ? (s.private ? "Private location" : s.locName)
  : (s.private ? `${s.county} Co. (private location)` : `${s.locName}, ${s.county} Co.`));
const rowPlace = (s, ctx) => (ctx.inCounty
  ? (s.private ? "Private location (no map pin)" : s.locName)
  : placeText(s));

// Bird card for the rarest list. Private places have no position, so their
// cards say so in place of Directions and Show on map.
export function topItem(group, ctx) {
  const photo = photoFor(ctx, group);
  const { latest } = group;
  const credit = photo ? el("span", { class: "credit" }, ...creditParts(photo)) : null;
  return el("li", {}, el("article", { class: "bird-card" },
    photoBox(photo, group.comName, credit),
    el("div", { class: "body" },
      el("div", { class: "info" },
        el("span", { class: "badge" }, dot(groupOf(group)), badgeText(group)),
        el("h3", { class: "name" }, cardName(speciesLink(group), group.comName)),
        el("p", { class: "place" }, cardName(shortPlace(latest, ctx), shortPlace(latest, ctx))),
        el("p", { class: "seen" }, `Last seen ${formatDate(latest.date)} · ${plural(group.placeCount, "place")}`)),
      latest.private
        ? el("p", { class: "no-location" }, "There is no currently available public location for this bird.")
        : el("div", { class: "actions" },
          directionsLink(latest, true),
          showOnMapButton(() => showPlace(ctx, latest.locId), true)))));
}

// Map popup for one place, on every map (Figma "Map popup" 274:7352): each
// bird seen there as a title linked to its species page, with its rarity tag
// (the map-key shape and the bird card label), then the place as the bullet,
// with its county and latest date. `birds` are { bird, sighting } pairs;
// `place` is { locName, county }.
export function birdsPopup(birds, place) {
  const latest = birds.map(({ sighting }) => sighting.date).sort().at(-1);
  return el("div", { class: "pin-popup" },
    el("div", { class: "pin-birds" }, ...birds.map(({ bird }) => el("div", { class: "pin-bird" },
      el("strong", { class: "pin-name" }, speciesLink(bird)),
      el("span", { class: "pin-tag" }, swatch(groupOf(bird)), badgeText(bird))))),
    el("p", { class: "pin-place" }, el("span", { "aria-hidden": "true" }, "•"),
      el("span", {}, [place.locName, place.county ? `${place.county} County` : null, formatDate(latest)].filter(Boolean).join(" · "))));
}

// groupBySpecies groups -> map places, each with its popup.
export function placesFor(groups) {
  return groupByPlace(groups).map((place) => ({ ...place, popup: birdsPopup(place.birds, place) }));
}

export function fillList(list, items, emptyText) {
  list.replaceChildren(...items);
  list.hidden = !items.length;
  let note = list.nextElementSibling?.classList.contains("empty-note") ? list.nextElementSibling : null;
  if (items.length) return note?.remove();
  if (!note) list.after(note = el("p", { class: "empty-note" }));
  note.textContent = emptyText;
}

// Hotspot card: the place, its county, how many rare and notable birds, its
// first three rare birds (rarest first), and the two actions.
const HOTSPOT_BIRDS = 3;

function hotspotItem(ctx, { place, rare }) {
  return el("li", {}, el("article", { class: "hotspot-card" },
    el("div", { class: "top" },
      el("div", { class: "header" },
        el("h3", { class: "name" }, cardName(place.locName, place.locName)),
        el("p", { class: "county" }, `${place.county} County`)),
      el("p", { class: "stats" }, el("strong", {}, plural(rare.length, "rare bird")),
        ` · ${plural(place.birds.length, "notable bird")} in all`),
      el("ul", {}, ...rare.slice(0, HOTSPOT_BIRDS).map(({ bird }) =>
        el("li", {}, dot(groupOf(bird)), el("span", { class: "clamp-1" }, speciesLink(bird)))))),
    el("div", { class: "actions" },
      directionsLink(place),
      showOnMapButton(() => showPlace(ctx, place.locId)))));
}

// The hotspots section hides when fewer than 2 places qualify: one place
// isn't a ranking.
export function showHotspots(ctx, where, when, count) {
  const hotspots = topHotspots(ctx.places, count);
  $("hotspots-section").hidden = hotspots.length < 2;
  $("hotspots-heading").textContent = `Rare Bird Hotspots ${where.phrase} ${when.heading}`;
  $("hotspots").replaceChildren(...hotspots.map((h) => hotspotItem(ctx, h)));
}

// Notable list: a tab per rarity, rarest first, each with its count; a tab
// with no birds is hidden. The picked tab lists its birds LIST_STEP at a
// time, CBRC review species first, then newest.
const TABS = [
  { group: "noTier", noun: "rare (no seasonal data)" },
  { group: "Rare", noun: "rare" },
  { group: "Uncommon", noun: "uncommon" },
  { group: "Common", noun: "common" },
  { group: "escapee", noun: "escapee or non-native" },
];
const DEFAULT_TAB = "Rare";
const LIST_STEP = 10;
const ROW_PLACES = 3;  // place cards in an open row; the rest are on the species page

// One card per place the bird was reported, newest first. Private places
// count once per county and have no actions.
function placeCards(ctx, bird) {
  const byPlace = new Map();
  for (const s of bird.sightings) {  // newest first
    const key = s.private ? `private:${s.countyCode}` : s.locId;
    if (!byPlace.has(key)) byPlace.set(key, { latest: s, reports: 0 });
    byPlace.get(key).reports++;
  }
  return [...byPlace.values()].map(({ latest: s, reports }) => el("li", { class: "sighting-card" },
    el("span", { class: "meta" }, `${formatDate(s.date)} · ${plural(reports, "report")}`),
    el("span", { class: "spot" }, s.private ? "Private location" : s.locName),
    el("span", { class: "county" }, `${s.county} County`),
    s.private ? null : el("div", { class: "actions" },
      directionsLink(s, true),
      showOnMapButton(() => showPlace(ctx, s.locId), true))));
}

// Hybrids have no species page to send the rest to, so they show every place.
function rowDetails(ctx, bird, id) {
  const photo = photoFor(ctx, bird);
  const s = bird.species;
  const speciesHref = s ? `species.html?code=${encodeURIComponent(s.ebird_code)}` : null;
  const cards = placeCards(ctx, bird);
  const cut = speciesHref && cards.length > ROW_PLACES;
  return el("div", { class: "row-details", id },
    el("div", {},
      photoBox(photo, bird.comName),
      photo ? el("p", { class: "photo-credit" }, ...creditParts(photo, true)) : null),
    el("div", { class: "content" },
      el("div", { class: "description" },
        s ? el("p", {}, firstSentence(s.status_line)) : el("p", {}, "A hybrid, so it has no rarity or season of its own."),
        s ? el("a", { class: "species-link", href: speciesHref }, "See species page") : null),
      el("div", {},
        el("h4", {}, "Where it's been seen"),
        el("ul", { class: "sighting-cards" }, ...(cut ? cards.slice(0, ROW_PLACES) : cards)),
        cut ? el("a", { class: "species-link all-places", href: `${speciesHref}#sightings-heading` },
          "See all locations") : null)));
}

// Returns a function that redraws the tabs and list for a new set of birds,
// time window, and ctx. The picked tab and open rows stay while they still
// have birds.
export function setUpTiers() {
  let tiers = new Map();
  let ctx = null;
  let tab = DEFAULT_TAB;
  let shown = LIST_STEP;
  const open = new Set();  // speciesCode of each open row

  function tabButton({ group }) {
    const count = tiers.get(group).length;
    const button = el("button", { type: "button", class: "pill", "aria-pressed": String(group === tab), "aria-controls": "tier-list" },
      dot(group), `${MARKERS[group].label} · ${count.toLocaleString("en-US")}`);
    button.addEventListener("click", () => {
      if (group === tab) return;
      tab = group;
      shown = LIST_STEP;
      render();
    });
    return button;
  }

  function row(bird) {
    const id = `row-${bird.speciesCode}`;
    const isOpen = open.has(bird.speciesCode);
    const head = el("button", { type: "button", class: "row-head", "aria-expanded": String(isOpen), "aria-controls": id },
      el("span", { class: "cols" },
        el("span", { class: "bird" }, dot(groupOf(bird)), el("span", { class: "bird-name" }, bird.comName),
          isReview(bird) ? el("span", { class: "review-tag" }, "CBRC review") : null,
          isHybrid(bird) ? el("span", { class: "review-tag" }, "Hybrid") : null),
        el("span", { class: "place" }, rowPlace(bird.latest, ctx)),
        el("span", { class: "seen" }, `${formatDate(bird.latest.date)} · ${plural(bird.placeCount, "place")}`),
        el("span", { class: "more" }, icon("row-more"), el("span", { class: "visually-hidden" }, isOpen ? "Close" : "More"))));
    head.addEventListener("click", () => {
      if (isOpen) open.delete(bird.speciesCode);
      else open.add(bird.speciesCode);
      render();
    });
    return el("li", { class: isOpen ? "row open" : "row" }, head, isOpen ? rowDetails(ctx, bird, id) : null);
  }

  // Under the list: "Show 10 more" adds 10; its chevron opens a menu with
  // "Show 10 more" and "Show all". With every bird showing, "Show less" goes
  // back to the first 10. `focus` names the control to focus after a redraw,
  // so keyboard users don't lose their place.
  function moreControls(left, focus) {
    const step = Math.min(left, LIST_STEP);
    const showMore = (n) => { shown += n; render("more"); };
    if (left <= 0) {
      if (shown <= LIST_STEP) return null;
      const less = el("button", { type: "button", class: "show-more" }, el("span", { class: "label" }, "Show less"), icon("expand-less"));
      less.addEventListener("click", () => {
        shown = LIST_STEP;
        render("more");
        $("tier-list").querySelector(".list-footer").scrollIntoView({ block: "center" });
      });
      if (focus) queueMicrotask(() => less.focus());  // reached the end: the focused control became Show less
      return less;
    }
    const more = el("button", { type: "button", class: "show-more" }, el("span", { class: "label" }, `Show ${step} more`));
    more.addEventListener("click", () => showMore(LIST_STEP));
    if (focus === "more") queueMicrotask(() => more.focus());
    if (left <= LIST_STEP) {  // one step shows the rest: no menu needed
      more.append(icon("expand-more"));
      return more;
    }

    const toggle = el("button", { type: "button", class: "more-toggle", "aria-haspopup": "menu", "aria-expanded": "false",
      "aria-controls": "more-menu", "aria-label": "More ways to show birds" }, icon("expand-more"));
    const items = [[`Show ${LIST_STEP} more`, () => showMore(LIST_STEP)], ["Show all", () => { shown = Infinity; render("less"); }]]
      .map(([text, act]) => {
        const item = el("li", { role: "menuitem", tabindex: "-1" }, el("span", { class: "check", "aria-hidden": "true" }), text);
        item.addEventListener("click", act);
        item.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); act(); } });
        return item;
      });
    const menu = el("ul", { class: "menu", role: "menu", id: "more-menu" }, ...items);
    menu.hidden = true;
    const setOpen = (on) => {
      menu.hidden = !on;
      toggle.setAttribute("aria-expanded", String(on));
      if (on) items[0].focus();
    };
    toggle.addEventListener("click", () => setOpen(menu.hidden));
    toggle.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
    });
    menu.addEventListener("keydown", (event) => {
      const i = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown") items[Math.min(i + 1, items.length - 1)].focus();
      else if (event.key === "ArrowUp") items[Math.max(i - 1, 0)].focus();
      else if (event.key === "Escape") { setOpen(false); toggle.focus(); }
      else if (event.key === "Tab") { setOpen(false); return; }
      else return;
      event.preventDefault();
    });
    closeMenu = (event) => { if (!menu.hidden && !event.composedPath().includes(wrap)) setOpen(false); };
    const wrap = el("div", { class: "more-split" }, more, toggle, menu);
    return wrap;
  }

  let closeMenu = () => {};
  document.addEventListener("click", (event) => closeMenu(event));

  function render(focus = null) {
    const tabs = TABS.filter(({ group }) => tiers.get(group).length);
    $("tier-cards").replaceChildren(...tabs.map(tabButton));
    const list = $("tier-list");
    closeMenu = () => {};
    if (!tabs.length) return list.replaceChildren(el("p", { class: "empty-note" }, ctx.emptyText));
    const birds = tiers.get(tab);
    const left = birds.length - shown;
    const { noun } = TABS.find((t) => t.group === tab);
    const order = birds.some(isReview) ? "CBRC review birds first, then newest" : "newest first";
    list.replaceChildren(
      el("div", { class: "list-header", "aria-hidden": "true" },
        el("span", {}, "Bird"), el("span", {}, "Latest Sighting"), el("span", {}, "Last Seen")),
      el("ol", {}, ...birds.slice(0, shown).map(row)),
      el("div", { class: "list-footer" },
        el("p", { class: "count" }, `Showing ${Math.min(shown, birds.length)} of ${birds.length} ${noun} species, ${order}.`),
        moreControls(left, focus)));
  }

  return (groups, newCtx) => {
    ctx = newCtx;
    tiers = new Map(TABS.map(({ group }) => [group, []]));
    for (const g of groups) tiers.get(groupOf(g)).push(g);
    for (const [group, birds] of tiers) tiers.set(group, [...birds.filter(isReview), ...birds.filter((b) => !isReview(b))]);
    if (!tiers.get(tab).length) tab = TABS.find(({ group }) => tiers.get(group).length)?.group ?? DEFAULT_TAB;
    shown = LIST_STEP;
    render();
  };
}
