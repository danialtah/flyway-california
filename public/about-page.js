// About page: the rarity shapes in the label list, the example timeline (a
// migrant here every season but summer, with "Now" on this month), and the
// side nav, which marks the section being read.

import { $, monthItems } from "./ui.js";
import { swatch } from "./map.js";

const EXAMPLE_MONTHS = [true, true, false, true, true, false, false, false, true, true, true, true];

for (const slot of document.querySelectorAll(".swatch-slot")) slot.replaceWith(swatch(slot.dataset.group));
$("example-timeline").replaceChildren(...monthItems(EXAMPLE_MONTHS));

// The section in view is the last one whose top has passed the line just
// under the sticky header; at the bottom of the page it's the last section.
const links = [...document.querySelectorAll(".side-nav a")];
const sections = links.map((a) => document.getElementById(a.hash.slice(1)));

// A clicked link stays marked, even when its section is too near the bottom
// to reach the top, until the visitor scrolls on their own.
let picked = null;

function markCurrent() {
  const line = 120;
  let current = 0;
  sections.forEach((section, i) => { if (section.getBoundingClientRect().top <= line) current = i; });
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) current = sections.length - 1;
  if (picked !== null) current = picked;
  links.forEach((a, i) => a.setAttribute("aria-current", String(i === current)));
}

links.forEach((a, i) => a.addEventListener("click", () => { picked = i; markCurrent(); }));
for (const type of ["wheel", "touchstart", "keydown"]) addEventListener(type, () => { picked = null; }, { passive: true });
addEventListener("scroll", markCurrent, { passive: true });
addEventListener("resize", markCurrent);
markCurrent();
