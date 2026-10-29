// Demo previews: hovering a "watch the demo" button shows the video playing
// silently in a small iPhone or MacBook frame next to it. Clicking still opens
// the full player (ui/player.ts). Like the player, the embed only exists while
// it's showing, so nothing loads from YouTube until someone lingers.

import { FADE, SNAPPY, reducedMotion } from "./motion";

const DELAY = 220; // ms of hovering before the preview loads, so fly-bys don't
const GAP = 16; // px between the button and the preview

/**
 * A short local clip (data-preview="/demos/x.mp4") plays clean; otherwise the
 * YouTube video stands in, muted and looping, though YouTube still overlays
 * its title and logo for the first few seconds.
 */
function media(trigger: HTMLElement): HTMLElement {
  if (trigger.dataset.preview) {
    const video = document.createElement("video");
    video.src = trigger.dataset.preview;
    video.muted = video.autoplay = video.loop = video.playsInline = true;
    return video;
  }
  const id = encodeURIComponent(trigger.dataset.video!);
  const iframe = document.createElement("iframe");
  // Muted, no controls, looping (YouTube needs playlist=<id> for that).
  iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&playsinline=1&rel=0&disablekb=1`;
  iframe.allow = "autoplay; encrypted-media";
  iframe.tabIndex = -1;
  return iframe;
}

export function initPreview() {
  // Hover only makes sense with a mouse; on touch the tap opens the player.
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const preview = document.createElement("div");
  preview.className = "preview";
  preview.setAttribute("aria-hidden", "true");
  preview.hidden = true;
  preview.innerHTML = `<div class="preview-device"><div class="preview-screen"></div></div>`;
  document.body.append(preview);
  const screen = preview.querySelector<HTMLElement>(".preview-screen")!;

  let current: HTMLElement | null = null;
  let timer = 0;

  const show = (trigger: HTMLElement) => {
    preview.dataset.device = trigger.dataset.device ?? "phone";
    screen.replaceChildren(media(trigger));
    preview.hidden = false;

    // Beside the button, vertically centred on it, kept on screen.
    const b = trigger.getBoundingClientRect();
    const w = preview.offsetWidth;
    const h = preview.offsetHeight;
    let x = b.right + GAP;
    if (x + w > innerWidth - 8) x = b.left - GAP - w;
    const y = Math.min(Math.max(8, b.top + b.height / 2 - h / 2), innerHeight - h - 8);
    preview.style.left = `${Math.max(8, x)}px`;
    preview.style.top = `${y}px`;

    if (!reducedMotion()) {
      preview.animate([{ opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1 }], {
        duration: SNAPPY.duration,
        easing: SNAPPY.easing,
      });
    }
  };

  const hide = () => {
    clearTimeout(timer);
    current = null;
    if (preview.hidden) return;
    const done = () => {
      preview.hidden = true;
      screen.replaceChildren();
    };
    if (reducedMotion()) return done();
    preview.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE.out, easing: FADE.easing }).finished.then(done, done);
  };

  document.addEventListener("pointerover", (e) => {
    const trigger = (e.target as Element).closest<HTMLElement>(".actions [data-video]");
    if (trigger === current) return;
    hide();
    if (!trigger) return;
    current = trigger;
    timer = window.setTimeout(() => current === trigger && show(trigger), DELAY);
  });
  // Opening the full player (or leaving the page) closes the preview.
  document.addEventListener("click", hide, true);
  document.addEventListener("pointerleave", hide);
}
