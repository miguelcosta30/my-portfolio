// The content lives in the water: the cursor leaves a faint wake as it moves,
// dragging across open water draws a trail that spreads like a boat's wake,
// hovering a row sends a small ripple out from that spot, picking a tab makes
// a mini splash around it, and switching tabs startles the sharks near the content.

import type { OceanEngine } from "../ocean/engine";

/** Things that ripple when the cursor (or a finger) arrives on them. */
const ROWS = ".entries > li, .projects a, .socials a, .role, .edu header, .nav button, .about-actions a";
const WAKE_EVERY = 110; // px of cursor travel between wake rings

export function initWater(engine: OceanEngine) {
  // Hover ripples: once per row, from where the cursor entered it.
  let lastRow: Element | null = null;
  document.addEventListener("pointerover", (e) => {
    const row = (e.target as Element).closest(ROWS);
    if (row && row !== lastRow) engine.ripple(e.clientX, e.clientY, true);
    lastRow = row;
  });

  // The wake: a faint ring every so often along the cursor's path.
  let travelled = 0;
  let last: { x: number; y: number } | null = null;
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    if (last) travelled += Math.hypot(e.clientX - last.x, e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY };
    if (travelled > WAKE_EVERY) {
      travelled = 0;
      engine.ripple(e.clientX, e.clientY, true);
    }
  });

  // Dragging on open water (not on the UI) leaves a trail.
  let dragging = false;
  addEventListener("pointerdown", (e) => {
    if ((e.target as Element).closest("a, button, .card, .nav, .player")) return;
    dragging = true;
    engine.drag(e.clientX, e.clientY);
  });
  addEventListener("pointermove", (e) => {
    if (dragging) engine.drag(e.clientX, e.clientY);
  });
  const stop = () => {
    dragging = false;
    engine.endDrag();
  };
  addEventListener("pointerup", stop);
  addEventListener("pointercancel", stop);

  // Picking a tab: a mini splash around it, as if it was tapped into the water.
  document.querySelectorAll<HTMLElement>("[data-section]").forEach((tab) =>
    tab.addEventListener("click", () => engine.splash(tab.getBoundingClientRect(), 8, 2, 0.3)),
  );

  // Switching tabs: sharks near the content dart away as it lands.
  const card = document.querySelector<HTMLElement>(".card")!;
  new MutationObserver(() => {
    const r = card.getBoundingClientRect();
    engine.scatter(r.x + r.width / 2, Math.max(0, r.y) + Math.min(r.height, innerHeight) / 2);
  }).observe(card, { attributes: true, attributeFilter: ["data-active"] });
}
