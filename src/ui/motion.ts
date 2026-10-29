// One motion system for the whole UI, modelled on SwiftUI's default spring:
// a damped harmonic oscillator sampled into a CSS linear() easing, so the
// same curve drives Web Animations, CSS transitions and everything in between.

export interface Spring {
  easing: string;
  duration: number; // ms until it has visibly settled
}

/**
 * @param response  seconds for one (undamped) oscillation — lower is snappier
 * @param damping   1 = critically damped (no overshoot), < 1 = a little bounce
 */
export function spring(response: number, damping: number): Spring {
  const w = (2 * Math.PI) / response;
  const z = damping;
  const at = (t: number) => {
    if (z >= 1) return 1 - (1 + w * t) * Math.exp(-w * t);
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  };

  // Settle when it stays within 0.1% of the target.
  let end = response;
  for (let t = 0; t < 5; t += 0.005) {
    let settled = true;
    for (let u = t; u < t + 0.1; u += 0.005) if (Math.abs(1 - at(u)) > 0.001) settled = false;
    if (settled) {
      end = t;
      break;
    }
  }

  const steps = 48;
  const points = Array.from({ length: steps + 1 }, (_, i) => at((end * i) / steps).toFixed(4));
  points[steps] = "1";
  return { easing: `linear(${points.join(", ")})`, duration: Math.round(end * 1000) };
}

/** Layout changes: the card resizing, the nav capsule sliding. */
export const SMOOTH = spring(0.5, 1);
/** Small, quick things: presses, the player popping in. */
export const SNAPPY = spring(0.32, 0.86);
/** Content fades. Apple keeps these short and plain. */
export const FADE = { easing: "cubic-bezier(0.25, 0.1, 0.25, 1)", out: 120, in: 240 };

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Expose the curves to CSS as custom properties. */
export function installMotion() {
  const s = document.documentElement.style;
  s.setProperty("--smooth", SMOOTH.easing);
  s.setProperty("--smooth-ms", `${SMOOTH.duration}ms`);
  s.setProperty("--snappy", SNAPPY.easing);
  s.setProperty("--snappy-ms", `${SNAPPY.duration}ms`);
}
