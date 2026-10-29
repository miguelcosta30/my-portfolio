// The card "lands" on the water: it drops in from slightly above and, on
// impact, card-shaped ripples spread out behind it. Also keeps the haze behind
// the content sized and centred on the card.

import { FADE, reducedMotion } from "./motion";

type Splash = (rect: DOMRect, corner: number, reach: number) => void;

export function initLanding(splash: Splash) {
  const root = document.documentElement;
  const card = document.querySelector<HTMLElement>(".card")!;

  const impact = () => splash(card.getBoundingClientRect(), parseFloat(getComputedStyle(card).borderTopLeftRadius) || 14, 0.3); // same reach as the tabs' mini splash

  // A stone hitting the water: accelerate down onto the surface, then splash.
  const land = (height = 1.025, duration = 240) => {
    if (reducedMotion()) return;
    card
      .animate(
        [
          { transform: `scale(${height})`, opacity: 0 },
          { transform: "scale(1)", opacity: 1, offset: 0.85 },
          { transform: "scale(0.997)", opacity: 1, offset: 0.93 },
          { transform: "scale(1)", opacity: 1 },
        ],
        { duration, easing: "cubic-bezier(0.55, 0, 0.9, 0.45)" },
      )
      .finished.then(impact, () => {});
  };

  // Let the haze follow the card's size and position — every frame while it
  // morphs, and as the mobile page scrolls.
  let queued = 0;
  const track = () => {
    queued ||= requestAnimationFrame(() => {
      queued = 0;
      // Only the on-screen part counts: on phones (and on long sections) the
      // card is taller than the viewport, and sizing the haze to all of it
      // would blur the whole screen.
      const r = card.getBoundingClientRect();
      const top = Math.max(0, r.top);
      const bottom = Math.min(innerHeight, r.bottom);
      const h = Math.max(0, bottom - top);
      root.style.setProperty("--card-x", `${r.x + r.width / 2}px`);
      root.style.setProperty("--card-y", `${top + h / 2}px`);
      root.style.setProperty("--card-w", `${r.width}px`);
      root.style.setProperty("--card-h", `${h}px`);
    });
  };
  new ResizeObserver(track).observe(card);
  document.querySelector(".hero")!.addEventListener("scroll", track, { passive: true });
  addEventListener("resize", track);

  // Switching sections: a smaller drop as the new content fades in.
  new MutationObserver(() => {
    if (reducedMotion()) return;
    card.animate([{ transform: "scale(1.01)" }, { transform: "scale(1)" }], {
      duration: FADE.out * 0.6 + FADE.in,
      easing: "cubic-bezier(0.55, 0, 0.9, 0.45)",
    }).finished.then(impact, () => {});
  }).observe(card, { attributes: true, attributeFilter: ["data-active"] });

  return { land };
}
