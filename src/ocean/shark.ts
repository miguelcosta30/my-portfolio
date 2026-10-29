// A shark seen from above, described in normalised body space:
//   s ∈ [0, 1]  distance from the nose to the tail tip, in body lengths
//   y           lateral offset from the spine, in body lengths
// The body is laid along the path the head has travelled, so it curves
// naturally through turns, plus a lateral swim wave towards the tail.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const angleTo = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export type SharkKind = "shark" | "hammerhead" | "reef" | "thresher";

/** Spawn mix: mostly classic sharks, with the other species sprinkled in. */
export const SPAWN_ORDER: SharkKind[] = ["shark", "reef", "hammerhead", "thresher", "shark", "reef", "hammerhead"];

/** Per-species proportions, all in body lengths. */
const BODY: Record<SharkKind, { width: number; trunk: number; fin: number; size: number }> = {
  shark: { width: 0.098, trunk: 1, fin: 1, size: 1 }, // classic, chunky
  hammerhead: { width: 0.078, trunk: 1, fin: 1, size: 1 },
  reef: { width: 0.066, trunk: 1, fin: 0.8, size: 0.8 }, // slim, small fins, black-tipped dorsal
  thresher: { width: 0.072, trunk: 0.62, fin: 1, size: 1.15 }, // short trunk, then a whip of a tail
};

function halfWidth(s: number, kind: SharkKind): number {
  if (s < 0 || s > 0.95) return 0;
  const { width, trunk } = BODY[kind];
  const u = s / trunk;
  const body = u < 1 ? width * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.8) : 0;
  // The thresher's tail stalk carries on, thin, well past where the trunk ends.
  const stalk = trunk < 1 && s > trunk - 0.1 ? 0.012 * (1 - (s - trunk + 0.1) / (1.05 - trunk)) : 0;
  return Math.max(body, stalk);
}

export function sizeFactor(kind: SharkKind) {
  return BODY[kind].size;
}

const HAMMER = 0.19; // half-span of the cephalofoil

/** The hammer: a wide, slightly swept-back bar across the front of the head. */
function hammer(s: number, a: number): number {
  if (a > HAMMER) return 0;
  const t = a / HAMMER;
  const front = 0.04 * t * t;
  const back = 0.115 - 0.045 * Math.pow(t, 1.5);
  if (s < front || s > back) return 0;
  if (t > 0.84) return 1; // eyes at the tips
  return 0.75 - 0.3 * t;
}

function inTri(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

const MAX_SPAN = 0.25;
const RIGID_HEAD = 0.14; // front fraction of the body that turns as one solid piece

/**
 * 0 outside the shark, otherwise a density in (0, 1].
 * `side` says which way this half of the body faces on screen: +1 towards the
 * viewer's bottom edge (belly, lit), -1 towards the top (back, in shadow).
 * It fakes a slightly tilted camera so the sharks read as 3D.
 */
export function sharkDensity(s: number, y: number, kind: SharkKind, side = 0): number {
  const a = Math.abs(y);
  const w = halfWidth(s, kind);
  const hh = kind === "hammerhead";

  if (hh) {
    const b = hammer(s, a);
    if (b > 0 && a > w) return b;
  }

  if (w > 0 && a <= w) {
    if (!hh && Math.hypot(s - 0.06, a - w * 0.62) < 0.014) return 1; // eyes
    const n = a / w;
    // Rounded falloff to pale edges, plus a dark core behind the head where the body is thickest.
    let b = 0.14 + 0.66 * Math.pow(1 - n * n, 1.3);
    b += 0.32 * Math.exp(-(((s - 0.28) / 0.13) ** 2)) * (1 - n) ** 1.5;
    if (n < 0.22 && s > 0.12) b += 0.12; // dorsal ridge
    b *= 1 - 0.3 * side * n; // countershading: dark back, pale belly
    // Gill slits on the lit flank.
    if (side > 0.2 && n > 0.45 && n < 0.85 && gill(hh ? s - 0.02 : s)) b *= 0.55;
    return clamp(b * (1.05 - 0.5 * s), 0.08, 1);
  }

  // The near pectoral fin is seen in full; the far one is mostly hidden behind the body.
  // Fin positions scale with the trunk so the thresher's sit further forward.
  const { trunk, fin } = BODY[kind];
  const fs = (0.78 + 0.27 * side) * fin;
  const fa = a / fs;
  const st = s / trunk;
  if (hh) {
    if (inTri(s, fa, 0.25, 0.04, 0.45, 0.19, 0.39, 0.04)) return 0.4;
  } else if (inTri(st, fa, 0.22, 0.05, 0.47, MAX_SPAN, 0.4, 0.05)) {
    return 0.42 - 0.3 * (fa - w);
  }
  if (inTri(st, fa, 0.62, 0.02, 0.73, 0.08, 0.7, 0.02)) return 0.3;
  if (trunk === 1 && inTri(s, a, 0.83, 0, 1.02, 0.07, 0.95, 0)) return 0.34; // lower tail lobe
  return 0;
}

function gill(s: number): boolean {
  for (let k = 0; k < 4; k++) if (Math.abs(s - (0.17 + k * 0.022)) < 0.006) return true;
  return false;
}

/**
 * Fins that stand up out of the body plane: the dorsal fin and the upper tail
 * lobe. They're drawn straight up the screen whatever the heading, which is
 * what sells the tilted-camera look. `v` is height above the spine, in body lengths.
 */
export function uprightDensity(s: number, v: number, kind: SharkKind): number {
  const tall = kind === "hammerhead" ? 1.2 : 1;
  const vt = v / tall;
  const { trunk } = BODY[kind];
  const st = s / trunk;

  if (inTri(st, vt, 0.3, 0, 0.46, 0, 0.49, 0.15)) {
    // Concave trailing edge: carve a notch out of the back of the fin.
    if (st > 0.43 && vt < 0.09 && st - 0.43 > vt * 0.6) return 0;
    if (kind === "reef" && vt > 0.085) return 1; // the black tip
    return 0.95 - 1.1 * vt; // the darkest part of the shark, easing off only near the tip
  }

  if (kind === "thresher") {
    // The scythe: an upper tail lobe nearly as long as the rest of the shark.
    if (inTri(s, vt, 0.56, 0, 0.66, 0, 1.04, 0.11)) return 0.72 - 2 * vt;
    return 0;
  }
  if (inTri(s, vt, 0.82, 0, 0.94, 0, 1.07, 0.17)) return 0.78 - 1.1 * vt;
  return 0;
}

interface Pt {
  x: number;
  y: number;
}

export type Splat = (x: number, y: number, b: number, key: number) => void;

let nextId = 0;

export class Shark {
  readonly id = nextId++;
  /** Which body tint from the engine palette this shark wears. */
  readonly tint = Math.floor(Math.random() * 4);
  x = 0;
  y = 0;
  heading = 0;
  L = 260;
  speed = 50;
  depth = 1;
  private phase = Math.random() * Math.PI * 2;
  private omega = 0;
  private turnTarget = 0;
  private turnTimer = 0;
  private boost = 0;
  private flee = 0; // seconds of panic left
  private fleeAngle = 0;
  private trail: Pt[] = [];

  constructor(public w: number, public h: number, readonly kind: SharkKind = "shark") {
    this.depth = 0.35 + Math.random() * 0.65;
    this.L = (260 + 240 * this.depth) * clamp(Math.min(w, h) / 900, 0.5, 1.2) * sizeFactor(kind);
    this.speed = (30 + 45 * this.depth) * (0.85 + Math.random() * 0.3);
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.heading = Math.random() * Math.PI * 2;
    for (let d = Math.ceil(this.L * 1.1); d >= 0; d -= 4) {
      this.trail.push({
        x: this.x - Math.cos(this.heading) * d,
        y: this.y - Math.sin(this.heading) * d,
      });
    }
  }

  get shade() {
    return 0.55 + 0.45 * this.depth;
  }

  /**
   * React to a click at (x, y). Sharks within reach dart away, harder the
   * closer they are. Returns how startled the shark is (0 = unaffected).
   */
  scare(x: number, y: number): number {
    // Measure from the middle of the body, not just the nose.
    const mid = this.trail[Math.max(0, this.trail.length - 1 - Math.round(this.L / 8))];
    const cx = (this.x + mid.x) / 2;
    const cy = (this.y + mid.y) / 2;
    const reach = 260 + this.L * 0.6;
    const d = Math.hypot(cx - x, cy - y);
    if (d > reach) return 0;

    const f = 1 - d / reach;
    // Flee directly away from the click, with a little randomness so a group scatters.
    this.fleeAngle = Math.atan2(cy - y, cx - x) + (Math.random() - 0.5) * 0.6;
    this.flee = 0.9 + f * 1.1;
    this.boost = Math.max(this.boost, 2.5 + f * 3);
    this.turnTimer = this.flee + 0.5; // don't wander mid-escape
    return f;
  }

  update(dt: number, pointer: Pt) {
    const { w, h, L } = this;

    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      const hard = Math.random() < 0.25;
      this.turnTarget = (Math.random() < 0.5 ? -1 : 1) * (hard ? 0.9 + Math.random() * 0.7 : Math.random() * 0.5);
      this.turnTimer = 1.5 + Math.random() * 3.5;
    }

    // Drift back towards the screen if wandering too far off it.
    let steer = 0;
    const m = L * 0.15;
    if (this.x < -m || this.x > w + m || this.y < -m || this.y > h + m) {
      const toCenter = Math.atan2(h / 2 - this.y, w / 2 - this.x);
      steer += angleTo(this.heading, toCenter) * 1.4;
    }

    // Shy of the cursor.
    const dx = this.x - pointer.x;
    const dy = this.y - pointer.y;
    const reach = L * 0.7 + 80;
    const d = Math.hypot(dx, dy);
    if (d < reach) {
      const f = 1 - d / reach;
      steer += angleTo(this.heading, Math.atan2(dy, dx)) * 3 * f;
      this.boost = Math.max(this.boost, f * 1.5);
    }
    // Panic overrides everything else: a fast, decisive turn away from the click.
    let maxTurn = 2.2;
    let response = 1.2;
    if (this.flee > 0) {
      this.flee -= dt;
      steer = angleTo(this.heading, this.fleeAngle) * 6;
      this.turnTarget = 0;
      maxTurn = 4.5;
      response = 6;
    }

    this.boost *= Math.exp(-dt * (this.flee > 0 ? 0.4 : 1.3));

    // A body can't turn tighter than about half its own length (a bit tighter
    // when panicking), otherwise it coils up and the head folds into the body.
    const sp = this.speed * (1 + this.boost);
    maxTurn = Math.min(maxTurn, sp / (L * (this.flee > 0 ? 0.28 : 0.45)));

    this.omega += (clamp(this.turnTarget + steer, -maxTurn, maxTurn) - this.omega) * Math.min(1, dt * response);
    this.heading += this.omega * dt;

    this.x += Math.cos(this.heading) * sp * dt;
    this.y += Math.sin(this.heading) * sp * dt;
    this.phase += dt * (3.2 + sp / 40);

    const last = this.trail[this.trail.length - 1];
    if (Math.hypot(this.x - last.x, this.y - last.y) > 3) this.trail.push({ x: this.x, y: this.y });

    // Keep only as much trail as the body needs.
    let len = 0;
    for (let i = this.trail.length - 1; i > 0; i--) {
      const a = this.trail[i], b = this.trail[i - 1];
      len += Math.hypot(a.x - b.x, a.y - b.y);
      if (len > L * 1.15) {
        this.trail.splice(0, i - 1);
        break;
      }
    }
  }

  /** Where bubbles come from. */
  head(): Pt {
    return { x: this.x, y: this.y };
  }

  /** Point `dist` px behind the head along the trail (extrapolated past its end). */
  private trailPoint(dist: number): Pt {
    const { trail } = this;
    let ax = this.x, ay = this.y, acc = 0;
    for (let j = trail.length - 1; j > 0; j--) {
      const b = trail[j - 1];
      const seg = Math.hypot(ax - b.x, ay - b.y);
      if (seg > 1e-6 && acc + seg >= dist) {
        const t = (dist - acc) / seg;
        return { x: ax + (b.x - ax) * t, y: ay + (b.y - ay) * t };
      }
      acc += seg;
      ax = b.x;
      ay = b.y;
    }
    return { x: this.x - Math.cos(this.heading) * dist, y: this.y - Math.sin(this.heading) * dist };
  }

  /** One cross-section of the body at `s`, centred on (px, py) with normal (nx, ny). */
  private splatSlice(
    s: number, si: number, dy: number, px: number, py: number, nx: number, ny: number,
    wave: number, spineX: number[], spineY: number[], out: Splat,
  ) {
    const { L } = this;
    const span = s < 0.5 ? MAX_SPAN : s < 0.8 ? 0.09 : 0.12;
    spineX.push(px + nx * wave);
    spineY.push(py + ny * wave);

    for (let yi = -Math.ceil(span / dy); yi * dy <= span; yi++) {
      const yl = yi * dy;
      const side = Math.sign(yl) * ny; // how much this flank faces down-screen
      const b = sharkDensity(s, yl, this.kind, side);
      if (b <= 0) continue;
      const off = wave + yl * L;
      out(px + nx * off, py + ny * off, b * this.shade, (this.id << 20) | (si << 8) | (yi + 128));
    }
  }

  /** Forward-splat body samples, spaced finer than one grid cell. */
  splat(cell: number, out: Splat) {
    const { L, trail } = this;
    const ds = (cell * 0.3) / L;
    const dy = (cell * 0.3) / L;
    const head = { x: this.x, y: this.y };

    let j = trail.length - 1;
    let acc = 0;
    let ax = head.x, ay = head.y;
    let tx = Math.cos(this.heading), ty = Math.sin(this.heading);
    const spineX: number[] = [];
    const spineY: number[] = [];

    // The head is rigid: it points from the neck to the nose and turns as one
    // piece, so a wide hammer never smears around the curve of a turn.
    const neck = this.trailPoint(RIGID_HEAD * L);
    const hl = Math.hypot(head.x - neck.x, head.y - neck.y) || 1;
    const hx = (head.x - neck.x) / hl, hy = (head.y - neck.y) / hl;
    const neckWave = (0.012 + 0.06 * Math.pow(RIGID_HEAD, 1.8)) * Math.sin(this.phase - RIGID_HEAD * 5.5) * L;

    for (let si = 0, s = 0; s <= 1.03; si++, s += ds) {
      const target = s * L;
      let px = ax, py = ay;

      if (s < RIGID_HEAD) {
        px = head.x - hx * target;
        py = head.y - hy * target;
        this.splatSlice(s, si, dy, px, py, -hy, hx, neckWave, spineX, spineY, out);
        continue;
      }

      // Walk back along the trail to the point `target` px behind the head.
      for (;;) {
        if (j <= 0) {
          px = ax - tx * (target - acc);
          py = ay - ty * (target - acc);
          break;
        }
        const b = trail[j - 1];
        const seg = Math.hypot(ax - b.x, ay - b.y);
        if (seg > 1e-6 && acc + seg >= target) {
          const t = (target - acc) / seg;
          px = ax + (b.x - ax) * t;
          py = ay + (b.y - ay) * t;
          tx = (ax - b.x) / seg;
          ty = (ay - b.y) / seg;
          break;
        }
        acc += seg;
        ax = b.x;
        ay = b.y;
        j--;
      }

      // Travelling wave: the head barely moves, the tail sweeps widest.
      const wave = (0.012 + 0.06 * Math.pow(s, 1.8)) * Math.sin(this.phase - s * 5.5) * L;
      this.splatSlice(s, si, dy, px, py, -ty, tx, wave, spineX, spineY, out);
    }

    // Upright fins, rising straight up the screen from the (waving) spine.
    const last = spineX.length - 1;
    for (let si = Math.floor(0.15 / ds); si <= last; si++) {
      const s = si * ds;
      for (let vi = 1; vi * dy <= 0.22; vi++) {
        const b = uprightDensity(s, vi * dy, this.kind);
        if (b <= 0) continue;
        out(spineX[si], spineY[si] - vi * dy * L, b * this.shade, (this.id << 20) | (1 << 19) | (si << 8) | vi);
      }
    }
  }
}
