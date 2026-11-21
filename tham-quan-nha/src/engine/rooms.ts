import { PlanMap } from './layout';

let map = new PlanMap(), mirrorZ: number | null = null;
/** Use the edited layout for roomAt (set by Game on every rebuild); mirror: House.mirrorZ. */
export const setRoomMap = (m: PlanMap, mirror: number | null = null) => { map = m; mirrorZ = mirror; };

// Room outlines in default PLAN coordinates [name, x0, z0, x1, z1] — matches the floor tiles in house.ts.
const ROOMS: [string, number, number, number, number][] = [
  ['Sảnh', -1.3, -0.3, 1.1, 5.3],
  ['Phòng khách', 1.1, 0.2, 5.95, 4.95],
  ['Bếp + ăn', 5.95, 0.2, 9.95, 4.95],
  ['Hành lang', 10.05, 3.95, 13.9, 4.95],
  ['Phòng ngủ 3', 10.05, 0.2, 13.8, 3.95],
  ['Phòng thờ', 0.2, 4.95, 2.55, 8.8],
  ['Phòng ngủ 1', 2.6, 4.95, 6.4, 8.8],
  ['Phòng ngủ 2', 6.45, 4.95, 10.77, 8.8],
  ['Lavabo', 10.77, 4.95, 13.8, 6.25],
  ['WC1', 10.77, 6.25, 12.51, 8.8],
  ['WC2', 12.51, 6.25, 13.8, 8.8],
];

/** Room name at a WORLD position, or null when outside the house. */
export function roomAt(x: number, z: number): string | null {
  const px = x + 7, pz = (mirrorZ === null ? z : mirrorZ - z) + 4.5;
  for (const [name, ...r] of ROOMS) { const [x0, z0, x1, z1] = map.rect(r); if (px >= x0 && px <= x1 && pz >= z0 && pz <= z1) return name; }
  return null;
}
