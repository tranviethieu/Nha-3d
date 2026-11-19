import type { Door, House } from './house';

export const RADIUS = 0.2;
/** Max height the character can step up onto (steps are 0.15 m). */
export const STEP = 0.3;

const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) =>
  x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** Highest walkable surface under (x,z) that is not above `maxY`. */
export function floorTop(h: House, x: number, z: number, maxY = Infinity) {
  let t = -1e9;
  for (const f of h.floors) if (f.y1 <= maxY && f.y1 > t && inRect(x, z, f)) t = f.y1;
  return t;
}

/** World-space segment of a door leaf at hinge angle `rot`. */
export function leafSegment(d: Door, rot: number): [number, number, number, number] {
  const a = d.g.position, ax = a.x, az = a.z, bx = ax + Math.cos(rot) * d.len, bz = az - Math.sin(rot) * d.len;
  // a mirrored house keeps door groups in its own (flipped) frame
  return d.mirror === undefined ? [ax, az, bx, bz] : [ax, d.mirror - az, bx, d.mirror - bz];
}

export function segDist(px: number, pz: number, [ax, az, bx, bz]: [number, number, number, number]) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

export type Hit = { step: true } | { solid: true } | { door: Door } | null;

/** What blocks a character standing at (x, y, z)? Only fully closed doors block. */
export function blocked(h: House, x: number, z: number, y: number): Hit {
  if (floorTop(h, x, z) > y + STEP) return { step: true };
  for (const s of h.solids) {
    if (s.y1 <= y + STEP || s.y0 >= y + 1.7) continue;
    const cx = Math.max(s.x0, Math.min(x, s.x1)), cz = Math.max(s.z0, Math.min(z, s.z1));
    if ((x - cx) ** 2 + (z - cz) ** 2 < RADIUS * RADIUS) return { solid: true };
  }
  for (const d of h.doors) {
    if (d.open || Math.abs(d.g.rotation.y - d.c) > 0.03) continue;
    if (segDist(x, z, leafSegment(d, d.c)) < RADIUS + 0.03) return { door: d };
  }
  return null;
}
