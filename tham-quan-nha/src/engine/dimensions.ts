// Dimension overlay: room names + real sizes/areas (from the client's floor plan), interior
// dimension lines per room, overall 14 x 9 m and window widths. Drawn flat on the floor, on top of
// everything (depthTest off) so it reads like an annotated plan.
import * as THREE from 'three';

export interface RoomDim {
  /** Key from rooms.ts (HUD room name) — used to show only the current room while touring. */
  room: string;
  title: string;
  /** Interior rectangle in PLAN coords [x0, z0, x1, z1]. */
  rect: [number, number, number, number];
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
  { room: 'Phòng thờ', title: 'P. thờ', rect: [0.2, 5.05, 2.55, 8.8], w: '2.35', d: '3.75', area: '8.81' },
  { room: 'Phòng ngủ 1', title: 'Phòng ngủ 1', rect: [2.65, 5.05, 6.4, 8.8], w: '3.75', d: '3.75', area: '14.06' },
  { room: 'Phòng ngủ 2', title: 'Phòng ngủ 2', rect: [6.5, 5.05, 10.85, 8.8], w: '4.35', d: '3.75', area: '16.31' },
  { room: 'Lavabo', title: 'Giặt + rửa', rect: [10.95, 5.05, 13.8, 6.2], w: '2.85', d: '1.15', area: '3.28' },
  { room: 'WC1', title: 'WC1', rect: [10.95, 6.3, 12.325, 8.8], w: '1.38', d: '2.5', area: '3.44' },
  { room: 'WC2', title: 'WC2', rect: [12.425, 6.3, 13.8, 8.8], w: '1.38', d: '2.5', area: '3.44' },
];

const INK = '#1f3f66', ACCENT = 0x2f6fb3, Y_IN = 0.06, Y_OUT = -0.27;

const flatMat = (map?: THREE.Texture, color = 0xffffff) => new THREE.MeshBasicMaterial({
  map, color, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
});

/** Orient a plane flat on the floor: text reads along `right`, its top points to `up` (both horizontal). */
function layFlat(m: THREE.Object3D, right: THREE.Vector3, up: THREE.Vector3) {
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, new THREE.Vector3(0, 1, 0)));
}
// Reading directions chosen to be upright from the overview cameras (which look from the facade side)
const ALONG_X = { right: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 0, 1) };
const ALONG_Z = { right: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(1, 0, 0) };

/** Text cards, re-oriented every frame so they read upright from the camera. */
type Axis = 'x' | 'z' | 'any';
const cards: { mesh: THREE.Mesh; axis: Axis }[] = [];
const Y = new THREE.Vector3(0, 1, 0);

interface Line { text: string; px: number; weight?: number }
/** Text on a rounded white card, as a flat mesh `widthM` meters wide. */
function textCard(lines: Line[], widthM: number) {
  const pad = 18, gap = 6, font = (l: Line) => `${l.weight ?? 500} ${l.px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  const meas = document.createElement('canvas').getContext('2d')!;
  let w = 0, h = pad * 2 - gap;
  for (const l of lines) { meas.font = font(l); w = Math.max(w, meas.measureText(l.text).width); h += l.px * 1.15 + gap; }
  const c = document.createElement('canvas'); c.width = Math.ceil(w + pad * 2); c.height = Math.ceil(h);
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.strokeStyle = 'rgba(31,63,102,0.35)'; g.lineWidth = 3;
  g.beginPath(); if (g.roundRect) g.roundRect(1.5, 1.5, c.width - 3, c.height - 3, 16); else g.rect(1.5, 1.5, c.width - 3, c.height - 3);
  g.fill(); g.stroke();
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'top';
  let y = pad;
  for (const l of lines) { g.font = font(l); g.fillText(l.text, c.width / 2, y); y += l.px * 1.15 + gap; }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(widthM, widthM * c.height / c.width), flatMat(tex));
  m.renderOrder = 22;
  return m;
}

/** Flat strip between two plan points (a thick line). */
function strip(ax: number, az: number, bx: number, bz: number, y: number, width = 0.03) {
  const len = Math.hypot(bx - ax, bz - az);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, width), flatMat(undefined, ACCENT));
  const dir = new THREE.Vector3(bx - ax, 0, bz - az).normalize();
  layFlat(m, dir, new THREE.Vector3(0, 1, 0).cross(dir)); // right x up must be +y
  m.position.set((ax + bx) / 2 - 7, y, (az + bz) / 2 - 4.5);
  m.renderOrder = 21;
  return m;
}

/** Architectural dimension: line with end ticks and the measurement on a card at its middle. */
function dimension(ax: number, az: number, bx: number, bz: number, text: string, y: number, cardW = 0.55) {
  const g = new THREE.Group();
  const alongX = Math.abs(bx - ax) > Math.abs(bz - az), t = 0.09;
  g.add(strip(ax, az, bx, bz, y));
  for (const [x, z] of [[ax, az], [bx, bz]]) g.add(alongX ? strip(x, z - t, x, z + t, y) : strip(x - t, z, x + t, z, y));
  const card = textCard([{ text, px: 44, weight: 600 }], cardW);
  layFlat(card, ...(alongX ? [ALONG_X.right, ALONG_X.up] : [ALONG_Z.right, ALONG_Z.up]) as [THREE.Vector3, THREE.Vector3]);
  card.position.set((ax + bx) / 2 - 7, y + 0.002, (az + bz) / 2 - 4.5);
  cards.push({ mesh: card, axis: alongX ? 'z' : 'x' }); // text stays along its line
  g.add(card);
  return g;
}

export interface Dimensions {
  group: THREE.Group;
  /** One group per room, keyed by the rooms.ts name. */
  rooms: Map<string, THREE.Group>;
  exterior: THREE.Group;
}

export function buildDimensions(scene: THREE.Scene): Dimensions {
  const group = new THREE.Group(), rooms = new Map<string, THREE.Group>(), exterior = new THREE.Group();
  cards.length = 0; // one overlay per scene (React StrictMode mounts the game twice in dev)
  group.visible = false;

  for (const r of ROOM_DIMS) {
    const [x0, z0, x1, z1] = r.rect, w = x1 - x0, d = z1 - z0, rg = new THREE.Group();
    const small = Math.min(w, d) < 1.6, off = small ? 0.2 : 0.35;
    // width along the facade-side wall, depth along the left wall
    rg.add(dimension(x0, z0 + off, x1, z0 + off, `${r.w} m`, Y_IN, small ? 0.42 : 0.55));
    rg.add(dimension(x0 + off, z0, x0 + off, z1, `${r.d} m`, Y_IN, small ? 0.42 : 0.55));
    // room card: name, size, area — turned to read along the long side of narrow rooms
    const vertical = w < 1.3 && d > w;
    const long = vertical ? d : w;
    const card = textCard([
      { text: r.title, px: 52, weight: 700 },
      { text: `${r.w} × ${r.d} m`, px: 38 },
      { text: `${r.area} m²`, px: 44, weight: 700 },
    ], Math.min(1.7, long * 0.62, (vertical ? w : d) * 1.2));
    layFlat(card, ...(vertical ? [ALONG_Z.right, ALONG_Z.up] : [ALONG_X.right, ALONG_X.up]) as [THREE.Vector3, THREE.Vector3]);
    card.position.set((x0 + x1) / 2 - 7 + (vertical ? 0.06 : 0), Y_IN + 0.004, (z0 + z1) / 2 - 4.5 + (vertical ? 0 : 0.08));
    cards.push({ mesh: card, axis: vertical ? 'x' : 'any' });
    rg.add(card);
    rooms.set(r.room, rg);
    group.add(rg);
  }

  // overall size (outside the facade and the right side) and window widths, on the ground
  exterior.add(dimension(0, -1.25, 14, -1.25, '14 m', Y_OUT, 0.7));
  exterior.add(dimension(15.0, 0, 15.0, 9, '9 m', Y_OUT, 0.6));
  const WINDOWS: [number, number, number, number, string][] = [
    // [x0, z0, x1, z1] of the dimension line, label
    [2.8, -0.45, 4.4, -0.45, '1.6 m'], [7.97, -0.45, 9.17, -0.45, '1.2 m'], [10.1, -0.45, 11.1, -0.45, '1.0 m'],
    [-0.45, 6.12, -0.45, 7.72, '1.6 m'],
    [5.37, 9.45, 6.37, 9.45, '1.0 m'], [9.53, 9.45, 10.73, 9.45, '1.2 m'], [11.33, 9.45, 11.93, 9.45, '0.6 m'], [12.81, 9.45, 13.41, 9.45, '0.6 m'],
    [14.45, 5.25, 14.45, 5.95, '0.7 m'], [14.45, 0.9, 14.45, 2.1, '1.2 m'],
  ];
  for (const [ax, az, bx, bz, t] of WINDOWS) exterior.add(dimension(ax, az, bx, bz, t, Y_OUT, 0.45));
  const note = textCard([{ text: '14 m × 9 m phủ bì · mặt tiền phía trước', px: 40, weight: 600 }], 4.2);
  layFlat(note, ALONG_X.right, ALONG_X.up);
  cards.push({ mesh: note, axis: 'z' });
  note.position.set(7 - 7, Y_OUT, -1.85 - 4.5);
  exterior.add(note);
  group.add(exterior);

  scene.add(group);
  return { group, rooms, exterior };
}

/** Turn every card (in 90° steps) so its text is upright for a camera looking along `fwd`. */
export function faceCamera(fwd: THREE.Vector3) {
  const fx = fwd.x, fz = fwd.z;
  for (const { mesh, axis } of cards) {
    const useZ = axis === 'z' || (axis === 'any' && Math.abs(fz) >= Math.abs(fx));
    const up = useZ ? new THREE.Vector3(0, 0, fz >= 0 ? 1 : -1) : new THREE.Vector3(fx >= 0 ? 1 : -1, 0, 0);
    layFlat(mesh, up.clone().cross(Y), up); // right = up × Y keeps right × up = +Y
  }
}
