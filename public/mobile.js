// Phone behaviors shared by every page (loaded through nav.js): the mobile
// header's search button and menu, the press ripple on touch screens, and
// the dots under swipeable card rows (.carousel-list).

import { el } from "./ui.js";

const header = document.querySelector(".site-header");

// Search: the search button opens the header search bar; the X, Escape, or
// tapping elsewhere closes it.
function setUpSearch() {
  const toggle = header?.querySelector(".search-toggle");
  if (!toggle) return;
  const input = document.getElementById("site-search-input");
  const setOpen = (open) => {
    header.classList.toggle("search-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
    else { input.value = ""; input.dispatchEvent(new Event("input")); input.blur(); }
  };
  toggle.addEventListener("click", () => setOpen(true));
  header.querySelector(".search-close").addEventListener("click", () => { setOpen(false); toggle.focus(); });
  input.addEventListener("keydown", (event) => { if (event.key === "Escape") setOpen(false); });
  document.addEventListener("click", (event) => {
    if (header.classList.contains("search-open") && !event.composedPath().includes(header.querySelector(".site-nav"))
        && !event.composedPath().includes(toggle)) setOpen(false);
  });
}

// Menu: drops down under its button, right-aligned; a link, the button again,
// Escape, or tapping elsewhere closes it.
function setUpMenu() {
  const toggle = header?.querySelector(".menu-toggle");
  if (!toggle) return;
  const menu = document.getElementById("site-menu");
  const setOpen = (open) => {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setOpen(menu.hidden));
  menu.addEventListener("click", (event) => { if (event.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !menu.hidden) { setOpen(false); toggle.focus(); } });
  document.addEventListener("click", (event) => {
    if (!menu.hidden && !event.composedPath().includes(toggle.parentElement)) setOpen(false);
  });
}

// Press ripple, touch screens only: a circle spreads from the finger and
// fades out, over the control's pressed color.
const PRESSABLE = ".pill, .button, .text-button, .locate, .show-more, .more-toggle, .row-head, .icon-button, "
  + ".mobile-menu .menu a, .menu [role=option], .menu [role=menuitem]";

function setUpRipple() {
  if (!matchMedia("(hover: none)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest(PRESSABLE);
    if (!target || target.disabled) return;
    const box = target.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    const radius = Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y));
    const ripple = el("span", { class: "ripple", "aria-hidden": "true" });
    Object.assign(ripple.style, { left: `${x - radius}px`, top: `${y - radius}px`, width: `${radius * 2}px`, height: `${radius * 2}px` });
    target.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  }, { passive: true });
}

// Carousel dots: one per card, under each .carousel-list; the card at the
// left edge has the ocean-blue dot, and a dot scrolls to its card. They're
// redrawn when the cards change.
function setUpCarousel(list) {
  const dots = el("div", { class: "carousel-dots", role: "group", "aria-label": "Cards" });
  list.after(dots);
  let current = 0;
  const cards = () => [...list.children];

  function mark() {
    const left = list.getBoundingClientRect().left;
    let best = Infinity;
    cards().forEach((card, i) => {
      const d = Math.abs(card.getBoundingClientRect().left - left);
      if (d < best) { best = d; current = i; }
    });
    // At the end of the row the last cards can't reach the left edge.
    if (list.scrollLeft + list.clientWidth >= list.scrollWidth - 2) current = cards().length - 1;
    [...dots.children].forEach((dot, i) => dot.setAttribute("aria-current", String(i === current)));
  }

  function draw() {
    dots.replaceChildren(...cards().map((card, i) => {
      const dot = el("button", { type: "button", "aria-label": `Card ${i + 1} of ${list.children.length}` });
      dot.addEventListener("click", () => list.scrollTo({ left: card.offsetLeft - list.offsetLeft, behavior: "smooth" }));
      return dot;
    }));
    dots.hidden = list.children.length < 2 || list.hidden;
    mark();
  }

  list.addEventListener("scroll", () => requestAnimationFrame(mark), { passive: true });
  new MutationObserver(() => { list.scrollLeft = 0; draw(); }).observe(list, { childList: true, attributes: true, attributeFilter: ["hidden"] });
  draw();
}

setUpSearch();
setUpMenu();
setUpRipple();
document.querySelectorAll(".carousel-list").forEach(setUpCarousel);
