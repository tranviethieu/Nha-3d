// Editable layout: room sizes (the house stretches) and per-object size/offset overrides, saved to the DB.
//
// The house is modelled on a fixed 14 x 9 m plan. A PlanMap turns those default PLAN coordinates into the edited
// ones, one axis at a time. Each axis is cut into intervals at the edges of "rigid" spans (wall thickness, door
// and window openings), which never change length. The remaining "elastic" spans are room interiors. Changing a
// room's width adds its delta to the elastic spans inside that room, in proportion to their length. Everything
// structural (walls, floors, roof, openings) is mapped point by point. Furniture keeps its size and moves with
// the wall it is closest to (see buildHouse's obj()).

export interface ObjOverride { w?: number; d?: number; h?: number; dx?: number; dz?: number }
/** Door: w = leaf width (both leaves for the main double door), h = height. Window: w, h, sill = bottom height. */
export interface OpeningOverride { w?: number; h?: number; sill?: number; /** removed: no leaf, the wall is closed */ hidden?: boolean }
export interface Layout {
  /** Extra width (dw, along x) / depth (dd, along z) added to a room, keyed by ROOM_DIMS.room. */
  rooms: Record<string, { dw?: number; dd?: number }>;
  objects: Record<string, ObjOverride>;
  /** Door and window size overrides, keyed by DOOR_SPECS / WIN_SPECS id. */
  openings: Record<string, OpeningOverride>;
  /** Main roof: l = length along x, w = width along z (both incl. overhang), h = rise from eaves to ridge. */
  roof: RoofOverride;
  /** Sub roofs over the ancestor room (tho) and the porch (sanh), same fields as `roof`. */
  subRoofs: { tho?: RoofOverride; sanh?: RoofOverride };
  /** Colour overrides ('#rrggbb'), keyed by COLOR_SPECS key. */
  colors: Record<string, string>;
  /** Mirror the house front-to-back (porch on the other side); the site (ground, side path, wall, ditch) stays. */
  mirror?: boolean;
  /** Outdoor lights: spacing (m) between the downlights under the eaves. */
  lights?: { spacing?: number };
  /** YouTube link played on the living-room TV. */
  tvUrl?: string;
}
/** Editable colours. Defaults follow the client's reference photo (white walls, charcoal mouldings, slate roof). */
export const COLOR_SPECS = [
  { key: 'wall', label: 'Tường', hint: 'tường trong và ngoài', def: '#f4f3ef' },
  { key: 'topBand', label: 'Phào trên', hint: 'dải dưới mái, ô ốp cửa sổ phòng thờ, sọc cột hiên', def: '#3b3f45' },
  { key: 'bottomBand', label: 'Phào dưới', hint: 'chân tường, chân cột hiên', def: '#2f3236' },
  { key: 'roof', label: 'Mái ngói', hint: 'cả 3 mái; bờ nóc, chóp mái đậm hơn', def: '#2c3447' },
  { key: 'fascia', label: 'Viền mái', hint: 'viền và trần mái đua, trần hiên', def: '#ffffff' },
  { key: 'column', label: 'Cột, dầm hiên', hint: 'cột và dầm sảnh', def: '#ffffff' },
  { key: 'winFrame', label: 'Khung cửa sổ', hint: 'khung nhôm các cửa sổ', def: '#2b2d31' },
] as const;
export type ColorKey = typeof COLOR_SPECS[number]['key'];
export interface RoofOverride { l?: number; w?: number; h?: number }
export const emptyLayout = (): Layout => ({ rooms: {}, objects: {}, openings: {}, roof: {}, subRoofs: {}, colors: {} });
/** Fill in fields missing from older saved layouts. */
export const normalizeLayout = (l: Partial<Layout> | null | undefined): Layout =>
  ({ rooms: l?.rooms ?? {}, objects: l?.objects ?? {}, openings: l?.openings ?? {}, roof: l?.roof ?? {}, subRoofs: l?.subRoofs ?? {}, colors: l?.colors ?? {}, ...(l?.mirror ? { mirror: true } : {}), ...(l?.lights ? { lights: l.lights } : {}), ...(l?.tvUrl ? { tvUrl: l.tvUrl } : {}) });

export type Dir = '+x' | '-x' | '+z' | '-z';
/** A hinged door in a wall. axis: the axis the opening runs along; at: the wall's centre line on the other axis;
 *  hinge: hinge position along `axis` (main door: centre of the pair); len: default leaf width; pad: extra
 *  opening width beside the leaf; cd / od: leaf direction closed / open. */
export interface DoorSpec {
  id: string; label: string; room: string; axis: 'x' | 'z'; at: number; hinge: number; len: number; pad?: number;
  cd: Dir; od: Dir; kind: 'main' | 'outer' | 'inner' | 'wc';
  /** default leaf height (2.1 m if not given) */
  h?: number;
}
/** Main entrance: fixed side light width on each side of the two leaves (total 2.8 m = 1.8 leaves + 2 x 0.5). */
export const MAIN_SIDE = 0.5;
/** Main entrance: fixed transom (ô sáng) over the leaves; leaves 2.25 + 0.45 = 2.7 m, level with the window tops. */
export const MAIN_TRANSOM = 0.45;
/** Ancestor room (phòng thờ): no door; its wall to the living room is a wooden slatted partition (default plan
 *  coords) up to the ceiling, with an open passage [open] of height openH. Masonry only above the ceiling. */
/** Outer face of the ancestor room's front wall (default plan x): 0.06 in front of the porch line x = 0, so the
 *  room is 2.41 m wide inside (THO_X + 0.2 .. 2.55): three 800 tiles + two 3 mm joints + ~2 mm at each wall. */
export const THO_X = -0.06;
export const THO_SCREEN = { x0: 1.2, x1: 2.55, z0: 4.95, z1: 5.05, top: 3.2, open: [1.42, 2.22] as [number, number], openH: 2.2 };
export const DOOR_SPECS: DoorSpec[] = [
  { id: 'd-main', label: 'Cửa chính (đôi, nhôm kính)', room: 'Phòng khách', axis: 'z', at: 1.1, hinge: 2.575, len: 1.8, cd: '+z', od: '-x', kind: 'main', h: 2.25 },
  { id: 'd-hong', label: 'Cửa hông (tường Tây)', room: 'Hành lang', axis: 'z', at: 13.9, hinge: 4.1, len: 0.8, cd: '+z', od: '-x', kind: 'outer' },
  { id: 'd-pn1', label: 'Cửa phòng ngủ 1', room: 'Phòng ngủ 1', axis: 'x', at: 5.0, hinge: 6.17, len: 0.9, cd: '-x', od: '+z', kind: 'inner', h: 2.2 },
  { id: 'd-pn2', label: 'Cửa phòng ngủ 2', room: 'Phòng ngủ 2', axis: 'x', at: 5.0, hinge: 9.85, len: 0.9, cd: '-x', od: '+z', kind: 'inner', h: 2.2 },
  { id: 'd-pn3', label: 'Cửa phòng ngủ 3', room: 'Phòng ngủ 3', axis: 'x', at: 4.0, hinge: 10.15, len: 0.9, cd: '+x', od: '-z', kind: 'inner', h: 2.2 },
  { id: 'd-wc1', label: 'Cửa WC1', room: 'WC1', axis: 'x', at: 6.25, hinge: 12.24, len: 0.7, cd: '-x', od: '+z', kind: 'wc' },
  { id: 'd-wc2', label: 'Cửa WC2', room: 'WC2', axis: 'x', at: 6.25, hinge: 13.57, len: 0.7, cd: '-x', od: '+z', kind: 'wc' },
];
/** A window opening [x0, z0, x1, z1, y0, y1] in default plan coords (the box spans the wall thickness). */
export interface WinSpec { id: string; label: string; room: string; rect: [number, number, number, number, number, number]; style: 'triple' | 'quad' | 'awning' | 'double' }
export const WIN_SPECS: WinSpec[] = [
  { id: 'w-khach', label: 'Cửa sổ phòng khách (4 cánh, 2,44 m)', room: 'Phòng khách', rect: [2.38, -0.02, 4.82, 0.22, 0.9, 2.7], style: 'quad' },
  { id: 'w-bep2', label: 'Cửa sổ bếp 0,8 m (thay cửa phụ)', room: 'Bếp + ăn', rect: [6.62, -0.02, 7.42, 0.22, 0.9, 2.7], style: 'double' },
  { id: 'w-bep', label: 'Cửa sổ bếp (hất lên)', room: 'Bếp + ăn', rect: [7.97, -0.02, 9.17, 0.22, 0.9, 1.7], style: 'awning' },
  { id: 'w-pn3t', label: 'Cửa sổ mặt tiền', room: 'Phòng ngủ 3', rect: [10.15, -0.02, 11.3, 0.22, 0.9, 2.7], style: 'double' },
  { id: 'w-tho', label: 'Cửa sổ phòng thờ (3 cánh)', room: 'Phòng thờ', rect: [THO_X - 0.02, 6.12, THO_X + 0.22, 7.72, 0.9, 2.7], style: 'triple' },
  { id: 'w-pn1', label: 'Cửa sổ', room: 'Phòng ngủ 1', rect: [3.95, 8.78, 5.1, 9.02, 0.9, 2.7], style: 'double' },
  { id: 'w-pn2', label: 'Cửa sổ', room: 'Phòng ngủ 2', rect: [8.035, 8.78, 9.185, 9.02, 0.9, 2.7], style: 'double' },
  { id: 'w-wc1', label: 'Cửa sổ', room: 'WC1', rect: [11.33, 8.78, 11.93, 9.02, 1.6, 2.2], style: 'double' },
  { id: 'w-wc2', label: 'Cửa sổ', room: 'WC2', rect: [12.81, 8.78, 13.41, 9.02, 1.6, 2.2], style: 'double' },
  // west wall (x = 14; the porch side x = 0 faces east): beside the washing machine
  { id: 'w-giat', label: 'Cửa sổ cạnh máy giặt', room: 'Lavabo', rect: [13.78, 5.25, 14.02, 5.95, 1.1, 2.0], style: 'double' },
];
const winAlongX = (r: WinSpec['rect']) => r[2] - r[0] > r[3] - r[1];

/** A door with its override applied, in default plan coords. span: the wall opening along `axis`; leaf: leaf
 *  width (each leaf for the main door: w / 2); hingeAt: where the (first) leaf hinges. */
export interface DoorEff { spec: DoorSpec; w: number; h: number; span: [number, number]; hidden: boolean }
export function doorEff(s: DoorSpec, o: OpeningOverride = {}): DoorEff {
  const w = o.w ?? s.len, h = o.h ?? s.h ?? 2.1;
  const span: [number, number] = s.kind === 'main' ? [s.hinge - w / 2 - MAIN_SIDE, s.hinge + w / 2 + MAIN_SIDE]
    : s.cd[0] === '+' ? [s.hinge, s.hinge + w + (s.pad ?? 0)] : [s.hinge - w, s.hinge];
  return { spec: s, w, h, span, hidden: !!o.hidden };
}
/** A window with its override applied (width kept centred, height kept on the sill). */
export function winEff(s: WinSpec, o: OpeningOverride = {}): WinSpec['rect'] {
  const r = [...s.rect] as WinSpec['rect'], ax = winAlongX(r) ? 0 : 1;
  if (o.w) { const c = (r[ax] + r[ax + 2]) / 2; r[ax] = c - o.w / 2; r[ax + 2] = c + o.w / 2; }
  const h = o.h ?? r[5] - r[4]; r[4] = o.sill ?? r[4]; r[5] = r[4] + h;
  return r;
}

export interface RoomDim {
  /** Key from rooms.ts (HUD room name), also the key in Layout.rooms. */
  room: string;
  title: string;
  /** Interior rectangle in default PLAN coords [x0, z0, x1, z1]. */
  rect: [number, number, number, number];
  /** Figures printed on the client's floor plan. */
  w: string; d: string; area: string;
}

// Figures as printed on the floor plan (14 m x 9 m, facade = z 0). Hành lang has no area on the
// plan, so it is computed from the model.
export const ROOM_DIMS: RoomDim[] = [
  { room: 'Sảnh', title: 'Hiên', rect: [0, 0, 1.0, 4.95], w: '1', d: '4.95', area: '4.95' },
  { room: 'Phòng khách', title: 'Phòng khách', rect: [1.2, 0.2, 5.95, 4.95], w: '4.8', d: '4.75', area: '22.80' },
  { room: 'Bếp + ăn', title: 'Bếp + ăn', rect: [5.95, 0.2, 9.95, 4.95], w: '3.95', d: '4.75', area: '18.76' },
  { room: 'Phòng ngủ 3', title: 'P. ngủ 3', rect: [10.05, 0.2, 13.8, 3.95], w: '3.75', d: '3.75', area: '14.06' },
  { room: 'Hành lang', title: 'Hành lang', rect: [10.05, 4.05, 13.8, 4.95], w: '3.75', d: '0.9', area: '≈3.38' },
  { room: 'Phòng thờ', title: 'P. thờ', rect: [0.14, 5.05, 2.55, 8.8], w: '2.41', d: '3.75', area: '9.04' },
  { room: 'Phòng ngủ 1', title: 'Phòng ngủ 1', rect: [2.65, 5.05, 6.4, 8.8], w: '3.75', d: '3.75', area: '14.06' },
  { room: 'Phòng ngủ 2', title: 'Phòng ngủ 2', rect: [6.5, 5.05, 10.72, 8.8], w: '4.22', d: '3.75', area: '15.83' },
  { room: 'Lavabo', title: 'Giặt + rửa', rect: [10.82, 5.05, 13.8, 6.2], w: '2.98', d: '1.15', area: '3.43' },
  { room: 'WC1', title: 'WC1', rect: [10.84, 6.32, 12.44, 8.78], w: '1.6', d: '2.46', area: '3.94' },
  { room: 'WC2', title: 'WC2', rect: [12.58, 6.32, 13.78, 8.78], w: '1.2', d: '2.46', area: '2.95' },
];

// Rigid spans in default plan coords: wall thickness (walls running along z for X, along x for Z, incl. the WC
// tile skins). Door and window openings are added per layout in PlanMap. Keep in sync with WALLS in house.ts.
const WALL_RIGID_X: [number, number][] = [[THO_X, THO_X + 0.2], [1.0, 1.2], [2.55, 2.65], [6.4, 6.5], [9.95, 10.05], [10.72, 10.84], [12.44, 12.58], [13.78, 14]];
const WALL_RIGID_Z: [number, number][] = [[0, 0.2], [3.95, 4.05], [4.95, 5.05], [6.2, 6.32], [8.78, 9]];

class Axis {
  private b: number[];
  private nb: number[];
  constructor(private rigid: [number, number][], deltas: { span: [number, number]; d: number }[]) {
    this.b = [...new Set(rigid.flat())].sort((p, q) => p - q);
    const n = this.b.length - 1, len = Array.from({ length: n }, (_, i) => this.b[i + 1] - this.b[i]);
    const elastic = len.map((_, i) => { const m = (this.b[i] + this.b[i + 1]) / 2; return !rigid.some(([a, c]) => m > a && m < c); });
    const add = new Array(n).fill(0);
    for (const { span: [s0, s1], d } of deltas) {
      if (!d) continue;
      const ov = len.map((_, i) => elastic[i] ? Math.max(0, Math.min(s1, this.b[i + 1]) - Math.max(s0, this.b[i])) : 0);
      const tot = ov.reduce((p, q) => p + q, 0);
      if (tot > 0) ov.forEach((o, i) => { add[i] += d * o / tot; });
    }
    this.nb = [this.b[0]];
    for (let i = 0; i < n; i++) this.nb.push(this.nb[i] + (elastic[i] ? Math.max(0.02, len[i] + add[i]) : len[i]));
  }
  /** Default plan coordinate -> edited plan coordinate. */
  m(x: number) {
    const b = this.b, nb = this.nb, n = b.length - 1;
    if (x <= b[0]) return x + nb[0] - b[0];
    if (x >= b[n]) return x + nb[n] - b[n];
    let i = 0; while (x > b[i + 1]) i++;
    return nb[i] + (x - b[i]) / (b[i + 1] - b[i]) * (nb[i + 1] - nb[i]);
  }
  /** Which edge of [a0, a1] (default coords) to keep fixed: the one closer to a rigid span (a wall). */
  anchor(a0: number, a1: number): { pivot: number; to: number } {
    let below = -Infinity, above = Infinity;
    for (const [s, e] of this.rigid) { if (e <= a0 + 1e-6) below = Math.max(below, e); if (s >= a1 - 1e-6) above = Math.min(above, s); }
    return a0 - below <= above - a1 ? { pivot: a0, to: this.m(a0) } : { pivot: a1, to: this.m(a1) };
  }
}

export class PlanMap {
  readonly x: Axis;
  readonly z: Axis;
  constructor(readonly layout: Layout = emptyLayout()) {
    const dx: { span: [number, number]; d: number }[] = [], dz: typeof dx = [];
    for (const r of ROOM_DIMS) {
      const o = layout.rooms[r.room]; if (!o) continue;
      dx.push({ span: [r.rect[0], r.rect[2]], d: o.dw ?? 0 });
      dz.push({ span: [r.rect[1], r.rect[3]], d: o.dd ?? 0 });
    }
    const rx = [...WALL_RIGID_X], rz = [...WALL_RIGID_Z];
    for (const d of this.doors) if (!d.hidden) (d.spec.axis === 'x' ? rx : rz).push(d.span);
    for (const w of this.windows) if (!w.hidden) (winAlongX(w.rect) ? rx : rz).push(winAlongX(w.rect) ? [w.rect[0], w.rect[2]] : [w.rect[1], w.rect[3]]);
    this.x = new Axis(rx, dx);
    this.z = new Axis(rz, dz);
  }
  /** The three hip roofs in EDITED plan coords, with overrides applied. Each has its own slope t = rise / half
   *  width (default 30°). Main: left edge fixed at x 0.2, longer toward the west, wider on both sides. Sub roofs
   *  (ancestor room, porch): the end inside the main roof (x 4.0) is fixed, longer toward the east; each keeps the
   *  edge it shares with the other one (thờ grows north, sảnh grows south). */
  get roofs() {
    const slope = Math.tan(Math.PI / 6), mx = this.mx, mz = this.mz;
    const make = (o: RoofOverride, x0: number, x1: number, z0: number, z1: number, grow: 'x1' | 'x0', side: 'mid' | 'z1' | 'z0') => {
      const dL = x1 - x0, dW = z1 - z0, L = o.l ?? dL, W = o.w ?? dW, rise = o.h ?? (W / 2) * slope;
      const X0 = grow === 'x1' ? x0 : x1 - L, X1 = grow === 'x1' ? x0 + L : x1;
      const Z0 = side === 'mid' ? (z0 + z1) / 2 - W / 2 : side === 'z1' ? z0 : z1 - W, Z1 = Z0 + W;
      return { X0, X1, Z0, Z1, L, W, rise, t: rise / (W / 2), base: { L: dL, W: dW, rise: (dW / 2) * slope } };
    };
    const l = this.layout;
    return {
      main: make(l.roof ?? {}, mx(0.2), mx(14.8), mz(-0.8), mz(9.8), 'x1', 'mid'),
      tho: make(l.subRoofs?.tho ?? {}, mx(THO_X - 0.8), mx(4.0), mz(4.9), mz(9.4), 'x0', 'z1'),
      sanh: make(l.subRoofs?.sanh ?? {}, mx(-1.3), mx(4.0), mz(-0.3), mz(5.3), 'x0', 'z0'),
    };
  }
  get roof() { return this.roofs.main; }
  /** Current colour of a COLOR_SPECS key, as a number for three.js. */
  color(k: ColorKey): number { const v = this.layout.colors?.[k] ?? COLOR_SPECS.find(c => c.key === k)!.def; return parseInt(v.slice(1), 16); }
  /** Doors / windows with overrides applied (default plan coords; map them with mx / mz). */
  get doors(): DoorEff[] { return DOOR_SPECS.map(s => doorEff(s, this.layout.openings[s.id])); }
  get windows(): { spec: WinSpec; rect: WinSpec['rect']; w: number; h: number; sill: number; hidden: boolean }[] {
    return WIN_SPECS.map(s => {
      const r = winEff(s, this.layout.openings[s.id]), ax = winAlongX(r) ? 0 : 1;
      return { spec: s, rect: r, w: r[ax + 2] - r[ax], h: r[5] - r[4], sill: r[4], hidden: !!this.layout.openings[s.id]?.hidden };
    });
  }
  mx = (x: number) => this.x.m(x);
  mz = (z: number) => this.z.m(z);
  /** Edited plan rect of a default plan rect. */
  rect([x0, z0, x1, z1]: [number, number, number, number]): [number, number, number, number] {
    return [this.mx(x0), this.mz(z0), this.mx(x1), this.mz(z1)];
  }
  /** Width / depth / area of a room as the floor-plan figures plus whatever the edit added. */
  roomSize(r: RoomDim) {
    const [x0, z0, x1, z1] = r.rect, [a, b, c, d] = this.rect(r.rect);
    const w = parseFloat(r.w) + (c - a) - (x1 - x0), dd = parseFloat(r.d) + (d - b) - (z1 - z0);
    const changed = Math.abs(w - parseFloat(r.w)) > 1e-3 || Math.abs(dd - parseFloat(r.d)) > 1e-3;
    return { w, d: dd, area: changed ? (w * dd).toFixed(2) : r.area, changed };
  }
  /** Overall size of the house (default 14.06 x 9 m: the ancestor room sticks out to THO_X). */
  get houseW() { return this.mx(14) - this.mx(THO_X); }
  get houseD() { return this.mz(9) - this.mz(0); }
}

/** Format meters for labels: 2 decimals, trailing zeros dropped. */
/** Default video on the living-room TV. */
export const TV_DEFAULT_URL = 'https://www.youtube.com/watch?v=wNi1cHYFkwc&t=183s';
/** Video id and start second from a YouTube link (watch?v=, youtu.be/, shorts/, embed/, live/; t= as 183, 183s or 3m3s). */
export function parseYouTube(url: string): { id: string; start: number } | null {
  const m = url.trim().match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (!m) return null;
  const t = url.match(/[?&#](?:t|start)=([0-9hms]+)/)?.[1] ?? '0';
  const hms = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  const start = hms ? (+(hms[1] ?? 0)) * 3600 + (+(hms[2] ?? 0)) * 60 + (+(hms[3] ?? 0)) : 0;
  return { id: m[1], start };
}

/** Default spacing of the eave downlights (m). */
export const LIGHT_SPACING = 1.5;

export const fmtM = (v: number) => String(Math.round(v * 100) / 100);
