// Section switching: nav tab clicks and 1–5 keyboard shortcuts.

import { FADE, reducedMotion } from "./motion";

const ORDER = ["about", "work", "academic", "projects", "socials"];

export function initPage() {
  const headline = document.querySelector<HTMLElement>("#headline")!;
  const card = document.querySelector<HTMLElement>(".card")!;
  const panels = document.querySelectorAll<HTMLElement>("[data-panel]");
  const navs = document.querySelectorAll<HTMLElement>("[data-section]");
  let current = "about";
  card.dataset.active = current;

  // Whatever is mid-flight from the previous switch, so a new one can finish it off.
  let settle: (() => void) | undefined;

  const select = (id: string, animate = true) => {
    if (id === current) return;
    settle?.();
    current = id;
    const motion = animate && !reducedMotion();

    const prev = [...panels].find((p) => !p.hidden)!;
    const next = [...panels].find((p) => p.dataset.panel === id)!;
    const prevRect = prev.getBoundingClientRect();

    prev.hidden = true;
    next.hidden = false;
    card.dataset.active = id;
    headline.innerHTML = next.dataset.headline ?? ""; // static markup from index.html, e.g. the smile
    history.replaceState(null, "", id === "about" ? location.pathname : `#${id}`);
    navs.forEach((n) => n.toggleAttribute("aria-current", n.dataset.section === id));
    document.querySelector(".hero")!.scrollTo({ top: 0 }); // mobile: the page itself scrolls

    if (!motion) return;

    // The card snaps to its new size (there's no container to watch resize),
    // and everything moves the same way: the old content fades out exactly
    // where it was, the new content fades in with a short rise.

    // 1. Old content: pinned at its previous on-screen spot, lifted out of the layout.
    const to = card.getBoundingClientRect();
    prev.hidden = false;
    card.style.overflow = "visible"; // the card may now be smaller than the old content
    prev.style.cssText = `position:absolute;margin:0;top:${prevRect.top - to.top}px;left:${prevRect.left - to.left}px;width:${prevRect.width}px;pointer-events:none`;
    const out = prev.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FADE.out,
      easing: FADE.easing,
      fill: "forwards",
    });

    // 2. New content and headline fade in as the old one clears; the content also rises a little.
    const fadeIn = { duration: FADE.in, delay: FADE.out * 0.6, easing: FADE.easing, fill: "backwards" as const };
    const enter = next.animate([{ opacity: 0, translate: "0 8px" }, { opacity: 1, translate: "0 0" }], fadeIn);
    const title = headline.animate([{ opacity: 0 }, { opacity: 1 }], fadeIn);

    const clearOut = () => {
      out.cancel();
      prev.hidden = true;
      prev.style.cssText = "";
      card.style.overflow = "";
      settle = undefined;
    };
    out.finished.then(clearOut, () => {});

    // Jump everything to its end state right now (synchronously), for when
    // the next switch starts before this one is done.
    settle = () => {
      for (const a of [enter, title]) a.cancel();
      clearOut();
    };
  };

  navs.forEach((n) => n.addEventListener("click", () => select(n.dataset.section!)));
  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector("#player:not([hidden])")) return;
    const id = ORDER[Number(e.key) - 1];
    if (id) select(id);
  });

  // Deep links: /#academic opens straight on that tab.
  const fromHash = () => {
    const id = location.hash.slice(1);
    if (ORDER.includes(id)) select(id, false);
  };
  addEventListener("hashchange", fromHash);
  fromHash();
}

type Theme = "light" | "dark";

/** Wires the nav toggle; the initial theme is set by the inline script in index.html. */
export function initTheme(onChange: (t: Theme) => void): Theme {
  const root = document.documentElement;
  const current = (): Theme => (root.dataset.theme === "dark" ? "dark" : "light");

  const apply = (t: Theme) => {
    root.dataset.theme = t;
    onChange(t);
  };

  document.querySelector("#theme-toggle")!.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("theme", next);
    } catch {}
    apply(next);
  });

  // Follow the OS setting until the visitor picks one explicitly.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {}
    if (!saved) apply(e.matches ? "dark" : "light");
  });

  return current();
}
