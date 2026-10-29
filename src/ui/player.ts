import { FADE, SNAPPY, reducedMotion } from "./motion";

// Video lightbox: any element with data-video="<youtube id>" opens it.
// The embed is only created on open (and torn down on close) so the page
// doesn't load YouTube until someone actually wants to watch.

export function initPlayer() {
  const player = document.querySelector<HTMLElement>("#player")!;
  const slot = player.querySelector<HTMLElement>(".player-video")!;
  const title = player.querySelector<HTMLElement>("#player-title")!;
  const backdrop = player.querySelector<HTMLElement>(".player-backdrop")!;
  const frame = player.querySelector<HTMLElement>(".player-frame")!;
  let opener: HTMLElement | null = null;

  const open = (trigger: HTMLElement) => {
    const id = trigger.dataset.video!;
    opener = trigger;
    title.textContent = trigger.dataset.title ?? "";
    // data-device="phone" or "laptop" shows the video inside an iPhone or MacBook frame.
    player.dataset.device = trigger.dataset.device ?? "";
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1`;
    iframe.title = trigger.dataset.title ?? "Video";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    slot.replaceChildren(iframe);
    player.hidden = false;
    if (!reducedMotion()) {
      backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE.in, easing: FADE.easing });
      frame.animate([{ opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1 }], {
        duration: SNAPPY.duration,
        easing: SNAPPY.easing,
      });
    }
    player.querySelector<HTMLElement>(".player-close")!.focus();
  };

  const close = () => {
    if (player.hidden) return;
    slot.replaceChildren();
    opener?.focus();
    if (reducedMotion()) {
      player.hidden = true;
      return;
    }
    const fade = { duration: FADE.out * 1.4, easing: FADE.easing, fill: "forwards" as const };
    backdrop.animate([{ opacity: 1 }, { opacity: 0 }], fade);
    frame
      .animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.97 }], fade)
      .finished.then(() => {
        player.hidden = true;
        player.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      });
  };

  document.addEventListener("click", (e) => {
    const target = e.target as Element;
    const trigger = target.closest<HTMLElement>("[data-video]");
    if (trigger) return open(trigger);
    if (target.closest("[data-close]")) close();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}
