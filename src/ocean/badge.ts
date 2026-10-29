// The theme toggle, drawn into the ocean grid: a sun in light mode, a moon in
// dark mode. It morphs between them like an SF Symbol: the rays draw back into
// a growing disc while a "bite" slides in to carve the crescent. All motion
// runs on a critically damped spring, the same feel as the rest of the UI.

const TAU = Math.PI * 2;
const RESPONSE = 0.5; // seconds — matches SMOOTH in ui/motion.ts
const SUB = 3; // supersamples per tile edge, for soft edges

const STARS: [number, number][] = [
  [0.7, 0.52],
  [0.5, 0.82],
  [-0.78, -0.64],
];

/** Density of the sun→moon shape at (u, v) ∈ [-1, 1]², t = 0 sun … 1 moon. */
function shape(u: number, v: number, t: number, spin: number): number {
  const r = Math.hypot(u, v);

  // Disc, with a bite that slides in from off the top-right corner.
  const R = 0.4 + 0.24 * t;
  const bx = 1.3 - 0.96 * t;
  const by = -1 + 0.74 * t;
  const bite = Math.hypot(u - bx, v - by) < 0.54;
  if (r < R && !bite) return 0.48 + 0.5 * Math.pow(1 - r / R, 0.6);

  // Rays retract into the disc as it becomes the moon.
  if (t < 0.98) {
    const inner = R + 0.14;
    const outer = 0.92 - 0.5 * t;
    if (r > inner && r < outer) {
      const k = ((Math.atan2(v, u) + spin) / TAU) * 8;
      const f = Math.abs(k - Math.round(k));
      if (f < 0.13 - 0.05 * ((r - inner) / (outer - inner))) return (0.62 - 0.3 * ((r - inner) / (outer - inner))) * (1 - t);
    }
  }

  // A few stars twinkle in once it's mostly moon.
  if (t > 0.5) {
    for (const [sx, sy] of STARS) if (Math.hypot(u - sx, v - sy) < 0.075) return 0.55 * (t - 0.5) * 2;
  }
  return 0;
}

export interface BadgeCell {
  c: number; // in tiles (cell / div), not ocean cells
  r: number;
  b: number; // density
  a: number; // coverage → opacity
}

export class ThemeBadge {
  private t: number;
  private vel = 0;
  private target: number;
  private hover = 0;
  private hoverVel = 0;
  private spin = 0;
  private c0 = 0;
  private r0 = 0;
  private n = 11; // tiles per side
  /** Tiles per ocean cell edge: the badge uses a finer grid than the water for more detail. */
  div = 3;

  constructor(private el: HTMLElement, dark: boolean) {
    this.t = this.target = dark ? 1 : 0;
  }

  /** Snap the drawing to the grid cells under the (invisible) button, split into finer tiles. */
  measure(cell: number) {
    const r = this.el.getBoundingClientRect();
    this.div = Math.max(2, Math.round(cell / 2.5)); // ~2.5px tiles on both desktop and phones
    this.n = Math.max(5, Math.round(r.width / cell)) * this.div;
    this.c0 = Math.round(r.left / cell) * this.div;
    this.r0 = Math.round(r.top / cell) * this.div;
  }

  setDark(dark: boolean) {
    this.target = dark ? 1 : 0;
  }

  center(cell: number) {
    const tile = cell / this.div;
    return { x: (this.c0 + this.n / 2) * tile, y: (this.r0 + this.n / 2) * tile };
  }

  update(dt: number, pointer: { x: number; y: number }, cell: number) {
    const tile = cell / this.div;
    const x0 = this.c0 * tile, y0 = this.r0 * tile, s = this.n * tile;
    const over = pointer.x >= x0 && pointer.x <= x0 + s && pointer.y >= y0 && pointer.y <= y0 + s;
    const w = TAU / RESPONSE;
    const h = dt / 4;
    for (let k = 0; k < 4; k++) {
      this.vel += (w * w * (this.target - this.t) - 2 * w * this.vel) * h;
      this.t += this.vel * h;
      this.hoverVel += (w * w * ((over ? 1 : 0) - this.hover) - 2 * w * this.hoverVel) * h;
      this.hover += this.hoverVel * h;
    }
    this.spin += dt * (0.12 + 0.5 * this.hover); // rays turn slowly, a touch faster under the cursor
  }

  cells(): BadgeCell[] {
    const out: BadgeCell[] = [];
    const { n } = this;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        let sum = 0, hits = 0;
        for (let sy = 0; sy < SUB; sy++) {
          for (let sx = 0; sx < SUB; sx++) {
            const u = ((c + (sx + 0.5) / SUB) / n) * 2 - 1;
            const v = ((r + (sy + 0.5) / SUB) / n) * 2 - 1;
            const b = shape(u, v, this.t, this.spin);
            if (b > 0) {
              sum += b;
              hits++;
            }
          }
        }
        if (!hits) continue;
        out.push({
          c: this.c0 + c,
          r: this.r0 + r,
          b: Math.min(1, (sum / hits) * (1 + 0.15 * this.hover)),
          a: hits / (SUB * SUB),
        });
      }
    }
    return out;
  }
}
