import { ThemeBadge } from "./badge";
import { SPAWN_ORDER, Shark } from "./shark";

/** Grid cell size in px — smaller on phones so the sharks keep their detail. */
export let CELL = 10;
let FONT = 7;
let GAP = 1; // px of gap around each tile

function sizeGrid() {
  // Sharks are drawn about half as long on phones, so half-size cells keep
  // the same number of tiles across a body as on desktop.
  CELL = innerWidth < 640 ? 5 : 10;
  FONT = Math.round(CELL * 0.72);
  GAP = CELL < 9 ? 0.75 : 1;
  document.documentElement.style.setProperty("--cell", `${CELL}px`);
}
const RAMP = ":;tSX%8@";
const LEVELS = 16;
const FULL = 9; // samples per cell at full coverage (splat spacing is 0.3 cell)
const ACCENT_CHANCE = 6; // % of tiles that get a stronger accent on top of the shark's cast
const RESIDENT_SHARKS = 2;
const INTRO_HOLD = 6; // seconds before the opening group starts fading
const INTRO_FADE = 2;

type RGB = [number, number, number];

export type Theme = "light" | "dark";

interface Palette {
  /** Tile colour at density 0 and 1. */
  lo: RGB;
  hi: RGB;
  /** Tints blended into the gray; repeats weight the pick. */
  accents: RGB[];
  /** One per shark: a faint overall cast every tile of that shark carries. */
  tints: RGB[];
  /** Per-tile strengths of that cast, picked by hash so it shimmers a little. */
  tintMix: number[];
  mix: number;
  textOnDense: string;
  textOnSparse: string;
  particle: string;
}

const PALETTES: Record<Theme, Palette> = {
  light: {
    lo: [232, 233, 236],
    hi: [44, 46, 54],
    accents: [
      [34, 54, 102], // navy
      [34, 54, 102],
      [72, 94, 138], // slate blue
      [72, 94, 138],
      [38, 80, 92], // deep teal
      [192, 142, 70], // amber
    ],
    mix: 0.38,
    tints: [
      [138, 118, 196], // lavender
      [146, 128, 78], // olive / khaki
      [96, 118, 172], // slate blue
      [172, 120, 146], // dusty rose
    ],
    tintMix: [0.05, 0.1, 0.17],
    textOnDense: "rgba(255,255,255,0.78)",
    textOnSparse: "rgba(38,38,44,0.62)",
    particle: "#55565c",
  },
  dark: {
    lo: [30, 32, 38],
    hi: [206, 211, 222],
    accents: [
      [64, 96, 168],
      [64, 96, 168],
      [108, 128, 176],
      [108, 128, 176],
      [58, 118, 130],
      [214, 166, 92],
    ],
    mix: 0.38,
    tints: [
      [150, 132, 214],
      [170, 150, 96],
      [112, 138, 196],
      [192, 138, 166],
    ],
    tintMix: [0.05, 0.1, 0.17],
    textOnDense: "rgba(14,15,19,0.72)",
    textOnSparse: "rgba(228,231,238,0.55)",
    particle: "#8b8e98",
  },
};

const lerp = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t) as RGB;
const css = ([r, g, b]: RGB) => `rgb(${r | 0},${g | 0},${b | 0})`;

interface Ripple {
  x: number;
  y: number;
  age: number;
  /** Set for splashes: the ring follows this rounded rect (centred on x, y) outwards. */
  shape?: SplashShape;
  /** A small, faint ring: the cursor's wake and hover ripples. */
  soft?: boolean;
}

interface SplashShape {
  w: number;
  h: number;
  r: number;
  /** Random per ring, so each one wobbles, speeds and breaks up differently. */
  seed: number;
  phases: number[];
  speed: number;
}

const RIPPLE_LIFE = 1.1;
const RIPPLE_SPEED = 420; // px/s
const SPLASH_LIFE = 0.6; // splashes fade sooner and fainter than click ripples
const SOFT_LIFE = 0.7;
const TRAIL_LIFE = 1.4; // s a dragged trail lingers
const TRAIL_SPREAD = 26; // px/s each side of the trail drifts outward, like a boat's wake

/** A point of the wake left by dragging across the water. */
interface TrailPoint {
  x: number;
  y: number;
  nx: number; // unit normal to the drag direction
  ny: number;
  age: number;
}
const lifeOf = (r: Ripple) => (r.shape ? SPLASH_LIFE : r.soft ? SOFT_LIFE : RIPPLE_LIFE);
const radiusOf = (r: Ripple) => {
  const radius = r.age * RIPPLE_SPEED * (1 - r.age / (RIPPLE_LIFE * 2.2));
  return r.soft ? radius * 0.4 : radius;
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ch: string;
  alpha: number;
  life: number;
  seed: number;
}

// Cheap integer hash so tile colours and glyphs stick to body positions.
function hash(n: number) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

export class OceanEngine {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private cols = 0;
  private rows = 0;
  private sum = new Float32Array(0);
  private count = new Uint16Array(0);
  private nearest = new Float32Array(0);
  private owner = new Int32Array(0);
  private key = new Uint32Array(0);
  private sharks: Shark[] = [];
  private dust: Particle[] = [];
  private bubbles: Particle[] = [];
  private ripples: Ripple[] = [];
  private trail: TrailPoint[] = [];
  private dragFrom?: { x: number; y: number };
  private pointer = { x: -9999, y: -9999 };
  private palette = PALETTES.light;
  /** tiles[shark tint][variant][density level]; variants are tint strengths, then accents. */
  private tiles: string[][][] = [];
  private grays: string[] = [];
  private badge?: ThemeBadge;
  private overlay?: CanvasRenderingContext2D;

  private tintById: number[] = [];
  private opacityById: number[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private readonly still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(private canvas: HTMLCanvasElement, theme: Theme = "light") {
    this.ctx = canvas.getContext("2d")!;
    this.setTheme(theme);

    addEventListener("resize", this.resize);
    addEventListener("pointermove", (e) => {
      // A finger leaves no hovering cursor. Keeping its last position makes
      // sharks keep fleeing from a touch long after the visitor has scrolled.
      if (e.pointerType !== "mouse") {
        this.pointer.x = this.pointer.y = -9999;
        return;
      }
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
    });
    addEventListener("pointerdown", (e) => {
      // Clicks on the UI shouldn't spook anything.
      if ((e.target as Element).closest("a, button, .card, .nav, .player")) return;
      this.scare(e.clientX, e.clientY);
    });
    document.addEventListener("pointerleave", () => {
      this.pointer.x = this.pointer.y = -9999;
    });
    this.resize();
  }

  start() {
    if (this.still) return this.draw();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  /**
   * A second canvas, layered above the haze, for what must stay sharp: the
   * theme toggle. The frosted pool never blurs it.
   */
  attachOverlay(layer: HTMLCanvasElement) {
    this.overlay = layer.getContext("2d")!;
    this.resize();
  }

  /** Draw the theme toggle into the grid, over the given (invisible) button. */
  attachBadge(el: HTMLElement, theme: Theme) {
    this.badge = new ThemeBadge(el, theme === "dark");
    this.badge.measure(CELL);
  }

  /** Send a ripple out from (x, y) without startling anything. */
  ripple(x: number, y: number, soft = false) {
    if (!this.still) this.ripples.push({ x, y, age: 0, soft });
  }

  /**
   * Dragging across the water: drops a wake point every cell along the path
   * from the last call. Each point splits into two lines that drift apart and
   * fade, so the drag leaves a V-shaped wake. Call endDrag() when it's over.
   */
  drag(x: number, y: number) {
    if (this.still) return;
    const from = this.dragFrom;
    this.dragFrom = { x, y };
    if (!from) return;
    const dx = x - from.x, dy = y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const nx = -dy / len, ny = dx / len;
    for (let d = CELL; d <= len; d += CELL) {
      this.trail.push({ x: from.x + (dx * d) / len, y: from.y + (dy * d) / len, nx, ny, age: 0 });
    }
    this.dragFrom = { x: from.x + (dx * Math.floor(len / CELL) * CELL) / len, y: from.y + (dy * Math.floor(len / CELL) * CELL) / len };
  }

  endDrag() {
    this.dragFrom = undefined;
  }

  /** Startle sharks near (x, y) without a ripple, e.g. when the content changes. */
  scatter(x: number, y: number) {
    if (this.still) return;
    for (const s of this.sharks) {
      const f = s.scare(x, y);
      if (f > 0) this.burst(s.head(), Math.round(2 + f * 4));
    }
  }

  /**
   * Something flat landing on the water: rings spread out from the edges of
   * the given rect instead of from a point, a few in quick succession.
   */
  splash(rect: { x: number; y: number; width: number; height: number }, corner = 14, rings = 2, reach = 1) {
    if (this.still) return;
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    // Later rings start with negative age (and a little jitter), so they wait their turn.
    for (let k = 0; k < rings; k++) {
      const shape: SplashShape = {
        w: rect.width,
        h: rect.height,
        r: corner,
        seed: (Math.random() * 2 ** 31) | 0,
        phases: [0, 0, 0].map(() => Math.random() * Math.PI * 2),
        speed: (0.8 + Math.random() * 0.4) * reach,
      };
      this.ripples.push({ x, y, age: -k * 0.09 - Math.random() * 0.04, shape });
    }
  }

  /** Startle sharks near (x, y) and send a ripple out from it. */
  scare(x: number, y: number) {
    this.ripple(x, y);
    for (const s of this.sharks) {
      const f = s.scare(x, y);
      if (f > 0) this.burst(s.head(), Math.round(3 + f * 6));
    }
  }

  private burst(at: { x: number; y: number }, n: number) {
    for (let k = 0; k < n; k++) {
      this.bubbles.push({
        x: at.x + (Math.random() - 0.5) * 24,
        y: at.y + (Math.random() - 0.5) * 24,
        vx: (Math.random() - 0.5) * 8,
        vy: -4 - Math.random() * 8,
        ch: "o",
        alpha: 0.7,
        life: 1 + Math.random() * 1.5,
        seed: 0,
      });
    }
  }

  setTheme(theme: Theme) {
    const p = (this.palette = PALETTES[theme]);
    const grays = Array.from({ length: LEVELS }, (_, i) => lerp(p.lo, p.hi, Math.pow(i / (LEVELS - 1), 1.15)));
    this.grays = grays.map(css);
    if (this.badge) {
      this.badge.setDark(theme === "dark");
      const c = this.badge.center(CELL);
      this.ripple(c.x, c.y);
    }
    this.tiles = p.tints.map((tint) => {
      const cast = grays.map((g) => lerp(g, tint, p.tintMix[0]));
      return [
        ...p.tintMix.map((m) => grays.map((g) => css(lerp(g, tint, m)))),
        ...p.accents.map((a) => cast.map((g) => css(lerp(g, a, p.mix)))),
      ];
    });
    if (this.still && this.w) this.draw();
  }

  private resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sizeGrid();
    this.ctx.font = `500 ${FONT}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    this.cols = Math.ceil(this.w / CELL);
    this.rows = Math.ceil(this.h / CELL);
    const n = this.cols * this.rows;
    this.sum = new Float32Array(n);
    this.count = new Uint16Array(n);
    this.nearest = new Float32Array(n);
    this.owner = new Int32Array(n);
    this.key = new Uint32Array(n);

    const opening = !this.still && this.time < INTRO_HOLD + INTRO_FADE;
    const want = opening ? Math.round(Math.min(7, Math.max(3, (this.w * this.h) / 360_000))) : RESIDENT_SHARKS;
    for (const s of this.sharks) {
      s.w = this.w;
      s.h = this.h;
    }
    while (this.sharks.length < want) {
      const s = new Shark(this.w, this.h, SPAWN_ORDER[this.sharks.length % SPAWN_ORDER.length]);
      s.intro = this.sharks.length >= RESIDENT_SHARKS;
      this.sharks.push(s);
    }

    this.dust = Array.from({ length: Math.round((this.w * this.h) / 9000) }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      ch: Math.random() < 0.75 ? "-" : ".",
      alpha: 0.15 + Math.random() * 0.4,
      life: Infinity,
      seed: Math.random() * 100,
    }));

    if (this.overlay) {
      this.overlay.canvas.width = this.w * dpr;
      this.overlay.canvas.height = this.h * dpr;
      this.overlay.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.overlay.font = this.ctx.font;
      this.overlay.textAlign = "center";
      this.overlay.textBaseline = "middle";
    }
    this.badge?.measure(CELL);
    if (this.still) this.draw();
  };

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number) {
    this.badge?.update(dt, this.pointer, CELL);
    const introOpacity = Math.max(0, 1 - Math.max(0, this.time - INTRO_HOLD) / INTRO_FADE);
    this.sharks = this.sharks.filter((s) => !s.intro || introOpacity > 0);
    for (const s of this.sharks) {
      s.opacity = s.intro ? introOpacity : 1;
      s.update(dt, this.pointer);
      if (Math.random() < dt * 0.6) this.burst(s.head(), 2 + Math.floor(Math.random() * 3));
    }
    this.sharks.sort((a, b) => a.depth - b.depth);

    for (const p of this.dust) {
      p.x = (p.x + p.vx * dt + this.w) % this.w;
      p.y = (p.y + p.vy * dt + this.h) % this.h;
    }
    for (const p of this.bubbles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = Math.min(0.7, p.life);
    }
    this.bubbles = this.bubbles.filter((p) => p.life > 0);

    for (const r of this.ripples) r.age += dt;
    this.ripples = this.ripples.filter((r) => r.age < lifeOf(r));
    for (const p of this.trail) p.age += dt;
    this.trail = this.trail.filter((p) => p.age < TRAIL_LIFE);
  }

  private draw() {
    const { ctx, cols, rows, sum, count, nearest, owner, key } = this;
    owner.fill(-1);

    // Far sharks first; nearer ones overwrite the cells they cover.
    for (const s of this.sharks) {
      const id = s.id;
      this.tintById[id] = s.tint;
      this.opacityById[id] = s.opacity;
      s.splat(CELL, (x, y, b, k) => {
        const c = Math.floor(x / CELL);
        const r = Math.floor(y / CELL);
        if (c < 0 || r < 0 || c >= cols || r >= rows) return;
        const i = r * cols + c;
        // Glyph/accent come from the sample nearest the cell centre, so the
        // texture slides with the body instead of flickering.
        const d = Math.abs(x - (c + 0.5) * CELL) + Math.abs(y - (r + 0.5) * CELL);
        if (owner[i] !== id) {
          owner[i] = id;
          sum[i] = b;
          count[i] = 1;
          nearest[i] = d;
          key[i] = k;
        } else {
          sum[i] += b;
          count[i]++;
          if (d < nearest[i]) {
            nearest[i] = d;
            key[i] = k;
          }
        }
      });
    }

    ctx.clearRect(0, 0, this.w, this.h);

    // Text-only layers under the tiles.
    const t = this.time;
    const pal = this.palette;
    ctx.fillStyle = pal.particle;
    for (const p of this.dust) {
      ctx.globalAlpha = p.alpha * (0.6 + 0.4 * Math.sin(t * 0.8 + p.seed));
      this.glyphAt(p.x, p.y, p.ch);
    }
    ctx.globalAlpha = 1;

    const top = RAMP.length - 1;
    const bright = this.sum;
    const alpha = this.nearest; // reused: coverage per drawn cell
    const light: number[] = [];
    const dark: number[] = [];
    for (let i = 0; i < owner.length; i++) {
      if (owner[i] < 0) continue;
      const b = (bright[i] /= count[i]);
      alpha[i] = Math.min(1, count[i] / FULL) ** 0.8 * this.opacityById[owner[i]];
      if (alpha[i] < 0.08) continue;
      ctx.globalAlpha = alpha[i];
      const hk = hash(key[i]);
      const x = (i % cols) * CELL;
      const y = Math.floor(i / cols) * CELL;

      const variant =
        hk % 100 < ACCENT_CHANCE
          ? pal.tintMix.length + ((hk >>> 8) % pal.accents.length)
          : (hk >>> 12) % pal.tintMix.length;
      const level = Math.min(LEVELS - 1, Math.round(b * (LEVELS - 1)));
      ctx.fillStyle = this.tiles[this.tintById[owner[i]] % this.tiles.length][variant][level];
      ctx.fillRect(x + GAP, y + GAP, CELL - 2 * GAP, CELL - 2 * GAP);
      (b > 0.55 ? light : dark).push(i);
    }

    const glyph = (i: number) => {
      const j = Math.round(bright[i] * top + (((hash(key[i]) >>> 4) % 3) - 1) * 0.7);
      return RAMP[Math.max(0, Math.min(top, j))];
    };
    ctx.fillStyle = pal.textOnDense;
    for (const i of light) this.cellText(i, glyph(i), alpha[i]);
    ctx.fillStyle = pal.textOnSparse;
    for (const i of dark) this.cellText(i, glyph(i), alpha[i]);

    // The theme toggle, on the overlay above the haze, on a finer grid of the
    // same tiles — too small for glyphs, so the gray level carries the shading.
    if (this.badge && this.overlay) {
      const b = this.overlay;
      const tile = CELL / this.badge.div;
      const gap = GAP / 2;
      b.clearRect(0, 0, this.w, this.h);
      for (const k of this.badge.cells()) {
        b.globalAlpha = k.a;
        b.fillStyle = this.grays[Math.min(LEVELS - 1, Math.round(k.b * (LEVELS - 1)))];
        b.fillRect(k.c * tile + gap, k.r * tile + gap, tile - 2 * gap, tile - 2 * gap);
      }
      b.globalAlpha = 1;
    }

    // Ripples: a ring of grid-snapped dots, fading as it spreads.
    ctx.fillStyle = pal.particle;
    // The drag's wake: a bright line at first that splits and drifts apart.
    for (const p of this.trail) {
      const f = p.age / TRAIL_LIFE;
      ctx.globalAlpha = 0.85 * (1 - f) ** 1.2;
      const ch = p.age < 0.6 ? "o" : p.age < 1 ? "·" : ".";
      const spread = p.age * TRAIL_SPREAD;
      if (spread < CELL / 2) {
        this.glyphAt(p.x, p.y, ch);
      } else {
        this.glyphAt(p.x + p.nx * spread, p.y + p.ny * spread, ch);
        this.glyphAt(p.x - p.nx * spread, p.y - p.ny * spread, ch);
      }
    }

    for (const r of this.ripples) {
      if (r.age < 0) continue;
      const radius = radiusOf(r);
      ctx.globalAlpha = r.soft ? 0.28 * (1 - r.age / SOFT_LIFE) : 0.6 * (1 - r.age / RIPPLE_LIFE);
      const ch = r.soft ? "." : r.age < 0.35 ? "o" : r.age < 0.7 ? "·" : ".";
      if (r.shape) {
        // Splashes go on the overlay, so the haze doesn't soften the ones
        // around the content: they look the same everywhere.
        const o = this.overlay ?? ctx;
        o.fillStyle = pal.particle;
        o.globalAlpha = 0.24 * (1 - r.age / SPLASH_LIFE);
        this.rectRing(o, r.x, r.y, r.shape, radius * r.shape.speed, r.age / SPLASH_LIFE, ch);
        o.globalAlpha = 1;
        continue;
      }
      const n = Math.max(12, Math.round((radius * Math.PI * 2) / CELL));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        this.glyphAt(r.x + Math.cos(a) * radius, r.y + Math.sin(a) * radius, ch);
      }
    }

    for (const p of this.bubbles) {
      ctx.globalAlpha = p.alpha;
      this.glyphAt(p.x, p.y, p.ch);
    }
    ctx.globalAlpha = 1;
  }

  private cellText(i: number, ch: string, a: number) {
    this.ctx.globalAlpha = a;
    this.ctx.fillText(ch, (i % this.cols) * CELL + CELL / 2, Math.floor(i / this.cols) * CELL + CELL / 2 + 0.5);
  }

  /**
   * A rounded rect grown outward by roughly `grow`, traced as moving
   * dots. The distance wobbles smoothly around the ring (a few sines with
   * random phases) and dots drop out as it ages, so no two splashes match.
   */
  private rectRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: SplashShape, grow: number, life: number, ch: string) {
    const hx = s.w / 2 - s.r; // half-size of the straight edges
    const hy = s.h / 2 - s.r;
    const [p1, p2, p3] = s.phases;
    // (bx, by) is a point on the card's own outline, (nx, ny) its outward normal.
    const dot = (bx: number, by: number, nx: number, ny: number) => {
      const a = Math.atan2(by + ny * s.r, bx + nx * s.r);
      // Gaps come in short arcs (dots share a fate per ~7° slice), and widen with age.
      if ((hash(s.seed + Math.round((a + 4) * 8)) & 1023) / 1023 < 0.15 + life * 0.6) return;
      const wobble = 1 + 0.22 * Math.sin(a * 2 + p1) + 0.14 * Math.sin(a * 5 + p2) + 0.08 * Math.sin(a * 9 + p3);
      const d = s.r + grow * wobble;
      // Keep the grid's spacing, but move continuously between cells. Snapping
      // a slow, straight edge to CELL makes the whole wave jump in lockstep.
      ctx.fillText(ch, cx + bx + nx * d, cy + by + ny * d);
    };
    const step = CELL;
    for (let x = -hx; x <= hx; x += step) {
      dot(x, -hy, 0, -1);
      dot(x, hy, 0, 1);
    }
    for (let y = -hy; y <= hy; y += step) {
      dot(-hx, y, -1, 0);
      dot(hx, y, 1, 0);
    }
    const n = Math.max(3, Math.round(((s.r + grow) * Math.PI) / 2 / step));
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * (Math.PI / 2);
      const c = Math.cos(a), sn = Math.sin(a);
      dot(hx, hy, c, sn);
      dot(-hx, hy, -c, sn);
      dot(hx, -hy, c, -sn);
      dot(-hx, -hy, -c, -sn);
    }
  }

  private glyphAt(x: number, y: number, ch: string, ctx = this.ctx) {
    ctx.fillText(ch, Math.floor(x / CELL) * CELL + CELL / 2, Math.floor(y / CELL) * CELL + CELL / 2);
  }
}
