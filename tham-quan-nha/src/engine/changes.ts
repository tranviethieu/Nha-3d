// Human-readable description of what changed between two layouts and what it affected, for the edit log in chat.
import type { ObjInfo } from './house';
import { COLOR_SPECS, DOOR_SPECS, LIGHT_SPACING, PlanMap, ROOM_DIMS, WIN_SPECS, fmtM, type Layout } from './layout';

const roomTitle = (room: string) => ROOM_DIMS.find(r => r.room === room)?.title ?? room;
/** Label plus its room, unless the label already names the room. */
const named = (label: string, room: string) => { const t = roomTitle(room); return label.toLowerCase().includes(t.toLowerCase()) || label.toLowerCase().includes(room.toLowerCase()) ? label : `${label} (${t})`; };
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
const arrow = (a: number, b: number, unit = ' m') => `${fmtM(a)} → ${fmtM(b)}${unit}`;
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Where an object's footprint ends up under a layout (plan coords, min corner + size). */
function placed(o: ObjInfo, m: PlanMap, l: Layout) {
  const [x0, z0, x1, z1] = o.box, ov = l.objects[o.id] ?? {};
  const w = o.scalable && ov.w ? ov.w : x1 - x0, d = o.scalable && ov.d ? ov.d : z1 - z0, h = o.scalable && ov.h ? ov.h : o.base[2];
  const ax = m.x.anchor(x0, x1), az = m.z.anchor(z0, z1);
  const X = (ax.pivot === x0 ? ax.to : ax.to - w) + (ov.dx ?? 0), Z = (az.pivot === z0 ? az.to : az.to - d) + (ov.dz ?? 0);
  return { X, Z, w, d, h, dx: ov.dx ?? 0, dz: ov.dz ?? 0 };
}

/** Lines describing the edit from `a` to `b`: what was edited, then what it affected. Empty when nothing changed. */
export function describeChanges(a: Layout, b: Layout, objects: ObjInfo[]): { edited: string[]; affected: string[] } {
  const ma = new PlanMap(a), mb = new PlanMap(b), edited: string[] = [], affected: string[] = [];

  // rooms edited directly
  const directRooms = new Set<string>();
  for (const r of ROOM_DIMS) {
    if (same(a.rooms[r.room], b.rooms[r.room])) continue;
    directRooms.add(r.room);
    const sa = ma.roomSize(r), sb = mb.roomSize(r), parts: string[] = [];
    if (!near(sa.w, sb.w)) parts.push(`ngang ${arrow(sa.w, sb.w)}`);
    if (!near(sa.d, sb.d)) parts.push(`dọc ${arrow(sa.d, sb.d)}`);
    edited.push(`${r.title}: ${parts.join(', ') || 'về kích thước ban đầu'}`);
  }
  // doors / windows
  const openIds = new Set([...Object.keys(a.openings), ...Object.keys(b.openings)]);
  const da = Object.fromEntries(ma.doors.map(d => [d.spec.id, d])), db = Object.fromEntries(mb.doors.map(d => [d.spec.id, d]));
  const wa = Object.fromEntries(ma.windows.map(w => [w.spec.id, w])), wb = Object.fromEntries(mb.windows.map(w => [w.spec.id, w]));
  const holes: string[] = [];
  for (const id of openIds) {
    if (same(a.openings[id], b.openings[id])) continue;
    const parts: string[] = [];
    const door = DOOR_SPECS.find(s => s.id === id), win = WIN_SPECS.find(s => s.id === id);
    const hx = !!a.openings[id]?.hidden, hy = !!b.openings[id]?.hidden, spec = door ?? win;
    if (spec && hx !== hy) {
      const n = named(spec.label, spec.room);
      edited.push(hy ? `Ẩn ${n.charAt(0).toLowerCase() + n.slice(1)}` : `Hiện lại ${n.charAt(0).toLowerCase() + n.slice(1)}`);
      affected.push(hy ? `${n}: bỏ cánh ${door ? 'cửa' : 'và khung kính'}, tường liền lại` : `${n}: tường khoét lại, lắp lại cánh ${door ? 'cửa' : 'và khung kính'}`);
      if (hy) continue;
    }
    if (hy) continue;
    const sizeOnly = (o?: { hidden?: boolean }) => { const r: Record<string, unknown> = { ...(o ?? {}) }; delete r.hidden; return r; };
    if (same(sizeOnly(a.openings[id]), sizeOnly(b.openings[id]))) continue; // only shown / hidden
    if (door) {
      const x = da[id], y = db[id];
      if (!near(x.w, y.w)) parts.push(`rộng ${arrow(x.w, y.w)}`);
      if (!near(x.h, y.h)) parts.push(`cao ${arrow(x.h, y.h)}`);
      edited.push(`${named(door.label, door.room)}: ${parts.join(', ') || 'về kích thước ban đầu'}`);
      holes.push(named(door.label, door.room));
    } else if (win) {
      const x = wa[id], y = wb[id];
      if (!near(x.w, y.w)) parts.push(`rộng ${arrow(x.w, y.w)}`);
      if (!near(x.h, y.h)) parts.push(`cao ${arrow(x.h, y.h)}`);
      if (!near(x.sill, y.sill)) parts.push(`cao bệ ${arrow(x.sill, y.sill)}`);
      edited.push(`${named(win.label, win.room)}: ${parts.join(', ') || 'về kích thước ban đầu'}`);
      holes.push(named(win.label, win.room));
    }
  }
  // roofs
  const RA = ma.roofs, RB = mb.roofs, deg = (t: number) => Math.round(Math.atan(t) * 180 / Math.PI);
  const ROOF_NAMES = { main: 'Mái chính', tho: 'Mái phòng thờ', sanh: 'Mái sảnh' } as const;
  const roofOv = (l: Layout, k: keyof typeof ROOF_NAMES) => k === 'main' ? l.roof : l.subRoofs?.[k];
  for (const k of ['main', 'tho', 'sanh'] as const) {
    if (same(roofOv(a, k), roofOv(b, k))) continue;
    const x = RA[k], y = RB[k], parts: string[] = [];
    if (!near(x.L, y.L)) parts.push(`dài ${arrow(x.L, y.L)}`);
    if (!near(x.W, y.W)) parts.push(`rộng ${arrow(x.W, y.W)}`);
    if (!near(x.rise, y.rise)) parts.push(`cao ${arrow(x.rise, y.rise)}`);
    edited.push(`${ROOF_NAMES[k]}: ${parts.join(', ') || 'về kích thước ban đầu'}`);
  }
  if (!!a.mirror !== !!b.mirror) {
    edited.push(b.mirror ? 'Đảo ngược nhà: hiên sang bên phải, phòng thờ sang bên trái (nhìn từ sân trước)' : 'Bỏ đảo ngược: hiên và phòng thờ về chỗ cũ');
    affected.push('Toàn bộ nhà lật đối xứng trước – sau (phòng, cửa, đồ đạc, mái); lối đi bên hông, tường rào, mương giữ nguyên');
  }
  // outdoor lights
  const sa = a.lights?.spacing ?? LIGHT_SPACING, sb = b.lights?.spacing ?? LIGHT_SPACING;
  if (!near(sa, sb)) {
    edited.push(`Khoảng cách đèn dưới mái: ${arrow(sa, sb)}`);
    affected.push('Đèn âm trần dưới mái chính, mái phòng thờ, mái sảnh xếp lại đều theo khoảng cách mới (đèn hắt tường và đèn sảnh giữ nguyên)');
  }
  // colours
  for (const c of COLOR_SPECS) {
    const x = a.colors?.[c.key] ?? c.def, y = b.colors?.[c.key] ?? c.def;
    if (x.toLowerCase() !== y.toLowerCase()) edited.push(`Màu ${c.label.toLowerCase()}: ${x} → ${y} (${c.hint})`);
  }
  // furniture overrides
  for (const o of objects) {
    if (same(a.objects[o.id], b.objects[o.id])) continue;
    const pa = placed(o, ma, a), pb = placed(o, mb, b), parts: string[] = [];
    if (!near(pa.w, pb.w)) parts.push(`ngang ${arrow(pa.w, pb.w)}`);
    if (!near(pa.d, pb.d)) parts.push(`dọc ${arrow(pa.d, pb.d)}`);
    if (!near(pa.h, pb.h)) parts.push(`cao ${arrow(pa.h, pb.h)}`);
    if (!near(pa.dx, pb.dx)) parts.push(`dịch X ${arrow(pa.dx, pb.dx)}`);
    if (!near(pa.dz, pb.dz)) parts.push(`dịch Z ${arrow(pa.dz, pb.dz)}`);
    edited.push(`${o.label} (${roomTitle(o.room)}): ${parts.join(', ') || 'về kích thước ban đầu'}`);
  }

  // ---- what it affected ----
  const changedRooms: string[] = [];
  for (const r of ROOM_DIMS) {
    const sa = ma.roomSize(r), sb = mb.roomSize(r);
    if (near(sa.w, sb.w) && near(sa.d, sb.d)) continue;
    changedRooms.push(r.room);
    affected.push(`${r.title}: ${fmtM(sa.w)} × ${fmtM(sa.d)} → ${fmtM(sb.w)} × ${fmtM(sb.d)} m (${sa.area} → ${sb.area} m²)${directRooms.has(r.room) ? '' : ', giãn theo vì cùng hàng/cột'}`);
  }
  if (!near(ma.houseW, mb.houseW) || !near(ma.houseD, mb.houseD))
    affected.push(`Cả nhà: ${fmtM(ma.houseD)} × ${fmtM(ma.houseW)} → ${fmtM(mb.houseD)} × ${fmtM(mb.houseW)} m (tường bao, sàn, mái, móng, lối đi, tường rào, mương kéo dài theo)`);
  for (const k of ['main', 'tho', 'sanh'] as const) {
    const x = RA[k], y = RB[k];
    if (near(x.L, y.L) && near(x.W, y.W) && near(x.rise, y.rise)) continue;
    const eave = k !== 'main' && !near(x.X0, y.X0) ? `mái đua phía Đông ${fmtM(-x.X0)} → ${fmtM(-y.X0)} m; ` : '';
    const where = eave + (k === 'sanh' ? 'trần hiên, viền mái, chóp mái dời theo' : 'viền mái, trần mái đua, chóp mái dời theo');
    affected.push(`${ROOF_NAMES[k]}: ${fmtM(x.L)} × ${fmtM(x.W)} × cao ${fmtM(x.rise)} → ${fmtM(y.L)} × ${fmtM(y.W)} × cao ${fmtM(y.rise)} m, dốc ${deg(x.t)}° → ${deg(y.t)}°; ${where}`);
  }
  if (changedRooms.length) affected.push(`Tường, sàn, trần, cửa của ${changedRooms.map(roomTitle).join(', ')} dời / giãn theo`);
  // furniture that moved because the walls moved (not edited directly)
  const moved = new Map<string, string[]>();
  for (const o of objects) {
    if (!same(a.objects[o.id], b.objects[o.id])) continue;
    const pa = placed(o, ma, a), pb = placed(o, mb, b);
    if (near(pa.X, pb.X) && near(pa.Z, pb.Z)) continue;
    const sign = (v: number) => (v >= 0 ? '+' : '') + fmtM(v), d: string[] = [];
    if (!near(pa.X, pb.X)) d.push(`X ${sign(pb.X - pa.X)}`);
    if (!near(pa.Z, pb.Z)) d.push(`Z ${sign(pb.Z - pa.Z)}`);
    const list = moved.get(o.room) ?? []; list.push(`${o.label} (${d.join(', ')} m)`);
    moved.set(o.room, list);
  }
  for (const [room, list] of moved) affected.push(`Đồ dời theo tường ở ${roomTitle(room)}: ${list.join('; ')}`);
  if (holes.length) affected.push(`Tường được khoét lại quanh: ${holes.join(', ')}`);
  return { edited, affected };
}

/** Chat text for a save / reset log entry. */
export function logText(action: 'save' | 'reset', ch: { edited: string[]; affected: string[] }) {
  const head = action === 'reset' ? 'Reset về thiết kế mặc định' : `Lưu thiết kế: ${ch.edited.length} thay đổi`;
  const out = [head];
  if (ch.edited.length) out.push(action === 'reset' ? 'Bỏ các chỉnh sửa:' : 'Đã sửa:', ...ch.edited.map(s => '• ' + s));
  if (ch.affected.length) out.push('Ảnh hưởng:', ...ch.affected.map(s => '• ' + s));
  return out.join('\n');
}
