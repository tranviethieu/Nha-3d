// "Xuất PDF": a set of A3 drawing sheets built from the live model (cover, floor plan with dimensions, four
// elevations, roof plan, preliminary structure, door / window and furniture schedules). Each sheet is drawn on a
// canvas (so Vietnamese text renders with the system fonts) around off-screen renders from Game.snapshot, and the
// sheets are packed as JPEG pages into a small hand-written PDF (no PDF library needed).
import type { Game } from './Game';
import { COLOR_SPECS, GROUND, MAIN_SIDE, MAIN_TRANSOM, THO_SCREEN, THO_X, fmtM, type Dir } from './layout';
import { CIRCUITS, ELEC, MAIN_BREAKER, SERVICE_IN, type ElecKind } from './electrical';
import { FLOOR_DRAINS, MANHOLES, PIPES, PIPE_STYLE, SEPTIC, SHAFT, SOLAR, TANK, TAPS, VALVES, type PipeKind } from './plumbing';

type V3 = [number, number, number];
const PW = 2480, PH = 1754;                    // A3 landscape at 150 dpi
const M = 56, TB = 120;                        // page margin, title block height
const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const INK = '#1d2430', SOFT = '#5b6573', LINE = '#9aa3ad', ACC = '#2f6fb3';
const PROJECT = 'NHÀ Ở 1 TẦNG';

interface Frame { X: number; Y: number; W: number; H: number; cx: number; cy: number; hw: number; hh: number }
type Data = ReturnType<Game['designData']>;

const mm = (v: number) => String(Math.round(v * 1000));
const level = (v: number) => (v === 0 ? '±0.000' : (v > 0 ? '+' : '') + v.toFixed(3));
const loadImg = async (src: string) => { const i = new Image(); i.src = src; await i.decode(); return i; };

/** Fit a frame of world half-extents (hw, hh) into the box, keeping the aspect: grows the smaller extent. */
function fit(X: number, Y: number, W: number, H: number, cx: number, cy: number, hw: number, hh: number): Frame {
  if (hw / hh > W / H) hh = hw * H / W; else hw = hh * W / H;
  return { X, Y, W, H, cx, cy, hw, hh };
}

function page(title: string, code: string, n: number, total: number, date: string, size: string) {
  const c = document.createElement('canvas'); c.width = PW; c.height = PH;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, PW, PH);
  g.strokeStyle = INK; g.lineWidth = 4; g.strokeRect(M, M, PW - 2 * M, PH - 2 * M);
  // title block along the bottom
  const y0 = PH - M - TB;
  g.lineWidth = 2; g.beginPath(); g.moveTo(M, y0); g.lineTo(PW - M, y0); g.stroke();
  const cells = [[M, 760], [M + 760, 900], [M + 1660, 420], [M + 2080, PW - 2 * M - 2080]];
  cells.slice(1).forEach(([x]) => { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, PH - M); g.stroke(); });
  const txt = (s: string, x: number, y: number, px: number, w = 400, col = INK) => { g.fillStyle = col; g.font = `${w} ${px}px ${FONT}`; g.fillText(s, x, y); };
  txt('CÔNG TRÌNH', cells[0][0] + 24, y0 + 36, 20, 600, SOFT); txt(`${PROJECT} ${size} m`, cells[0][0] + 24, y0 + 84, 38, 700);
  txt('TÊN BẢN VẼ', cells[1][0] + 24, y0 + 36, 20, 600, SOFT); txt(title, cells[1][0] + 24, y0 + 84, 34, 700);
  txt('KÝ HIỆU', cells[2][0] + 24, y0 + 36, 20, 600, SOFT); txt(`${code}   ·   ${n}/${total}`, cells[2][0] + 24, y0 + 84, 34, 700);
  txt('NGÀY XUẤT', cells[3][0] + 24, y0 + 36, 20, 600, SOFT); txt(date, cells[3][0] + 24, y0 + 72, 28, 600);
  g.fillStyle = SOFT; g.font = `400 17px ${FONT}`; g.fillText('Sơ bộ từ mô hình 3D — kiểm tra trước khi thi công', cells[3][0] + 24, y0 + 104, cells[3][1] - 40);
  return { c, g, top: M + 30, bottom: y0 - 30 };
}

/** world (x, z) -> page, for a top view with north (+z) up and east (-x) to the right. */
const topXY = (f: Frame, x: number, z: number): [number, number] => [f.X + f.W / 2 - (x - f.cx) / f.hw * f.W / 2, f.Y + f.H / 2 - (z - f.cy) / f.hh * f.H / 2];

function heading(g: CanvasRenderingContext2D, s: string, x: number, y: number, sub?: string) {
  g.fillStyle = INK; g.font = `700 40px ${FONT}`; g.fillText(s, x, y);
  if (sub) { g.fillStyle = SOFT; g.font = `400 24px ${FONT}`; g.fillText(sub, x, y + 36); }
}

function dimLine(g: CanvasRenderingContext2D, a: [number, number], b: [number, number], label: string, off: [number, number]) {
  const A: [number, number] = [a[0] + off[0], a[1] + off[1]], B: [number, number] = [b[0] + off[0], b[1] + off[1]];
  g.strokeStyle = INK; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
  g.strokeStyle = LINE; g.lineWidth = 1.2;
  for (const [p, q] of [[a, A], [b, B]]) { g.beginPath(); g.moveTo(p[0] + off[0] * 0.25, p[1] + off[1] * 0.25); g.lineTo(q[0] + off[0] * 0.15, q[1] + off[1] * 0.15); g.stroke(); }
  g.strokeStyle = INK; g.lineWidth = 2.4;
  for (const p of [A, B]) { g.beginPath(); g.moveTo(p[0] - 7, p[1] + 7); g.lineTo(p[0] + 7, p[1] - 7); g.stroke(); }
  const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, vert = Math.abs(B[1] - A[1]) > Math.abs(B[0] - A[0]);
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  g.save(); g.translate(mx, my); if (vert) g.rotate(-Math.PI / 2);
  g.font = `600 ${len < 90 ? 17 : 21}px ${FONT}`; g.fillStyle = INK; g.textAlign = 'center'; g.fillText(label, 0, -8); g.restore();
}

function table(g: CanvasRenderingContext2D, x: number, y: number, cols: { t: string; w: number; right?: boolean }[], rows: string[][], rowH = 40, px = 21) {
  const W = cols.reduce((s, c) => s + c.w, 0);
  g.fillStyle = '#eef2f6'; g.fillRect(x, y, W, rowH);
  g.strokeStyle = LINE; g.lineWidth = 1.2;
  const all = [cols.map(c => c.t), ...rows];
  all.forEach((r, i) => {
    let cx = x; const yy = y + i * rowH;
    if (i > 0 && i % 2 === 0) { g.fillStyle = '#f8fafb'; g.fillRect(x, yy, W, rowH); }
    r.forEach((cell, j) => {
      g.fillStyle = i === 0 ? SOFT : INK; g.font = `${i === 0 ? 700 : 400} ${i === 0 ? px - 2 : px}px ${FONT}`;
      const col = cols[j]; g.textAlign = col.right ? 'right' : 'left';
      g.fillText(cell, col.right ? cx + col.w - 12 : cx + 12, yy + rowH * 0.66, col.w - 20); g.textAlign = 'left'; cx += col.w;
    });
    g.beginPath(); g.moveTo(x, yy + rowH); g.lineTo(x + W, yy + rowH); g.stroke();
  });
  g.strokeRect(x, y, W, rowH * all.length);
  return y + rowH * all.length;
}

function northArrow(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = INK; g.beginPath(); g.moveTo(x, y - 46); g.lineTo(x + 18, y + 18); g.lineTo(x, y + 6); g.lineTo(x - 18, y + 18); g.closePath(); g.fill();
  g.font = `700 28px ${FONT}`; g.textAlign = 'center'; g.fillText('B', x, y - 56); g.textAlign = 'left';
}

const STYLE: Record<string, string> = { quad: '4 cánh mở quay', triple: '3 cánh: 2 quay + giữa hất', awning: '1 cánh hất', double: '2 cánh mở quay' };
const DOOR_KIND: Record<string, string> = {
  main: `Cửa gỗ óc chó D1: 2 cánh pano + 2 ô kính bên ${mm(MAIN_SIDE)} + ô sáng ${mm(MAIN_TRANSOM)}, kính an toàn 8.38`, inner: 'Cửa gỗ 1 cánh', outer: 'Cửa gỗ 1 cánh (ra ngoài)', wc: 'Cửa nhôm / nhựa 1 cánh',
};
const DIRV: Record<Dir, [number, number]> = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

export async function exportDesignPdf(game: Game, onProgress: (s: string) => void) {
  const d: Data = game.designData(), map = d.map, MZ = d.mirrorZ;
  const R = d.roofs, F = R.main;
  // edited plan -> world, and the house's world bounds
  const W = (x: number, z: number): [number, number] => [x - 7, MZ === null ? z - 4.5 : MZ - (z - 4.5)];
  const hx0 = map.mx(0) - 7, hx1 = map.mx(14) - 7, zA = W(0, map.mz(0))[1], zB = W(0, map.mz(9))[1];
  const hz0 = Math.min(zA, zB), hz1 = Math.max(zA, zB);
  const E1 = 4.1, E3 = 3.42, ridge = E1 + F.rise, size = `${fmtM(map.houseD)} × ${fmtM(map.houseW)}`;
  const date = new Date().toLocaleDateString('vi-VN');
  const TOTAL = 37;

  // ---------------- renders ----------------
  onProgress('Đang dựng hình phối cảnh…');
  const renders: Record<string, HTMLImageElement> = {};
  const snap = async (k: string, v: Parameters<Game['snapshot']>[0], o: Parameters<Game['snapshot']>[1]) => { renders[k] = await loadImg(game.snapshot(v, o)); };
  await snap('persp', { pos: [-14, 11, -16], target: [0.5, 1, 0.5], fov: 38 }, { w: 1800, h: 1150, roof: true });
  await snap('structP', { pos: [-12, 12, -15], target: [0.5, 0.5, 0.5], fov: 38 }, { w: 1400, h: 900, roof: false, structure: true });

  // top views share one frame (house + porch + roof overhang + room for dimension chains)
  const pcx = (hx0 - 1.6 + F.X1 - 7) / 2, pcz = (hz0 + hz1) / 2;
  const planBox = { X: M + 40, Y: M + 110, W: 1640, H: PH - 2 * M - TB - 170 };
  const pf = fit(planBox.X, planBox.Y, planBox.W, planBox.H, pcx, pcz, (F.X1 - 7 - (hx0 - 1.6)) / 2 + 2.4, (hz1 - hz0) / 2 + 2.6);
  const top = (k: string, o: Parameters<Game['snapshot']>[1]) => snap(k, { pos: [pf.cx, 40, pf.cy], target: [pf.cx, 0, pf.cy], up: [0, 0, 1], half: [pf.hw, pf.hh] }, o);
  onProgress('Đang dựng mặt bằng…');
  await top('plan', { w: pf.W, h: pf.H, roof: false, clipY: 1.3 });
  await top('roof', { w: pf.W, h: pf.H, roof: true });
  await top('struct', { w: pf.W, h: pf.H, roof: false, structure: true });
  // KT-10B: the WC block enlarged (plan coords -> world, so the mirror is followed)
  const zb = { X: M + 40, Y: M + 120, W: 1350, H: PH - 2 * M - TB - 180 };
  const zFrame = (x0: number, z0: number, x1: number, z1: number) => { const a = W(map.mx(x0), map.mz(z0)), b = W(map.mx(x1), map.mz(z1));
    return fit(zb.X, zb.Y, zb.W, zb.H, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 + 0.2, Math.abs(b[1] - a[1]) / 2 + 0.2); };
  // one enlarged sheet per WC (owner's request): WC1, then WC2 with the washing / lavabo zone
  const zf1 = zFrame(10.6, 5.9, 12.7, 9.3), zf2 = zFrame(10.6, 4.85, 14.35, 9.3);
  for (const [k, f] of [['planWC1', zf1], ['planWC2', zf2]] as const) await snap(k, { pos: [f.cx, 40, f.cy], target: [f.cx, 0, f.cy], up: [0, 0, 1], half: [f.hw, f.hh] }, { w: f.W, h: f.H, roof: false, clipY: 1.3 });

  // elevations: orthographic, camera just outside the house on each side (inside the boundary wall)
  onProgress('Đang dựng các mặt đứng…');
  const ey0 = -0.9, ey1 = ridge + 1.0, ecy = (ey0 + ey1) / 2, ehh = (ey1 - ey0) / 2;
  const ex0 = Math.min(hx0 - 1.5, map.mx(-2.05) - 7), ex1 = F.X1 - 7 + 0.4, ecx = (ex0 + ex1) / 2, ehwX = (ex1 - ex0) / 2 + 0.6;
  const ez0 = Math.min(F.Z0 - 4.5, hz0 - 1.0), ez1 = Math.max(F.Z1 - 4.5, hz1 + 1.0), ecz = (hz0 + hz1) / 2, ehwZ = (ez1 - ez0) / 2 + 0.6;
  const elev: { k: string; title: string; pos: V3; target: V3; hw: number; along: 'x' | 'z'; flip: boolean }[] = [
    { k: 'S', title: 'MẶT ĐỨNG CHÍNH — HƯỚNG NAM', pos: [ecx, ecy, hz0 - 1.0], target: [ecx, ecy, 10], hw: ehwX, along: 'x', flip: true },
    { k: 'N', title: 'MẶT ĐỨNG SAU — HƯỚNG BẮC', pos: [ecx, ecy, hz1 + 2.2], target: [ecx, ecy, -10], hw: ehwX, along: 'x', flip: false },
    { k: 'E', title: 'MẶT ĐỨNG BÊN — HƯỚNG ĐÔNG (PHÍA SẢNH)', pos: [map.mx(-2.6) - 7, ecy, ecz], target: [10, ecy, ecz], hw: ehwZ, along: 'z', flip: false },
    { k: 'W', title: 'MẶT ĐỨNG BÊN — HƯỚNG TÂY', pos: [F.X1 - 7 + 0.8, ecy, ecz], target: [-10, ecy, ecz], hw: ehwZ, along: 'z', flip: true },
  ];
  const EW = 2200, EH = Math.round(EW * ehh / Math.max(ehwX, ehwZ));
  for (const e of elev) await snap('e' + e.k, { pos: e.pos, target: e.target, half: [Math.max(ehwX, ehwZ), Math.max(ehwX, ehwZ) * EH / EW] }, { w: EW, h: EH, roof: true });

  // 3D views for KT-08 / KT-09 (plan coords -> world, so they follow room edits and the mirror)
  onProgress('Đang dựng các ảnh 3D…');
  const V = (x: number, y: number, z: number): V3 => { const w = W(map.mx(x), map.mz(z)); return [w[0], y, w[1]]; };
  const views3d: { k: string; cap: string; pos: V3; target: V3; fov: number; roof: boolean }[] = [
    { k: 'x1', cap: 'Phối cảnh góc Đông Nam (sảnh, mặt tiền)', pos: V(-9, 6.5, -9), target: V(5.5, 1.2, 3.5), fov: 40, roof: true },
    { k: 'x2', cap: 'Phối cảnh góc Tây Nam', pos: V(23, 7, -8), target: V(8, 1.2, 4), fov: 40, roof: true },
    { k: 'x3', cap: 'Phối cảnh góc Tây Bắc (mái bằng, téc nước)', pos: V(23, 10, 18), target: V(9, 2, 5.5), fov: 40, roof: true },
    { k: 'x4', cap: 'Phối cảnh góc Đông Bắc (phòng thờ)', pos: V(-9, 7.5, 18), target: V(4, 1.2, 5.5), fov: 40, roof: true },
    { k: 'x5', cap: 'Sảnh và cửa chính', pos: V(-5.2, 1.7, 2.5), target: V(1.1, 1.9, 2.5), fov: 50, roof: true },
    { k: 'x6', cap: 'Bố trí nội thất toàn nhà (bỏ mái)', pos: V(-5, 15, -7), target: V(7, 0, 4.6), fov: 42, roof: false },
    { k: 'i1', cap: 'Phòng khách — sofa gỗ óc chó, vách tivi, tủ rượu', pos: V(1.6, 1.6, 4.4), target: V(5.6, 1.1, 1.4), fov: 62, roof: true },
    { k: 'i2', cap: 'Bếp + phòng ăn', pos: V(6.4, 1.7, 4.5), target: V(9.2, 1.0, 1.0), fov: 62, roof: true },
    { k: 'i3', cap: 'Phòng ngủ 1', pos: V(5.5, 1.7, 5.6), target: V(3.4, 0.8, 7.9), fov: 64, roof: true },
    { k: 'i4', cap: 'Phòng ngủ 2', pos: V(10.2, 1.75, 8.5), target: V(7.4, 0.7, 5.7), fov: 68, roof: true },
    { k: 'i5', cap: 'Phòng ngủ 3', pos: V(10.4, 1.7, 3.6), target: V(12.8, 0.8, 0.7), fov: 64, roof: true },
    { k: 'i6', cap: 'Phòng thờ', pos: V(0.35, 1.85, 8.65), target: V(2.3, 0.9, 6.5), fov: 78, roof: true },
  ];
  const GW = 1110, GH = 940;
  // 3D plan (roof off, room names), as seen from above in the overview
  const p3w = PW - 2 * M - 120, p3h = PH - 2 * M - TB - 170;
  await snap('plan3d', { pos: [pcx, 21, pcz - 3.2], target: [pcx, 0, pcz - 0.2], fov: 40 }, { w: Math.round(p3w * 0.75), h: Math.round(p3h * 0.75), roof: false, labels: true });
  for (const v of views3d) await snap(v.k, { pos: v.pos, target: v.target, fov: v.fov }, { w: GW, h: GH, roof: v.roof });
  // close-ups for the door / column detail sheets (CT-01, CT-02)
  await snap('doorD1', { pos: V(-1.9, 1.45, 1.9), target: V(1.0, 1.45, 2.475), fov: 66 }, { w: 900, h: 1200, roof: true });
  await snap('colP', { pos: V(-3.3, 1.55, -1.7), target: V(-1.275, 1.45, 0.11), fov: 64 }, { w: 800, h: 1300, roof: true });

  // plumbing 3D (house ghosted) and one section per room (vertical cut through the room's centre, along its
  // longer side, looking at the far half; plan coords -> world so the mirror and room stretches are followed)
  onProgress('Đang dựng ống nước và mặt cắt…');
  await snap('pipes3d', { pos: V(19.5, 8.5, 15.5), target: V(10.6, 0.6, 5.6), fov: 40 }, { w: 1300, h: 900, roof: false, pipes: true });
  // the two views the owner picked for the water section (KT-10D): from behind the house (septic tank) and from the front
  await snap('pipesA', { pos: V(17.5, 10.5, 19.0), target: V(8.6, 0.4, 5.2), fov: 42 }, { w: 1150, h: 840, roof: false, pipes: true });
  await snap('pipesB', { pos: V(8.5, 12.5, -9.5), target: V(7.2, 0.2, 4.6), fov: 46 }, { w: 1150, h: 840, roof: false, pipes: true });
  const SG = { gap: 34, x0: M + 60, y0: M + 30 + 80 };
  const SCW = Math.round((PW - 2 * M - 120 - 2 * SG.gap) / 3), SCH = Math.round((PH - M - TB - 30 - SG.y0 - SG.gap) / 2 - 74);
  const ceilOf = (room: string) => room === 'WC1' || room === 'WC2' ? 2.4 : room === 'Sảnh' ? 3.64 : 3.2;
  const sections = d.rooms.map(r => {
    const [x0, z0, x1, z1] = map.rect(r.base.rect), alongX = x1 - x0 >= z1 - z0, xc = (x0 + x1) / 2, zc = (z0 + z1) / 2;
    const u = (x: number, z: number) => alongX ? x - 7 : -W(x, z)[1];
    const ua = Math.min(u(x0, z0), u(x1, z1)), ub = Math.max(u(x0, z0), u(x1, z1));
    let hw = (ub - ua) / 2 + 0.9, hh = 2.85; if (hw / hh > SCW / SCH) hh = hw * SCH / SCW; else hw = hh * SCW / SCH;
    const yc = 2.05, uc = (ua + ub) / 2;
    const wz = W(xc, zc)[1], wx = xc - 7;
    const view = alongX ? { pos: [uc, yc, wz + 30] as V3, target: [uc, yc, wz - 1] as V3, clip: [0, 0, -1, wz] as [number, number, number, number] }
      : { pos: [wx + 30, yc, -uc] as V3, target: [wx - 1, yc, -uc] as V3, clip: [-1, 0, 0, wx] as [number, number, number, number] };
    return { r, x0, z0, x1, z1, alongX, xc, zc, u, ua, ub, hw, hh, yc, uc, view };
  });
  for (const sct of sections) await snap('sec-' + sct.r.room, { pos: sct.view.pos, target: sct.view.target, half: [sct.hw, sct.hh] }, { w: SCW, h: SCH, roof: true, clip: sct.view.clip });

  onProgress('Đang dàn trang…');
  const pages: HTMLCanvasElement[] = [];

  // ---------------- KT-00 cover ----------------
  {
    const { c, g, top: t } = page('TRANG BÌA & TỔNG QUAN', 'KT-00', pages.length + 1, TOTAL, date, size);
    g.fillStyle = INK; g.font = `800 64px ${FONT}`; g.fillText('HỒ SƠ THIẾT KẾ', M + 60, t + 70);
    g.font = `600 40px ${FONT}`; g.fillStyle = ACC; g.fillText(`${PROJECT} ${size} m — mái ngói, sảnh hiên, phòng thờ`, M + 60, t + 130);
    const img = renders.persp, maxH = PH - M - TB - 40 - (t + 170), iw = Math.min(1440, maxH * img.width / img.height), ih = iw * img.height / img.width;
    g.drawImage(img, M + 40, t + 170, iw, ih);
    const x = M + 1520; let y = t + 30;
    heading(g, 'THÔNG SỐ CHÍNH', x, y += 30);
    const builtArea = map.houseW * map.houseD;
    const useArea = d.rooms.reduce((s, r) => s + (parseFloat(String(r.area).replace(/[^\d.]/g, '')) || 0), 0);
    y = table(g, x, y + 30, [{ t: 'Hạng mục', w: 430 }, { t: 'Giá trị', w: 400 }], [
      ['Kích thước nhà (ngang × dài)', `${fmtM(map.houseD)} × ${fmtM(map.houseW)} m`],
      ['Diện tích xây dựng (tường bao)', `${builtArea.toFixed(2)} m²`],
      ['Diện tích sử dụng (các phòng)', `≈ ${useArea.toFixed(2)} m²`],
      ['Chiều cao tường (đỉnh tường / mép mái)', `${fmtM(E1)} m`],
      ['Trần', 'Thạch cao +3.200; WC trần bê tông +2.400, gác để đồ phía trên'],
      ['Cao độ đỉnh mái chính', `${level(ridge)} m`],
      ['Cốt nền / sân', '±0.000 / −0.300'],
      ['Mái chính (dài × rộng, dốc)', `${fmtM(F.L)} × ${fmtM(F.W)} m, ${Math.round(Math.atan(F.t) * 180 / Math.PI)}°`],
      ['Hướng', 'Mặt tiền Nam, sảnh Đông'],
      ['Đảo ngược bố cục', MZ === null ? 'Không' : 'Có (sảnh ở phía bên kia)'],
    ], 34, 19) + 40;
    heading(g, 'DANH MỤC BẢN VẼ', x, y += 10);
    table(g, x, y + 30, [{ t: 'Ký hiệu', w: 150 }, { t: 'Tên bản vẽ', w: 680 }], [
      ['KT-00', 'Trang bìa & tổng quan'], ['KT-01', 'Mặt bằng bố trí & kích thước'], ['KT-01B', 'Mặt bằng 3D (bỏ mái)'], ['KT-02', 'Mặt đứng chính (Nam) & mặt đứng sau (Bắc)'],
      ['KT-03', 'Mặt đứng bên (Đông, Tây)'], ['KT-04', 'Mặt bằng mái'], ['KT-04B', 'Bố trí cây chống'], ['KT-04C', 'Bố trí cầu phong'], ['KT-04D', 'Bố trí li tô'], ['KT-04E', 'Chi tiết kết cấu mái'], ['KT-04F', 'Ngói lợp & thống kê vật tư mái'], ['KT-05', 'Kết cấu sơ bộ'], ['KT-05B', 'Định vị cột C, dầm D'], ['KC-01', 'Mặt bằng kết cấu móng'], ['KC-02', 'Chi tiết móng, cột, dầm'], ['KC-03', 'Trình tự thi công móng'], ['KC-04', 'Thống kê cốt thép & bê tông'], ['BP-01', 'Chi tiết bể phốt 3 ngăn'], ['KT-06', 'Thống kê cửa đi, cửa sổ & phòng'], ['KT-06B', 'Thống kê gạch ốp lát'], ['CT-01', 'Chi tiết cửa đi D1'], ['CT-02', 'Chi tiết cột hiên'], ['KT-07', 'Thống kê nội thất'], ['KT-08', 'Sơ đồ đèn (chiếu sáng)'], ['KT-08B', 'Mặt bằng ổ cắm & điều hoà'], ['KT-08C', 'Mặt bằng trần thạch cao, đèn, quạt'], ['KT-09', 'Sơ đồ nguyên lý tủ điện & phụ tải'], ['KT-09C', 'Sơ đồ đi dây cấp điện ổ cắm, công tắc'], ['KT-09B', 'Sơ đồ mạng & đường dây vào nhà'], ['KT-10', 'Cấp thoát nước & hộp kỹ thuật'], ['KT-10B', 'Chi tiết cấp thoát nước WC1'], ['KT-10C', 'Chi tiết cấp thoát nước WC2 & khu giặt'], ['KT-10D', 'Phối cảnh 3D hệ thống nước'], ['KT-11', 'Mặt cắt các phòng (1)'], ['KT-12', 'Mặt cắt các phòng (2)'], ['KT-13', 'Phối cảnh ngoại thất 3D'], ['KT-14', 'Phối cảnh nội thất 3D'],
    ], 25, 15);
    pages.push(c);
  }

  // plan base shared by the floor plan and the electrical plan: cut walls, windows (glass lines), doors (swings)
  const planP = (x: number, z: number) => { const w = W(x, z); return topXY(pf, w[0], w[1]); };
  const drawBase = (g: CanvasRenderingContext2D, tags: boolean, P = planP) => {
    const poly = (pts: [number, number][], fill: string) => { g.fillStyle = fill; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.closePath(); g.fill(); };
    const rectE = (x0: number, z0: number, x1: number, z1: number, fill: string) => poly([P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)], fill);
    // walls (cut) in dark grey, then openings cleared and drawn
    for (const w of d.walls) rectE(map.mx(w[0]), map.mz(w[1]), map.mx(w[2]), map.mz(w[3]), '#2b3038');
    // ancestor room: wooden slatted partition (brown, dashed slats) with an open passage, no door
    { const T = THO_SCREEN, zA = map.mz(T.z0 - 0.01), zB = map.mz(T.z1 + 0.01);
      rectE(map.mx(T.x0), zA, map.mx(T.x1), zB, '#ffffff'); rectE(map.mx(T.x0), map.mz(T.z0 + 0.02), map.mx(T.open[0]), map.mz(T.z1 - 0.02), '#8a5a3c'); rectE(map.mx(T.open[1]), map.mz(T.z0 + 0.02), map.mx(T.x1), map.mz(T.z1 - 0.02), '#8a5a3c'); }
    g.lineWidth = 2;
    for (const w of map.windows) {
      if (w.hidden) continue; const r = w.rect, alongX = (r[2] - r[0]) > (r[3] - r[1]);
      const x0 = map.mx(r[0]), x1 = map.mx(r[2]), z0 = map.mz(r[1] + 0.02), z1 = map.mz(r[3] - 0.02);
      rectE(x0, z0, x1, z1, '#ffffff');
      g.strokeStyle = ACC;
      for (const f of [0.35, 0.65]) { const [a, b] = alongX ? [P(x0, z0 + (z1 - z0) * f), P(x1, z0 + (z1 - z0) * f)] : [P(x0 + (x1 - x0) * f, z0), P(x0 + (x1 - x0) * f, z1)]; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
      g.strokeStyle = INK; g.strokeRect(Math.min(P(x0, z0)[0], P(x1, z1)[0]), Math.min(P(x0, z0)[1], P(x1, z1)[1]), Math.abs(P(x1, z1)[0] - P(x0, z0)[0]), Math.abs(P(x1, z1)[1] - P(x0, z0)[1]));
      if (tags) {
      // tag outside the wall
      const out = alongX ? (r[1] < 4.5 ? -0.75 : 0.75) : (r[0] < 7 ? -0.75 : 0.75);
      const [tx, ty] = alongX ? P((x0 + x1) / 2, map.mz((r[1] + r[3]) / 2) + out) : P(map.mx((r[0] + r[2]) / 2) + out, (z0 + z1) / 2);
      g.fillStyle = '#fff'; g.strokeStyle = ACC; g.lineWidth = 2; g.beginPath(); g.ellipse(tx, ty, 26, 18, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = ACC; g.font = `700 18px ${FONT}`; g.textAlign = 'center'; g.fillText(codes.wins.get(w.spec.id)!, tx, ty + 6); g.textAlign = 'left'; }
    }
    for (const dd of map.doors) {
      if (dd.hidden) continue; const sp = dd.spec, [a0, a1] = dd.span, along = sp.axis;
      const c0 = sp.at - 0.13, c1 = sp.at + 0.13;
      if (along === 'x') rectE(map.mx(a0), map.mz(c0), map.mx(a1), map.mz(c1), '#ffffff'); else rectE(map.mx(c0), map.mz(a0), map.mx(c1), map.mz(a1), '#ffffff');
      // leaves: hinge, open leaf and the swing arc (sampled in plan coords so the mirror is handled)
      const leaves: { h: number; len: number; cd: Dir }[] = sp.kind === 'main' ? [{ h: sp.hinge - dd.w / 2, len: dd.w / 2, cd: '+z' }, { h: sp.hinge + dd.w / 2, len: dd.w / 2, cd: '-z' }] : [{ h: sp.hinge, len: dd.w, cd: sp.cd }];
      g.strokeStyle = INK; g.lineWidth = 2;
      for (const lf of leaves) {
        const H: [number, number] = along === 'x' ? [lf.h, sp.at] : [sp.at, lf.h];
        const cv = DIRV[lf.cd], ov = DIRV[sp.od];
        const pt = (t: number) => { const vx = cv[0] * Math.cos(t) + ov[0] * Math.sin(t), vz = cv[1] * Math.cos(t) + ov[1] * Math.sin(t); return P(map.mx(H[0] + vx * lf.len), map.mz(H[1] + vz * lf.len)); };
        g.beginPath(); g.moveTo(...P(map.mx(H[0]), map.mz(H[1]))); g.lineTo(...pt(Math.PI / 2)); g.stroke();
        g.setLineDash([8, 6]); g.beginPath(); for (let i = 0; i <= 16; i++) { const p = pt(Math.PI / 2 * i / 16); i ? g.lineTo(...p) : g.moveTo(...p); } g.stroke(); g.setLineDash([]);
      }
      if (sp.kind === 'main') { g.strokeStyle = ACC; for (const z of [a0 + MAIN_SIDE * 0.5, a1 - MAIN_SIDE * 0.5]) { const p = P(map.mx(sp.at), map.mz(z - MAIN_SIDE / 2)), q = P(map.mx(sp.at), map.mz(z + MAIN_SIDE / 2)); g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); } }
      if (tags) {
      const mid = (a0 + a1) / 2, [tx, ty] = along === 'x' ? P(map.mx(mid), map.mz(sp.at) + (sp.od === '+z' ? -0.45 : 0.45)) : P(map.mx(sp.at) + (sp.od === '-x' ? 0.55 : -0.55), map.mz(mid));
      g.fillStyle = '#fff'; g.strokeStyle = '#b4532a'; g.lineWidth = 2; g.fillRect(tx - 24, ty - 16, 48, 30); g.strokeRect(tx - 24, ty - 16, 48, 30);
      g.fillStyle = '#b4532a'; g.font = `700 18px ${FONT}`; g.textAlign = 'center'; g.fillText(codes.doors.get(sp.id)!, tx, ty + 6); g.textAlign = 'left'; }
    }
  };

  // ---------------- KT-01 floor plan ----------------
  const codes = { doors: new Map<string, string>(), wins: new Map<string, string>() };
  d.openings.doors.filter(o => !o.hidden).forEach((o, i) => codes.doors.set(o.id, `D${i + 1}`));
  d.openings.wins.filter(o => !o.hidden).forEach((o, i) => codes.wins.set(o.id, `S${i + 1}`));
  {
    const { c, g } = page('MẶT BẰNG BỐ TRÍ & KÍCH THƯỚC', 'KT-01', pages.length + 1, TOTAL, date, size);
    heading(g, 'MẶT BẰNG TẦNG 1', planBox.X, M + 70, 'Cắt ngang ở cao độ +1.300 · kích thước tính bằng m');
    g.drawImage(renders.plan, pf.X, pf.Y, pf.W, pf.H);
    const P = planP;
    drawBase(g, true);
    // room labels: name, size, area
    for (const r of d.rooms) {
      const [x0, z0, x1, z1] = map.rect(r.base.rect), [px, py] = P((x0 + x1) / 2, (z0 + z1) / 2);
      const rw = Math.abs(P(x1, z0)[0] - P(x0, z0)[0]) - 10, bw = Math.min(184, rw), small = bw < 150;
      g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.82)'; g.fillRect(px - bw / 2, py - 34, bw, small ? 86 : 66);
      g.fillStyle = INK; g.font = `700 ${small ? 18 : 22}px ${FONT}`; g.fillText(r.title.toUpperCase(), px, py - 8, bw - 6);
      g.font = `400 ${small ? 15 : 18}px ${FONT}`;
      if (small) { g.fillText(`${fmtM(r.w)} × ${fmtM(r.d)} m`, px, py + 16, bw - 6); g.fillText(`${r.area} m²`, px, py + 38, bw - 6); }
      else g.fillText(`${fmtM(r.w)} × ${fmtM(r.d)} m · ${r.area} m²`, px, py + 20, bw - 6);
      g.textAlign = 'left';
    }
    // dimension chains (edited plan coords): rooms along each side, then the overall size
    const sx = (x: number) => map.mx(x), sz = (z: number) => map.mz(z);
    const south = [0, 1.0, 5.95, 9.95, 14].map(sx), north = [0, 2.6, 6.58, 10.77, 12.51, 14].map(sx);
    const east = [0, 4.95, 9].map(sz), west = [0, 4.0, 4.95, 6.1, 9].map(sz);
    const chain = (vals: number[], side: 'S' | 'N' | 'E' | 'W', ring: number) => {
      for (let i = 0; i + 1 < vals.length; i++) {
        const a = vals[i], b = vals[i + 1], lab = fmtM(b - a);
        if (side === 'S' || side === 'N') { const z = side === 'S' ? sz(0) : sz(9); const pa = P(a, z), pb = P(b, z); const dir = (P(a, z + (side === 'S' ? -1 : 1))[1] - pa[1]); dimLine(g, pa, pb, lab, [0, Math.sign(dir) * (90 + ring * 60)]); }
        else { const x = side === 'E' ? map.mx(-1.95) : sx(14); const pa = P(x, a), pb = P(x, b); const dir = (P(x + (side === 'E' ? -1 : 1), a)[0] - pa[0]); dimLine(g, pa, pb, lab, [Math.sign(dir) * (110 + ring * 60), 0]); }
      }
    };
    chain(south, 'S', 0); chain([south[0], south[south.length - 1]], 'S', 1);
    chain(north, 'N', 0); chain([north[0], north[north.length - 1]], 'N', 1);
    chain(east, 'E', 0); chain([east[0], east[east.length - 1]], 'E', 1);
    chain(west, 'W', 0);
    // legend + north arrow
    const lx = planBox.X + planBox.W + 70; let ly = M + 150;
    northArrow(g, lx + 40, ly + 40); ly += 130;
    heading(g, 'GHI CHÚ', lx, ly);
    const note = (sw: string, s: string) => { ly += 50; g.fillStyle = sw; g.fillRect(lx, ly - 22, 40, 26); g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(lx, ly - 22, 40, 26); g.fillStyle = INK; g.font = `400 22px ${FONT}`; g.fillText(s, lx + 56, ly); };
    note('#2b3038', 'Tường xây (cắt)'); note('#ffffff', 'Ô cửa — xem KT-06');
    ly += 50; g.fillStyle = ACC; g.font = `700 22px ${FONT}`; g.fillText('S1…', lx, ly); g.fillStyle = INK; g.font = `400 22px ${FONT}`; g.fillText('Cửa sổ', lx + 70, ly);
    ly += 44; g.fillStyle = '#b4532a'; g.font = `700 22px ${FONT}`; g.fillText('D1…', lx, ly); g.fillStyle = INK; g.font = `400 22px ${FONT}`; g.fillText('Cửa đi (nét đứt: hướng mở)', lx + 70, ly);
    ly += 70; heading(g, 'DIỆN TÍCH PHÒNG', lx, ly);
    table(g, lx, ly + 24, [{ t: 'Phòng', w: 250 }, { t: 'Kích thước', w: 220 }, { t: 'm²', w: 110, right: true }],
      d.rooms.map(r => [r.title, `${fmtM(r.w)} × ${fmtM(r.d)}`, String(r.area)]), 36, 19);
    pages.push(c);
  }

  // ---------------- KT-01B 3D plan ----------------
  {
    const { c, g, top: t } = page('MẶT BẰNG 3D (BỎ MÁI)', 'KT-01B', pages.length + 1, TOTAL, date, size);
    heading(g, 'MẶT BẰNG 3D — BỐ TRÍ NỘI THẤT', M + 60, t + 40, 'Nhìn từ trên xuống, bỏ mái · hướng Bắc ở trên, sảnh (Đông) bên phải');
    const img = renders.plan3d; g.drawImage(img, M + 60, t + 100, p3w, p3h - 20);
    g.strokeStyle = LINE; g.lineWidth = 1.5; g.strokeRect(M + 60, t + 100, p3w, p3h - 20);
    pages.push(c);
  }

  // ---------------- KT-02 / KT-03 elevations ----------------
  const drawElev = (g: CanvasRenderingContext2D, e: typeof elev[number], X: number, Y: number, w: number) => {
    const img = renders['e' + e.k], h = w * img.height / img.width, hw = Math.max(ehwX, ehwZ), hh = hw * img.height / img.width;
    heading(g, e.title, X, Y - 18);
    g.drawImage(img, X, Y, w, h);
    const py = (y: number) => Y + h / 2 - (y - ecy) / hh * h / 2;
    const px = (a: number) => X + w / 2 + (e.flip ? -1 : 1) * (a - (e.along === 'x' ? ecx : ecz)) / hw * w / 2;
    // levels on the left
    const lv: [number, string][] = [[GROUND, 'Sân'], [0, 'Nền'], [0.9, 'Bậu cửa sổ'], [2.7, 'Đỉnh cửa'], [E1, 'Đỉnh tường'], [ridge, 'Đỉnh mái']];
    g.lineWidth = 1.2;
    for (const [y, name] of lv) {
      const yy = py(y); g.strokeStyle = LINE; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(X + 150, yy); g.lineTo(X + w - 20, yy); g.stroke(); g.setLineDash([]);
      g.fillStyle = INK; g.beginPath(); g.moveTo(X + 132, yy); g.lineTo(X + 146, yy - 12); g.lineTo(X + 118, yy - 12); g.closePath(); g.fill();
      const dy = y < 0 ? 40 : 0; g.font = `700 19px ${FONT}`; g.fillText(level(y), X + 8, yy - 16 + dy); g.font = `400 16px ${FONT}`; g.fillStyle = SOFT; g.fillText(name, X + 8, yy + 6 + dy);
    }
    // overall length under the drawing
    const a0 = e.along === 'x' ? hx0 : hz0, a1 = e.along === 'x' ? hx1 : hz1, yb = py(GROUND);
    const pa: [number, number] = [px(a0), yb], pb: [number, number] = [px(a1), yb];
    dimLine(g, pa[0] < pb[0] ? pa : pb, pa[0] < pb[0] ? pb : pa, `${fmtM(Math.abs(a1 - a0))} m (tường bao)`, [0, 46]);
  };
  for (const [k, pair, code] of [['KT-02', ['S', 'N'], 'MẶT ĐỨNG CHÍNH & SAU', 3], ['KT-03', ['E', 'W'], 'MẶT ĐỨNG BÊN', 4]] as const) {
    const { c, g, top: t, bottom } = page(code, k, pages.length + 1, TOTAL, date, size);
    const avail = bottom - t - 40, w = Math.min(PW - 2 * M - 120, (avail / 2 - 110) * EW / EH);
    pair.forEach((key, i) => drawElev(g, elev.find(e => e.k === key)!, M + 60, t + 60 + i * (avail / 2 + 20), w));
    // finishes / colours (from Cài đặt → Màu)
    const lx = M + 60 + w + 80, lw = PW - M - 40 - lx;
    if (lw > 420) {
      let ly = t + 60; heading(g, 'VẬT LIỆU & MÀU SẮC', lx, ly);
      ly += 30;
      for (const cs of COLOR_SPECS) {
        ly += 64; const hex = '#' + map.color(cs.key).toString(16).padStart(6, '0');
        g.fillStyle = hex; g.fillRect(lx, ly - 40, 70, 46); g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(lx, ly - 40, 70, 46);
        g.fillStyle = INK; g.font = `700 22px ${FONT}`; g.fillText(cs.label, lx + 90, ly - 16, lw - 100);
        g.fillStyle = SOFT; g.font = `400 18px ${FONT}`; g.fillText(`${hex.toUpperCase()} · ${cs.hint}`, lx + 90, ly + 8, lw - 100);
      }
      ly += 70; heading(g, 'GHI CHÚ', lx, ly); g.fillStyle = INK; g.font = `400 20px ${FONT}`;
      ['Cửa sổ nhôm kính: cánh 1350 + ô sáng 450, bậu +0.900.', 'Cửa chính nhôm kính nẹp vàng 2800 × 2700.', `Phào trên dưới mép mái, phào chân tường đến +0.450.`, `Mái ngói dốc ${Math.round(Math.atan(F.t) * 180 / Math.PI)}°, viền mái trắng.`]
        .forEach(l => { ly += 34; g.fillText('• ' + l, lx, ly, lw); });
    }
    pages.push(c);
  }

  // ---------------- KT-04 … KT-04F roof: plan, props, rafters, battens, frame details, tiles + quantities ----------------
  // After the owner's reference set (mái ngói khung thép trên sàn BTCT): i = 57 %, mái đua 600 / 910, cây chống +
  // cầu phong 40x80x1.8, li tô 30x30x1.4 @ 330. Geometry and quantities come from house.roofFrame.
  const RFm = d.roofFrame, slopeTxt = 'i = 57 %', sl = Math.sqrt(1 + RFm.t * RFm.t);
  const fxF = map.mx(10.72), fzF = map.mz(6.05);
  const kgM = { box4080: 3.29, box3030: 1.26 };              // kg/m: thép hộp 40x80x1.8, 30x30x1.4
  const mLen = (m: typeof RFm.members[number]) => Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]);
  const sumLen = (k: string) => RFm.members.filter(m => m.kind === k).reduce((a, m) => a + mLen(m), 0);
  const nOf = (k: string) => RFm.members.filter(m => m.kind === k).length;
  const propLen = RFm.props.reduce((a, q) => a + q.y1 - q.y0, 0);
  const tiledArea = (Object.keys(RFm.area) as (keyof typeof RFm.area)[]).reduce((a, k) => a + RFm.area[k] * Math.sqrt(1 + R[k].t * R[k].t), 0);
  const slabArea = RFm.slabs.reduce((a, q) => a + Math.abs((q.x1 - q.x0) * (q.z1 - q.z0)), 0);
  const ln = (g: CanvasRenderingContext2D, a: [number, number], b: [number, number]) => { g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); };
  /** roof plan base: walls (light), slabs, visible roof outline, flat WC roof, ridges / hips, valleys and downpipes */
  const roofBase = (g: CanvasRenderingContext2D, o: { slabs?: boolean; light?: boolean } = {}) => {
    g.save();
    for (const w of d.walls) { const a = planP(map.mx(w[0]), map.mz(w[1])), b = planP(map.mx(w[2]), map.mz(w[3])); g.fillStyle = '#dfe3e8'; g.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); }
    if (o.slabs) for (const q of RFm.slabs) { const a = planP(q.x0, q.z0), b = planP(q.x1, q.z1); g.fillStyle = 'rgba(160,166,172,.18)'; g.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); }
    g.fillStyle = INK; for (const [x, z] of RFm.edgePts) { const q = planP(x, z); g.fillRect(q[0] - 1.3, q[1] - 1.3, 2.6, 2.6); }
    { const a = planP(fxF, fzF), b = planP(F.X1, F.Z1); g.strokeStyle = INK; g.lineWidth = 2; g.setLineDash([12, 8]); g.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); g.setLineDash([]);
      g.fillStyle = SOFT; g.font = `600 16px ${FONT}`; g.textAlign = 'center'; g.fillText('MÁI BẰNG BTCT + TÉC 1500 L', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); g.fillText('(giữ nguyên)', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 22); g.textAlign = 'left'; }
    g.strokeStyle = o.light ? LINE : INK; g.lineWidth = o.light ? 1.6 : 2.6;
    for (const m of RFm.members) if (m.kind === 'ridge' || m.kind === 'hip') ln(g, planP(m.a[0], m.a[2]), planP(m.b[0], m.b[2]));
    g.fillStyle = '#2f7fd8'; for (const [x, z] of RFm.valleyPts) { const q = planP(x, z); g.beginPath(); g.arc(q[0], q[1], 2.4, 0, Math.PI * 2); g.fill(); }
    for (const [x, z] of RFm.downpipes) { const q = planP(x, z); g.fillStyle = '#fff'; g.strokeStyle = '#2f7fd8'; g.lineWidth = 2.5; g.beginPath(); g.arc(q[0], q[1], 12, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#2f7fd8'; g.beginPath(); g.arc(q[0], q[1], 5, 0, Math.PI * 2); g.fill(); }
    g.restore();
  };
  const roofDims = (g: CanvasRenderingContext2D) => {
    const a = planP(F.X0, F.Z0), b = planP(F.X1, F.Z0), c2 = planP(F.X0, F.Z1);
    dimLine(g, a, b, `${mm(F.X1 - F.X0)} (mái chính, gồm mái đua)`, [0, a[1] > c2[1] ? 70 : -70]);
    dimLine(g, a, c2, `${mm(F.Z1 - F.Z0)}`, [a[0] > b[0] ? 70 : -70, 0]);
  };
  const sideNotes = (g: CanvasRenderingContext2D, lx: number, ly: number, lines: string[]) => { g.fillStyle = SOFT; g.font = `400 18px ${FONT}`; for (const l of lines) { g.fillText(l, lx, ly, PW - M - 30 - lx); ly += 28; } return ly; };
  const legendRow = (g: CanvasRenderingContext2D, lx: number, ly: number, draw: () => void, t: string) => { draw(); g.fillStyle = INK; g.font = `400 18px ${FONT}`; g.fillText(t, lx + 64, ly + 6, PW - M - 40 - lx - 64); return ly + 34; };

  // KT-04 roof plan
  {
    const { c, g } = page('MẶT BẰNG MÁI', 'KT-04', pages.length + 1, TOTAL, date, size);
    heading(g, 'MẶT BẰNG MÁI', planBox.X, M + 70, `Mái ngói dốc ${slopeTxt}: mái chính + mái phòng thờ chữ L, mái sảnh thấp hơn · trên sàn mái BTCT · mái bằng khu WC (téc nước) giữ nguyên`);
    g.drawImage(renders.roof, pf.X, pf.Y, pf.W, pf.H);
    g.globalAlpha = 0.9; roofBase(g); g.globalAlpha = 1; roofDims(g);
    // slope labels on the main faces and the sub roofs' front faces
    const tag = (x: number, z: number, txt: string) => { const q = planP(x, z); g.font = `700 20px ${FONT}`; const w = g.measureText(txt).width + 20; g.fillStyle = 'rgba(255,255,255,.88)'; g.fillRect(q[0] - w / 2, q[1] - 17, w, 30); g.fillStyle = INK; g.textAlign = 'center'; g.fillText(txt, q[0], q[1] + 6); g.textAlign = 'left'; };
    for (const r of RFm.roofs) { const half = (r.Z1 - r.Z0) / 2, zm = (r.Z0 + r.Z1) / 2;
      if (r.k === 'main') { tag((r.X0 + r.X1) / 2 - 1.2, r.Z0 + half * 0.4, slopeTxt); tag((r.X0 + r.X1) / 2 - 1.2, r.Z1 - half * 0.4, slopeTxt); tag(r.X1 - half * 0.45, zm - 1.0, slopeTxt); tag(r.X0 + half * 0.6 + 2.2, zm, slopeTxt); }
      else tag(r.X0 + half * 0.45, zm, slopeTxt); }
    const note = (x: number, z: number, dx: number, dy: number, lines: string[]) => { const q = planP(x, z); g.strokeStyle = INK; g.lineWidth = 1.6; ln(g, q, [q[0] + dx, q[1] + dy]); g.fillStyle = INK; g.font = `600 17px ${FONT}`; lines.forEach((l, i) => g.fillText(l, q[0] + dx + (dx < 0 ? -g.measureText(l).width - 6 : 6), q[1] + dy + i * 22)); };
    note(F.X0 + (F.X1 - F.X0) * 0.55, F.Z0, 0, 60, ['MÁI ĐUA BTCT 600 SO VỚI TƯỜNG + NGÓI THÒ 80']);
    note(F.X1, (F.Z0 + F.Z1) / 2 - 1.5, -80, 0, ['MÁI ĐUA BTCT 600', 'SO VỚI TƯỜNG + NGÓI 80']);
    { const q = planP(R.sanh.X0, R.sanh.Z0 + 0.6); g.fillStyle = INK; g.font = `600 17px ${FONT}`; g.fillText('MÁI ĐUA BTCT 710 SO VỚI TIM CỘT + NGÓI 80 (THẲNG MÉP MÁI CHÍNH)', q[0] + 12, q[1] - 30); }
    for (const [x, z] of RFm.downpipes) { const q = planP(x, z); g.fillStyle = '#2f7fd8'; g.font = `600 15px ${FONT}`; g.fillText('ỐNG THOÁT Ø90 TRONG CỘT', q[0] + 16, q[1] - 12); }
    const lx = planBox.X + planBox.W + 70; let ly = M + 150; northArrow(g, lx + 40, ly + 40); ly += 140;
    heading(g, 'THÔNG SỐ MÁI', lx, ly);
    ly = table(g, lx, ly + 26, [{ t: 'Mái', w: 190 }, { t: 'Dài × rộng (m)', w: 190 }, { t: 'Mép mái', w: 110, right: true }, { t: 'Đỉnh', w: 110, right: true }], [
      ['Mái chính', `${fmtM(F.L)} × ${fmtM(F.W)}`, level(E1), level(E1 + F.rise)],
      ['Mái phòng thờ (chữ L với mái chính)', `${fmtM(R.tho.L)} × ${fmtM(R.tho.W)}`, level(E1), level(E1 + R.tho.rise)],
      ['Mái sảnh', `${fmtM(R.sanh.L)} × ${fmtM(R.sanh.W)}`, level(E3), level(E3 + R.sanh.rise)],
    ], 36, 18) + 30;
    ly = table(g, lx, ly, [{ t: 'Hạng mục', w: 270 }, { t: 'Giá trị', w: 330 }], [
      ['Độ dốc mái', `${slopeTxt} (≈ ${(Math.atan(RFm.t) * 180 / Math.PI).toFixed(1)}°)`], ['Mái đua BTCT', '600 so với mặt tường · sảnh 710 so với tim cột (mép ngói thẳng mép mái chính)'], ['Ngói thò ra', '80 so với mép bê tông'],
      ['Sàn mái BTCT', `dày 100, mặt ${level(E1)}`], ['Diện tích lợp ngói', `≈ ${tiledArea.toFixed(1)} m² (theo dốc)`],
      ['Nóc / rìa (hip) / máng xối', `${RFm.ridge.toFixed(1)} / ${RFm.hips.toFixed(1)} / ${RFm.valley.toFixed(1)} m`], ['Ống thoát nước mái', `${RFm.downpipes.length} ống uPVC Ø90 (cuối máng xối)`],
      ['Mái bằng BTCT khu WC', `${fmtM(F.X1 - fxF)} × ${fmtM(F.Z1 - fzF)} m, lan can 0.3 m`], ['Téc nước inox (giữ nguyên)', '1500 L · Φ1140 × L1750 · ≈ 1.7 tấn khi đầy'],
    ], 34, 17) + 24;
    ly = legendRow(g, lx, ly, () => { g.fillStyle = '#2f7fd8'; for (let k = 0; k < 8; k++) { g.beginPath(); g.arc(lx + 8 + k * 6, ly, 2.4, 0, Math.PI * 2); g.fill(); } }, 'Máng xối (tôn / inox khổ 400) giữa hai mái');
    ly = legendRow(g, lx, ly, () => { g.strokeStyle = INK; g.lineWidth = 2.6; ln(g, [lx, ly], [lx + 52, ly]); }, 'Nóc mái, rìa mái (đường hip)');
    legendRow(g, lx, ly, () => { g.fillStyle = '#fff'; g.strokeStyle = '#2f7fd8'; g.lineWidth = 2.5; g.beginPath(); g.arc(lx + 26, ly, 11, 0, Math.PI * 2); g.fill(); g.stroke(); }, 'Ống thoát nước mái (đi trong cột / sát cột)');
    pages.push(c);
  }

  // KT-04B props (cây chống), KT-04C rafters (cầu phong), KT-04D battens (li tô)
  const propCode = new Map<string, string>(); RFm.props.forEach(q => { const k = `${q.roof}-${q.type}`; if (!propCode.has(k)) propCode.set(k, 'C' + (propCode.size + 1)); });
  const roofName: Record<string, string> = { main: 'mái chính', tho: 'mái phòng thờ', sanh: 'mái sảnh' };
  for (const [code, title, kind] of [['KT-04B', 'MẶT BẰNG BỐ TRÍ CÂY CHỐNG', 'prop'], ['KT-04C', 'MẶT BẰNG BỐ TRÍ CẦU PHONG', 'rafter'], ['KT-04D', 'MẶT BẰNG BỐ TRÍ LI TÔ', 'batten']] as const) {
    const { c, g } = page(title, code, pages.length + 1, TOTAL, date, size);
    heading(g, title, planBox.X, M + 70, kind === 'prop' ? 'Cây chống thép hộp 40×80×1.8 bắt bulông nở xuống sàn mái BTCT · xà gồ vòng 40×80×1.8'
      : kind === 'rafter' ? 'Cầu phong thép hộp 40×80×1.8, khoảng cách ≤ 1200, từ mép mái lên nóc / rìa' : 'Li tô thép hộp 30×30×1.4: li tô đầu cách mép mái 200, các li tô sau cách đều 330 (theo dốc)');
    roofBase(g, { slabs: kind === 'prop', light: true }); roofDims(g);
    if (kind === 'prop') {
      g.strokeStyle = '#7b4a1e'; g.lineWidth = 4; for (const m of RFm.members) if (m.kind === 'purlin' || m.kind === 'ridge') ln(g, planP(m.a[0], m.a[2]), planP(m.b[0], m.b[2]));
      for (const q of RFm.props) { const pt = planP(q.x, q.z), cd = propCode.get(`${q.roof}-${q.type}`)!;
        g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 2.4; g.beginPath(); g.arc(pt[0], pt[1], 17, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = INK; g.font = `700 15px ${FONT}`; g.textAlign = 'center'; g.fillText(cd, pt[0], pt[1] + 5); g.textAlign = 'left'; }
      // spacing along the main ridge and the front ring row
      for (const row of [RFm.props.filter(q => q.roof === 'main' && q.type === 'ridge'), RFm.props.filter(q => q.roof === 'main' && q.type === 'ring' && Math.abs(q.z - Math.min(...RFm.props.filter(r => r.type === 'ring').map(r => r.z))) < 0.01)]) {
        const sorted = [...row].sort((a, b) => a.x - b.x);
        for (let k = 0; k + 1 < sorted.length; k++) { const a = planP(sorted[k].x, sorted[k].z), b = planP(sorted[k + 1].x, sorted[k + 1].z); dimLine(g, a, b, mm(sorted[k + 1].x - sorted[k].x), [0, -34]); } }
    } else {
      g.strokeStyle = kind === 'rafter' ? '#3f4852' : '#6d7681'; g.lineWidth = kind === 'rafter' ? 3 : 1.8;
      for (const m of RFm.members) if (m.kind === kind) ln(g, planP(m.a[0], m.a[2]), planP(m.b[0], m.b[2]));
      g.strokeStyle = INK; g.lineWidth = 2.6; for (const m of RFm.members) if (m.kind === 'ridge' || m.kind === 'hip') ln(g, planP(m.a[0], m.a[2]), planP(m.b[0], m.b[2]));
    }
    const lx = planBox.X + planBox.W + 70; let ly = M + 150; northArrow(g, lx + 40, ly + 40); ly += 140;
    if (kind === 'prop') {
      heading(g, 'BẢNG CÂY CHỐNG', lx, ly);
      const rows = [...propCode.entries()].map(([k, cd]) => { const qs = RFm.props.filter(q => `${q.roof}-${q.type}` === k), [roof, type] = k.split('-');
        return [cd, `${type === 'ridge' ? 'dưới nóc' : 'vòng cách nóc 2.4 m'}, ${roofName[roof]}`, fmtM(qs[0].y1 - qs[0].y0), String(qs.length)]; });
      ly = table(g, lx, ly + 26, [{ t: 'Ký hiệu', w: 100 }, { t: 'Vị trí', w: 300 }, { t: 'Cao (m)', w: 100, right: true }, { t: 'SL', w: 90, right: true }], rows, 36, 18) + 30;
      ly = sideNotes(g, lx, ly, [`Tổng ${RFm.props.length} cây chống, ≈ ${propLen.toFixed(1)} m thép hộp 40×80×1.8.`, `Xà gồ vòng + đỉnh nóc 40×80×1.8: ≈ ${(sumLen('purlin') + sumLen('ridge')).toFixed(1)} m.`,
        'Chân cây chống: bản mã 150×150×6 + 4 bulông nở M10×100 bắt', 'xuống sàn mái BTCT (xem KT-04E).', 'Đầu cây chống hàn vào xà gồ / cầu phong.', 'Mái sảnh: cầu phong gác lên dầm hiên và sàn mái,', 'không cần cây chống riêng.']);
    } else if (kind === 'rafter') {
      heading(g, 'THỐNG KÊ CẦU PHONG', lx, ly);
      ly = table(g, lx, ly + 26, [{ t: 'Hạng mục', w: 300 }, { t: 'Giá trị', w: 290 }], [
        ['Quy cách', 'thép hộp 40×80×1.8 mạ kẽm'], ['Khoảng cách', '≤ 1200 dọc mép mái'], ['Số thanh', String(nOf('rafter'))],
        ['Tổng chiều dài', `≈ ${sumLen('rafter').toFixed(1)} m`], ['Đường nóc + rìa (hip)', `≈ ${(sumLen('ridge') + sumLen('hip')).toFixed(1)} m`],
        ['Khối lượng (3.29 kg/m)', `≈ ${Math.round((sumLen('rafter') + sumLen('ridge') + sumLen('hip')) * kgM.box4080)} kg`]], 36, 18) + 30;
      sideNotes(g, lx, ly, ['Cầu phong chạy vuông góc mép mái, đầu dưới', 'tại mép mái đua, đầu trên hàn vào thanh nóc / rìa.', 'Sơn chống gỉ 2 lớp trước khi lợp.']);
    } else {
      heading(g, 'THỐNG KÊ LI TÔ', lx, ly);
      ly = table(g, lx, ly + 26, [{ t: 'Hạng mục', w: 300 }, { t: 'Giá trị', w: 290 }], [
        ['Quy cách', 'thép hộp 30×30×1.4 mạ kẽm'], ['Li tô đầu tiên', 'cách mép mái 200'], ['Các li tô sau', 'cách đều 330 (theo dốc)'],
        ['Tổng chiều dài', `≈ ${sumLen('batten').toFixed(1)} m`], ['Khối lượng (1.26 kg/m)', `≈ ${Math.round(sumLen('batten') * kgM.box3030)} kg`]], 36, 18) + 30;
      sideNotes(g, lx, ly, ['Li tô chạy song song mép mái, bắt vít vào cầu phong.', 'Khoảng li tô 330–335 khớp chiều dài hữu dụng của', 'ngói chính 424 × 335 (xem KT-04F).']);
    }
    pages.push(c);
  }

  // KT-04E frame details: a section through the main roof, the prop foot, and the member schedule
  {
    const { c, g, top: t } = page('CHI TIẾT KẾT CẤU MÁI', 'KT-04E', pages.length + 1, TOTAL, date, size);
    heading(g, 'MẶT CẮT KẾT CẤU MÁI CHÍNH', M + 40, t + 30, 'Cắt ngang mái chính qua nóc · khung thép hộp trên sàn mái BTCT 100');
    const mr = RFm.roofs.find(r => r.k === 'main')!, half = (mr.Z1 - mr.Z0) / 2, zm = (mr.Z0 + mr.Z1) / 2, dr = half - 2.4;
    const SX = 1500 / (mr.Z1 - mr.Z0 + 1.2), oy = t + 760, X = (z: number) => M + 80 + (z - mr.Z0 + 0.3) * SX, Y = (y: number) => oy - (y - 3.0) * SX;
    const hz = (z: number) => mr.E + Math.max(0, Math.min(z - mr.Z0, mr.Z1 - z)) * mr.t;
    const wz0 = map.mz(0), wz1 = map.mz(9);
    // walls + tie beams + slab
    g.fillStyle = '#c9ced4'; for (const [a, b] of [[wz0, wz0 + 0.2], [wz1 - 0.2, wz1]]) g.fillRect(X(a), Y(E1 - 0.3), (b - a) * SX, (E1 - 0.3 - 3.0) * SX);
    g.fillStyle = '#9aa0a6'; for (const [a, b] of [[wz0, wz0 + 0.22], [wz1 - 0.22, wz1]]) g.fillRect(X(a), Y(E1), (b - a) * SX, 0.3 * SX);
    const sz0 = wz0 - 0.6, sz1 = wz1 + 0.6; // the slab runs out 600 past the outer wall faces (mái đua BTCT)
    g.fillStyle = '#b9b6ae'; g.fillRect(X(sz0), Y(E1), (sz1 - sz0) * SX, 0.1 * SX); g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(X(sz0), Y(E1), (sz1 - sz0) * SX, 0.1 * SX);
    // tiles and rafters
    g.strokeStyle = '#2c3447'; g.lineWidth = 7; g.beginPath(); g.moveTo(X(mr.Z0), Y(hz(mr.Z0) + 0.03)); g.lineTo(X(zm), Y(hz(zm) + 0.03)); g.lineTo(X(mr.Z1), Y(hz(mr.Z1) + 0.03)); g.stroke();
    g.strokeStyle = '#5d6670'; g.lineWidth = 5; g.beginPath(); g.moveTo(X(mr.Z0), Y(hz(mr.Z0) - 0.09)); g.lineTo(X(zm), Y(hz(zm) - 0.09)); g.lineTo(X(mr.Z1), Y(hz(mr.Z1) - 0.09)); g.stroke();
    g.fillStyle = '#8f979f'; for (let o = 0.2 / sl; o < half - 0.05; o += 0.33 / sl) for (const z of [mr.Z0 + o, mr.Z1 - o]) { const yy = hz(z) - 0.035; g.fillRect(X(z) - 4, Y(yy) - 4, 8, 8); }
    // props (ridge + ring) on plates, purlins, horizontal tie
    const propAt = (z: number) => { const y1 = hz(z) - 0.13; g.fillStyle = '#5d6670'; g.fillRect(X(z) - 4, Y(y1), 8, (y1 - E1) * SX); g.fillStyle = '#3f4852'; g.fillRect(X(z) - 12, Y(E1) - 4, 24, 4); };
    propAt(zm); if (dr >= 0.9) { propAt(mr.Z0 + dr); propAt(mr.Z1 - dr); g.fillStyle = '#3f4852'; for (const z of [mr.Z0 + dr, mr.Z1 - dr]) g.fillRect(X(z) - 10, Y(hz(z) - 0.13), 20, 12);
      g.strokeStyle = '#7b4a1e'; g.lineWidth = 3; g.setLineDash([10, 6]); ln(g, [X(mr.Z0 + dr), Y(E1 + (hz(mr.Z0 + dr) - 0.13 - E1) * 0.55)], [X(mr.Z1 - dr), Y(E1 + (hz(mr.Z0 + dr) - 0.13 - E1) * 0.55)]); g.setLineDash([]); }
    // ridge tile + finial
    g.fillStyle = '#2c3447'; g.beginPath(); g.arc(X(zm), Y(hz(zm) + 0.08), 9, 0, Math.PI * 2); g.fill();
    // labels with leaders
    const lab = (z: number, y: number, dx: number, dy: number, txt: string) => { const a: [number, number] = [X(z), Y(y)], b: [number, number] = [a[0] + dx, a[1] + dy]; g.strokeStyle = INK; g.lineWidth = 1.4; ln(g, a, b); ln(g, b, [b[0] + (dx < 0 ? -20 : 20), b[1]]);
      g.fillStyle = INK; g.font = `600 17px ${FONT}`; const w = g.measureText(txt).width; g.fillText(txt, dx < 0 ? b[0] - 26 - w : b[0] + 26, b[1] + 6); };
    lab(mr.Z0 + half * 0.25, hz(mr.Z0 + half * 0.25) + 0.03, -60, -90, 'NGÓI CHÍNH 424×335 (9 viên/m²)');
    lab(mr.Z0 + half * 0.4, hz(mr.Z0 + half * 0.4) - 0.035, -80, -120, 'LI TÔ THÉP HỘP 30×30×1.4 @330');
    lab(mr.Z0 + half * 0.55, hz(mr.Z0 + half * 0.55) - 0.09, -100, -150, 'CẦU PHONG THÉP HỘP 40×80×1.8');
    if (dr >= 0.9) lab(mr.Z1 - dr, E1 + 0.6, 120, -40, 'CÂY CHỐNG THÉP HỘP 40×80×1.8');
    lab(zm, hz(zm) - 0.3, 140, -60, 'CÂY CHỐNG NÓC + THANH NÓC 40×80×1.8');
    if (dr >= 0.9) lab(mr.Z1 - dr, hz(mr.Z1 - dr) - 0.13, 140, -110, 'XÀ GỒ 40×80×1.8');
    lab(zm, hz(zm) + 0.08, 90, -60, 'NGÓI NÓC 380×210 + NGÓI LÓT NÓC');
    lab((wz0 + zm) / 2, E1 - 0.05, 0, 70, 'SÀN MÁI BTCT DÀY 100, ĐUA RA 600 (MÁI ĐUA)');
    if (dr >= 0.9) lab(zm + 1.2, E1 + (hz(mr.Z0 + dr) - 0.13 - E1) * 0.55, 60, 40, 'GIẰNG NGANG THÉP HỘP 40×80×1.8');
    // dimensions + levels
    dimLine(g, [X(mr.Z0), Y(E1)], [X(sz0), Y(E1)], mm(sz0 - mr.Z0), [0, 80]); dimLine(g, [X(sz0), Y(E1)], [X(wz0), Y(E1)], mm(wz0 - sz0), [0, 80]);
    dimLine(g, [X(wz1), Y(E1)], [X(sz1), Y(E1)], mm(sz1 - wz1), [0, 80]); dimLine(g, [X(sz1), Y(E1)], [X(mr.Z1), Y(E1)], mm(mr.Z1 - sz1), [0, 80]);
    dimLine(g, [X(mr.Z0), Y(E1)], [X(wz0), Y(E1)], mm(wz0 - mr.Z0), [0, 120]); dimLine(g, [X(wz1), Y(E1)], [X(mr.Z1), Y(E1)], mm(mr.Z1 - wz1), [0, 120]);
    if (dr >= 0.9) { dimLine(g, [X(mr.Z0 + dr), Y(E1)], [X(zm), Y(E1)], mm(zm - mr.Z0 - dr), [0, 170]); dimLine(g, [X(zm), Y(E1)], [X(mr.Z1 - dr), Y(E1)], mm(mr.Z1 - dr - zm), [0, 170]); }
    dimLine(g, [X(mr.Z0), Y(E1)], [X(mr.Z1), Y(E1)], mm(mr.Z1 - mr.Z0), [0, 220]);
    for (const [y, name] of [[E1, 'Sàn mái / mép mái'], [hz(zm), 'Đỉnh mái'], [E1 - 0.3, 'Đáy dầm giằng']] as [number, string][]) { const yy = Y(y); g.strokeStyle = LINE; g.setLineDash([8, 6]); ln(g, [X(mr.Z1) + 30, yy], [X(mr.Z1) + 230, yy]); g.setLineDash([]);
      g.fillStyle = INK; g.font = `700 19px ${FONT}`; g.fillText(level(y), X(mr.Z1) + 240, yy + 6); g.fillStyle = SOFT; g.font = `400 16px ${FONT}`; g.fillText(name, X(mr.Z1) + 240, yy + 26); }
    { const z = mr.Z0 + half * 0.7, q: [number, number] = [X(z), Y(hz(z) + 0.4)]; g.fillStyle = INK; g.font = `700 22px ${FONT}`; g.fillText(slopeTxt, q[0] - 40, q[1]); }
    // prop foot detail
    const fx = M + 80, fy = t + 1110, S2 = 1.6;
    heading(g, 'CHI TIẾT CHÂN CÂY CHỐNG', fx, fy - 40);
    g.fillStyle = '#e4e2dc'; g.fillRect(fx, fy + 150 * S2 * 0.6, 520, 120); g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(fx, fy + 150 * S2 * 0.6, 520, 120);
    g.strokeStyle = '#9a958a'; for (let k = 0; k < 14; k++) ln(g, [fx + k * 40, fy + 144 + 120], [fx + k * 40 + 40, fy + 144]);
    g.fillStyle = '#3f4852'; g.fillRect(fx + 140, fy + 132, 240, 12); g.fillStyle = '#5d6670'; g.fillRect(fx + 228, fy - 10, 64, 142);
    for (const bx of [fx + 165, fx + 355]) { g.fillStyle = '#6d7681'; g.fillRect(bx - 6, fy + 110, 12, 110); g.fillRect(bx - 14, fy + 116, 28, 16); }
    const flab = (x: number, y: number, txt: string) => { g.strokeStyle = INK; g.lineWidth = 1.3; ln(g, [x, y], [fx + 560, y]); g.fillStyle = INK; g.font = `600 17px ${FONT}`; g.fillText(txt, fx + 570, y + 6); };
    flab(fx + 292, fy + 40, 'CÂY CHỐNG THÉP HỘP 40×80×1.8'); flab(fx + 380, fy + 138, 'BẢN MÃ 150×150×6, HÀN BAO QUANH'); flab(fx + 369, fy + 124, 'BULÔNG NỞ M10×100 (4 CÁI)'); flab(fx + 520, fy + 200, 'SÀN MÁI BTCT DÀY 100');
    // member schedule
    const sx = M + 1200, sy = fy - 40;
    heading(g, 'BẢNG QUY CÁCH & KHỐI LƯỢNG KHUNG MÁI', sx, sy);
    table(g, sx, sy + 26, [{ t: 'Cấu kiện', w: 240 }, { t: 'Quy cách', w: 330 }, { t: 'Số lượng', w: 190, right: true }, { t: 'KL (kg)', w: 120, right: true }], [
      ['Cây chống', 'thép hộp 40×80×1.8', `${RFm.props.length} cây · ${propLen.toFixed(1)} m`, String(Math.round(propLen * kgM.box4080))],
      ['Xà gồ vòng, thanh nóc', 'thép hộp 40×80×1.8', `${(sumLen('purlin') + sumLen('ridge')).toFixed(1)} m`, String(Math.round((sumLen('purlin') + sumLen('ridge')) * kgM.box4080))],
      ['Thanh rìa (hip)', 'thép hộp 40×80×1.8', `${sumLen('hip').toFixed(1)} m`, String(Math.round(sumLen('hip') * kgM.box4080))],
      ['Cầu phong', 'thép hộp 40×80×1.8 @ ≤1200', `${sumLen('rafter').toFixed(1)} m`, String(Math.round(sumLen('rafter') * kgM.box4080))],
      ['Li tô', 'thép hộp 30×30×1.4 @330', `${sumLen('batten').toFixed(1)} m`, String(Math.round(sumLen('batten') * kgM.box3030))],
      ['Bản mã chân cột', '150×150×6', `${RFm.props.length} cái`, String(Math.round(RFm.props.length * 1.06))],
      ['Bulông nở', 'M10×100', `${RFm.props.length * 4} con`, '—'],
      ['Sàn mái BTCT', 'dày 100, bê tông B20 (mác 250)', `${slabArea.toFixed(1)} m² · ${(slabArea * 0.1).toFixed(1)} m³`, '—'],
    ], 36, 17);
    pages.push(c);
  }

  // KT-04F tiles: sizes, main tile data, laying notes, quantities
  {
    const { c, g, top: t } = page('NGÓI LỢP & THỐNG KÊ VẬT TƯ MÁI', 'KT-04F', pages.length + 1, TOTAL, date, size);
    const x0 = M + 40; let y = t + 30;
    heading(g, 'BẢNG KÍCH THƯỚC NGÓI', x0, y);
    y = table(g, x0, y + 26, [{ t: 'STT', w: 70 }, { t: 'Tên loại ngói', w: 300 }, { t: 'Kích thước (dài × rộng × cao, mm)', w: 420 }, { t: 'Dùng cho', w: 360 }], [
      ['1', 'Ngói chính', '424 × 335', 'mặt mái'], ['2', 'Ngói nóc', '380 × 210 × 100', 'đường nóc'], ['3', 'Ngói cuối nóc', '345 × R × 227', 'đầu nóc (giao rìa)'],
      ['4', 'Ngói cuối mái', '350 × 210', 'chân rìa ở góc mái'], ['5', 'Ngói đầu rìa', '480 × 210 × 112', 'đầu rìa (mái có đầu hồi)'], ['6', 'Ngói rìa', '410 × 210 × 112', 'đường rìa (hip)'],
      ['7', 'Ngói cuối rìa', '350 × 210 × 112', 'cuối rìa (mái có đầu hồi)'], ['8', 'Ngói lót nóc', '300 × 130 × 45', 'lót dưới ngói nóc'],
    ], 36, 18) + 40;
    heading(g, 'THÔNG SỐ KỸ THUẬT NGÓI CHÍNH', x0, y);
    y = table(g, x0, y + 26, [{ t: 'Thông số', w: 420 }, { t: 'Giá trị', w: 360 }], [
      ['Kích thước sản phẩm', '424 × 335 mm (±2)'], ['Kích thước hữu dụng', '363 × 303 mm (±2)'], ['Số viên / m²', '9'], ['Trọng lượng trung bình / viên', '≈ 3.2 kg'],
      ['Trọng lượng mái lợp', '≈ 29 kg/m²'], ['Độ dốc tối ưu', '≥ 25° (nhà này ' + `${(Math.atan(RFm.t) * 180 / Math.PI).toFixed(1)}°)`],
    ], 34, 18) + 40;
    heading(g, 'HƯỚNG DẪN LẮP ĐẶT', x0, y);
    sideNotes(g, x0, y + 40, [
      '• Độ dốc mái tối ưu từ 25° trở lên.', '• Khoảng cách li tô (thép, gỗ, xi măng) 330 – 335 mm; li tô đầu cách mép mái 200.',
      '• Ngói chính lợp so le, lợp từ dưới lên trên, từ phải sang trái (gối 4–5 cm).', '• Mái thép / gỗ: bắt vít tự khoan Ø4 (dài 3–4 cm) qua 2 lỗ trên viên ngói chính.',
      '• Ngói rìa: lợp viên cuối rìa trước, từ dưới lên; đầu viên chạm đầu viên ngói chính hàng trên;', '  cắt bớt nếu dư, lợp ngói rìa, cuối cùng là viên đầu rìa; vít tự khoan Ø6 (dài 7–10 cm).',
      '• Ngói nóc lợp trên ngói lót nóc, cuối nóc / cuối mái lợp sau cùng, trám vữa + keo chống thấm.', '• Máng xối tôn / inox khổ 400 dưới đường giao hai mái, dốc về ống thoát Ø90.',
    ]);
    // quantities
    const qx = M + 1240; let qy = t + 30;
    heading(g, 'THỐNG KÊ VẬT TƯ MÁI', qx, qy, 'Tính từ mô hình, đã cộng hao hụt 5 % cho ngói');
    const n9 = Math.ceil(tiledArea * 9 * 1.05);
    qy = table(g, qx, qy + 60, [{ t: 'Hạng mục', w: 420 }, { t: 'Cách tính', w: 320 }, { t: 'Số lượng', w: 220, right: true }], [
      ['Diện tích mái lợp ngói', 'theo dốc, cả 3 mái', `${tiledArea.toFixed(1)} m²`],
      ['Ngói chính', '9 viên/m² + 5 %', `${n9} viên`], ['Ngói nóc', `nóc ${RFm.ridge.toFixed(1)} m ÷ 0.33`, `${Math.ceil(RFm.ridge / 0.33)} viên`],
      ['Ngói rìa', `rìa ${RFm.hips.toFixed(1)} m ÷ 0.36`, `${Math.ceil(RFm.hips / 0.36)} viên`], ['Ngói cuối nóc', 'đầu nóc giao rìa', `${RFm.ridgeEnds} viên`],
      ['Ngói cuối mái', 'chân rìa ở góc mái', `${RFm.hipFeet} viên`], ['Ngói lót nóc', `nóc ${RFm.ridge.toFixed(1)} m ÷ 0.30`, `${Math.ceil(RFm.ridge / 0.30)} viên`],
      ['Ngói đầu rìa / cuối rìa', 'mái 4 phía, không có đầu hồi', '—'], ['Máng xối tôn / inox khổ 400', 'đường giao các mái', `${RFm.valley.toFixed(1)} m`],
      ['Ống thoát nước mái uPVC Ø90', 'cuối máng xối', `${RFm.downpipes.length} ống`],
      ['Thép hộp 40×80×1.8', 'cây chống, cầu phong, xà gồ, nóc, rìa', `${(propLen + sumLen('rafter') + sumLen('purlin') + sumLen('ridge') + sumLen('hip')).toFixed(0)} m`],
      ['Thép hộp 30×30×1.4', 'li tô', `${sumLen('batten').toFixed(0)} m`], ['Vít tự khoan Ø4', '2 vít / viên ngói chính', `${n9 * 2} con`],
      ['Sàn mái BTCT dày 100', 'diện tích · thể tích', `${slabArea.toFixed(1)} m² · ${(slabArea * 0.1).toFixed(1)} m³`],
      ['Tải mái ngói (tĩnh tải)', '≈ 29 kg/m² ngói + khung', `≈ ${(tiledArea * 29 / 1000).toFixed(1)} tấn ngói`],
    ], 36, 18) + 30;
    sideNotes(g, qx, qy, ['Số liệu sơ bộ từ mô hình 3D; kiểm tra lại khi đặt hàng theo', 'catalogue nhà sản xuất ngói và bản vẽ kết cấu được duyệt.']);
    pages.push(c);
  }

  // ---------------- KT-05 structure ----------------
  {
    const { c, g, top: t } = page('KẾT CẤU SƠ BỘ', 'KT-05', pages.length + 1, TOTAL, date, size);
    heading(g, 'MẶT BẰNG KẾT CẤU (SƠ BỘ)', planBox.X, M + 70, 'Móng đơn, dầm móng, cột, dầm giằng — tự sinh theo tường hiện tại');
    g.drawImage(renders.struct, pf.X, pf.Y, pf.W, pf.H);
    const lx = planBox.X + planBox.W + 70; let ly = t + 40;
    const img = renders.structP, iw = PW - M - 40 - lx, ih = iw * img.height / img.width;
    g.drawImage(img, lx, ly, iw, ih); ly += ih + 60;
    heading(g, 'THỐNG KÊ KẾT CẤU', lx, ly);
    const s = d.structure;
    ly = table(g, lx, ly + 26, [{ t: 'Cấu kiện', w: 190 }, { t: 'Tiết diện', w: 260 }, { t: 'Số lượng', w: 140, right: true }], [
      ['Móng đơn MĐ1–MĐ4', '1.0–1.5 m, đáy −2.000', `${s.footings} cái`], ['Cột BTCT', '220 × 220', `${s.columns} cột`],
      ['Dầm móng', '220 × 400', `≈ ${Math.round(s.groundBeam)} m`], ['Dầm giằng tường', '220 × 300', `≈ ${Math.round(s.tieBeam)} m`],
    ], 38, 19) + 36;
    g.fillStyle = SOFT; g.font = `400 19px ${FONT}`;
    ['Nhịp cột phổ biến 3.5–5 m.', 'Cột ở tường 110 lồi thành trụ áp tường phía phòng ngủ.', 'Mái bằng + téc 1500 L: nên dùng dầm 220 × 400 và móng 1.2–1.4 m.',
      'Số liệu sơ bộ để hình dung — kích thước thép, bê tông, móng phải do', 'kỹ sư kết cấu tính theo địa chất thực tế.'].forEach(l => { g.fillText(l, lx, ly, PW - M - 30 - lx); ly += 30; });
    pages.push(c);
  }

  // ---------------- KT-05B column / beam setting-out plan (C1…, D1…) ----------------
  {
    const { c, g, top: t } = page('ĐỊNH VỊ CỘT & DẦM', 'KT-05B', pages.length + 1, TOTAL, date, size);
    heading(g, 'MẶT BẰNG ĐỊNH VỊ CỘT C, DẦM D (SƠ BỘ)', planBox.X, M + 70, 'Tâm cột / tim dầm theo mặt bằng kiến trúc hiện tại · gốc toạ độ: góc Đông-Nam tường bao (trục A1) · m');
    g.globalAlpha = 0.35; drawBase(g, false); g.globalAlpha = 1;
    const P = planP, S = d.structure;
    const ox = map.mx(THO_X), oz = map.mz(0), r2 = (v: number) => Math.round(v * 100) / 100;
    // columns numbered row by row (front facade first), porch last
    const cols = [...S.cols].sort((a, b) => (+a.porch - +b.porch) || (Math.round(a.z * 4) - Math.round(b.z * 4)) || (a.x - b.x)).map((c2, i) => ({ ...c2, id: `C${i + 1}` }));
    const near = (a: number, b: number, tol = 0.16) => Math.abs(a - b) <= tol;
    // beams: supports = columns on the beam line; spans between them; ends without a column land on another beam
    const beams = S.beams.filter(b => Math.hypot(b.x1 - b.x0, b.z1 - b.z0) > 0.5).map((b, i) => {
      const alongX = Math.abs(b.x1 - b.x0) >= Math.abs(b.z1 - b.z0), a0 = alongX ? Math.min(b.x0, b.x1) : Math.min(b.z0, b.z1), a1 = alongX ? Math.max(b.x0, b.x1) : Math.max(b.z0, b.z1), at = alongX ? b.z0 : b.x0;
      const sup = cols.filter(c2 => near(alongX ? c2.z : c2.x, at) && (alongX ? c2.x : c2.z) >= a0 - 0.2 && (alongX ? c2.x : c2.z) <= a1 + 0.2).sort((p, q) => (alongX ? p.x - q.x : p.z - q.z));
      const stops = [a0, ...sup.map(c2 => alongX ? c2.x : c2.z), a1].sort((p, q) => p - q);
      let span = 0; for (let k = 0; k + 1 < stops.length; k++) span = Math.max(span, stops[k + 1] - stops[k]);
      const h = Math.max(300, Math.ceil(span * 1000 / 12 / 50) * 50);
      return { ...b, id: `D${i + 1}`, alongX, a0, a1, at, sup, len: a1 - a0, span, h };
    });
    // beams (centre lines) + labels
    for (const b of beams) {
      const p = P(b.x0, b.z0), q = P(b.x1, b.z1);
      g.strokeStyle = b.h > 300 ? 'rgba(192,57,43,.9)' : 'rgba(217,154,30,.95)'; g.lineWidth = b.h > 300 ? 9 : 7; g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke();
      const tt = [0.5, 0.35, 0.65, 0.25, 0.75].find(f => !cols.some(c2 => Math.hypot(c2.x - (b.x0 + (b.x1 - b.x0) * f), c2.z - (b.z0 + (b.z1 - b.z0) * f)) < 1.0)) ?? 0.5;
      const m: [number, number] = [p[0] + (q[0] - p[0]) * tt, p[1] + (q[1] - p[1]) * tt], vert = Math.abs(q[1] - p[1]) > Math.abs(q[0] - p[0]);
      const lx2 = m[0] + (vert ? 26 : 0), ly2 = m[1] + (vert ? 0 : -16);
      g.font = `700 17px ${FONT}`; const tw = g.measureText(b.id).width + 10;
      g.fillStyle = '#fff'; g.fillRect(lx2 - tw / 2, ly2 - 14, tw, 22); g.fillStyle = '#8a5a00'; g.textAlign = 'center'; g.fillText(b.id, lx2, ly2 + 3); g.textAlign = 'left';
    }
    // columns
    for (const c2 of cols) {
      const [x, y] = P(c2.x, c2.z), hs = Math.abs(P(c2.x + 0.11, c2.z)[0] - x);
      g.fillStyle = '#c23b2e'; g.fillRect(x - hs, y - hs, 2 * hs, 2 * hs);
      g.font = `700 18px ${FONT}`; const tw = g.measureText(c2.id).width + 10;
      g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(x + hs + 2, y - hs - 24, tw, 22); g.fillStyle = '#c23b2e'; g.fillText(c2.id, x + hs + 7, y - hs - 7);
    }
    // grid dimension chains between column lines (edited coords), outside the house
    const uniq = (v: number[]) => v.sort((a, b) => a - b).filter((x, i, arr) => i === 0 || x - arr[i - 1] > 0.3);
    const xs = uniq(cols.filter(c2 => !c2.porch).map(c2 => c2.x)), zs = uniq(cols.filter(c2 => !c2.porch).map(c2 => c2.z));
    const zS = map.mz(0) - 0.0, xW = map.mx(14);
    for (let k = 0; k + 1 < xs.length; k++) { const pa = P(xs[k], zS), pb = P(xs[k + 1], zS); const dir = Math.sign(P(xs[k], zS - 1)[1] - pa[1]); dimLine(g, pa, pb, fmtM(xs[k + 1] - xs[k]), [0, dir * 95]); }
    for (let k = 0; k + 1 < zs.length; k++) { const pa = P(xW, zs[k]), pb = P(xW, zs[k + 1]); const dir = Math.sign(P(xW + 1, zs[k])[0] - pa[0]); dimLine(g, pa, pb, fmtM(zs[k + 1] - zs[k]), [dir * 95, 0]); }
    // right column: principles + tables
    const lx = planBox.X + planBox.W + 50, lw = PW - M - 30 - lx; let ly = t + 40;
    heading(g, 'NGUYÊN TẮC BỐ TRÍ', lx, ly); ly += 30; g.font = `400 17px ${FONT}`; g.fillStyle = INK;
    ['Hai hàng cột biên chạy dọc nhà (mặt tiền, tường hậu).', 'Không có cột đứng giữa phòng khách, bếp: cột chỉ ở chân tường.',
      'Cột giữa nhà chỉ ở góc phòng kín, trùng tường (tường giữa).', 'Hệ dầm móng liên kết toàn bộ chân cột (kể cả hiên).',
      'Dầm đỏ: nhịp lớn, cao ≥ 350 — kỹ sư tính lại theo tải thực tế.'].forEach(l2 => { ly += 26; g.fillText('• ' + l2, lx, ly, lw); });
    ly += 70; heading(g, 'BẢNG CỘT', lx, ly);
    const half = Math.ceil(cols.length / 2), colRows = (arr: typeof cols) => arr.map(c2 => [c2.id, r2(c2.x - ox).toFixed(2), r2(c2.z - oz).toFixed(2), c2.porch ? 'hiên' : '220×220']);
    const ccols = [{ t: 'Cột', w: 62 }, { t: 'X', w: 70, right: true }, { t: 'Z', w: 70, right: true }, { t: 'Tiết diện', w: 100 }];
    table(g, lx, ly + 22, ccols, colRows(cols.slice(0, half)), 27, 15);
    ly = table(g, lx + 320, ly + 22, ccols, colRows(cols.slice(half)), 27, 15) + 75;
    heading(g, 'BẢNG DẦM GIẰNG', lx, ly);
    const bRows = beams.map(b => [b.id, b.alongX ? `Z = ${r2(b.at - oz).toFixed(2)}` : `X = ${r2(b.at - ox).toFixed(2)}`, fmtM(b.len), fmtM(b.span), b.sup.map(c2 => c2.id).join(' ') || 'gối dầm', `220×${b.h}`]);
    table(g, lx, ly + 22, [{ t: 'Dầm', w: 56 }, { t: 'Trục', w: 110 }, { t: 'Dài', w: 64, right: true }, { t: 'Nhịp max', w: 86, right: true }, { t: 'Gối lên cột', w: 220 }, { t: 'Sơ bộ', w: 90 }], bRows, 25, 14);
    pages.push(c);
  }

  // ================= STRUCTURE SET KC-01…KC-04 + septic tank BP-01 (owner's reference sets anh-ket-cau, anh-be-phot) =================
  const S2 = d.structure;
  const FOOTS: { t: string; B: number }[] = [{ t: 'MĐ1', B: 1.5 }, { t: 'MĐ2', B: 1.3 }, { t: 'MĐ3', B: 1.2 }, { t: 'MĐ4', B: 1.0 }];
  const footN = (t: string) => S2.cols.filter(c2 => c2.foot === t).length;
  const meshN = (B: number) => Math.floor((B - 0.1) / 0.15) + 1;             // Ø12a150 each way, 50 cover each side
  const kgm = (dia: number) => 0.00617 * dia * dia;                           // kg per metre of a Ø bar
  const hatch = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, gap = 9, col = 'rgba(60,60,60,.55)') => {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.strokeStyle = col; g.lineWidth = 1;
    for (let k = -h; k < w; k += gap) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + h, y); g.stroke(); } g.restore(); };
  const dots = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = 'rgba(70,70,70,.55)'; let s = 7;
    for (let i = 0; i < w * h / 70; i++) { s = (s * 16807) % 2147483647; const px = x + (s % 1000) / 1000 * w; s = (s * 16807) % 2147483647; const py = y + (s % 1000) / 1000 * h; g.fillRect(px, py, 1.6, 1.6); }
    g.restore(); g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(x, y, w, h); };
  const lvl = (g: CanvasRenderingContext2D, x: number, y: number, s: string, left = false) => {
    g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 9, y - 12); g.lineTo(x + 9, y - 12); g.lineTo(x, y); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x - (left ? 120 : 14), y); g.lineTo(x + (left ? 14 : 120), y); g.stroke();
    g.font = `600 17px ${FONT}`; g.textAlign = left ? 'right' : 'left'; g.fillText(s, left ? x - 16 : x + 16, y - 16); g.textAlign = 'left'; };
  const callout = (g: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number, s: string, n?: string) => {
    g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.lineTo(tx + (tx >= x ? 1 : -1) * (g.measureText(s).width + (n ? 46 : 10)), ty); g.stroke();
    g.font = `500 17px ${FONT}`; g.fillStyle = INK; const right = tx >= x;
    if (n) { const cx = right ? tx + 16 : tx - 16; g.beginPath(); g.arc(cx, ty - 1, 13, 0, Math.PI * 2); g.stroke(); g.textAlign = 'center'; g.fillText(n, cx, ty + 5); }
    g.textAlign = right ? 'left' : 'right'; g.fillText(s, right ? tx + (n ? 36 : 6) : tx - (n ? 36 : 6), ty - 5); g.textAlign = 'left'; };
  const noteLines = (g: CanvasRenderingContext2D, x: number, y: number, w: number, lines: string[], px = 18, lh = 28) => {
    g.fillStyle = INK; g.font = `400 ${px}px ${FONT}`; for (const l of lines) { g.fillText(l, x, y, w); y += lh; } return y; };
  const MAT_NOTES = ['Bê tông móng, cột, dầm, sàn: B22.5 (mác 300); bê tông lót B7.5 (mác 100) dày 100.',
    'Thép CB240-T (Ø ≤ 8): Rs = 210 MPa; thép CB300-V (Ø ≥ 10): Rs = 260 MPa.',
    'Lớp bảo vệ: móng 50, cột / dầm 25. Nối buộc thép ≥ 30d, không nối quá 50 % tại một mặt cắt.',
    'Đáy móng −2.000 (nền đất tự nhiên, R ≥ 1.0 kG/cm²); hố móng gặp đất yếu phải báo thiết kế.'];

  // ---------------- KC-01 foundation plan ----------------
  // grid axes: numbered along x (page left → right), lettered along z (facade up), from the column centres
  const merge = (v: number[]) => v.sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] > 0.3);
  const gX = merge(S2.cols.map(c2 => c2.x)).sort((a, b) => planP(a, 0)[0] - planP(b, 0)[0]);
  const gZ = merge(S2.cols.map(c2 => c2.z)).sort((a, b) => planP(0, b)[1] - planP(0, a)[1]).reverse();
  const axX = gX.map((x, i) => ({ x, id: String(i + 1) })), axZ = gZ.sort((a, b) => a - b).map((z, i) => ({ z, id: 'ABCDEFG'[i] }));
  const drawAxes = (g: CanvasRenderingContext2D, z0: number, z1: number, x0: number, x1: number) => {
    g.setLineDash([26, 6, 4, 6]); g.strokeStyle = '#6b7480'; g.lineWidth = 1.3;
    for (const a of axX) { const p = planP(a.x, z0), q = planP(a.x, z1); g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); }
    for (const a of axZ) { const p = planP(x0, a.z), q = planP(x1, a.z); g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); }
    g.setLineDash([]);
    const bub = (p: [number, number], s: string) => { g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], 22, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = INK; g.font = `700 22px ${FONT}`; g.textAlign = 'center'; g.fillText(s, p[0], p[1] + 8); g.textAlign = 'left'; };
    for (const a of axX) { const p = planP(a.x, z0), q = planP(a.x, z1); bub([p[0], p[1] + (p[1] > q[1] ? 22 : -22)], a.id); bub([q[0], q[1] + (q[1] > p[1] ? 22 : -22)], a.id); }
    for (const a of axZ) { const p = planP(x0, a.z), q = planP(x1, a.z); bub([p[0] + (p[0] > q[0] ? 22 : -22), p[1]], a.id); bub([q[0] + (q[0] > p[0] ? 22 : -22), q[1]], a.id); }
  };
  const zLo = Math.min(...axZ.map(a => a.z)) - 1.5, zHi = Math.max(...axZ.map(a => a.z)) + 1.5, xLo = Math.min(...axX.map(a => a.x)) - 1.3, xHi = Math.max(...axX.map(a => a.x)) + 1.3;
  {
    const { c, g, top: t } = page('MẶT BẰNG KẾT CẤU MÓNG', 'KC-01', pages.length + 1, TOTAL, date, size);
    heading(g, 'MẶT BẰNG KẾT CẤU MÓNG', planBox.X, M + 70, 'Móng đơn BTCT MĐ1–MĐ4 dưới cột · dầm móng 220 × 400 nối các chân cột · đáy móng −2.000');
    g.globalAlpha = 0.22; drawBase(g, false); g.globalAlpha = 1;
    drawAxes(g, zLo, zHi, xLo, xHi);
    // ground beams (centre band)
    for (const b of S2.beams) { const p = planP(b.x0, b.z0), q = planP(b.x1, b.z1), hw = Math.abs(planP(b.x0 + 0.11, b.z0)[0] - p[0]);
      g.fillStyle = 'rgba(184,106,44,.28)'; g.strokeStyle = 'rgba(140,80,30,.8)'; g.lineWidth = 1;
      const v = Math.abs(q[1] - p[1]) > Math.abs(q[0] - p[0]); const r: [number, number, number, number] = v ? [p[0] - hw, Math.min(p[1], q[1]), 2 * hw, Math.abs(q[1] - p[1])] : [Math.min(p[0], q[0]), p[1] - hw, Math.abs(q[0] - p[0]), 2 * hw];
      g.fillRect(...r); g.strokeRect(...r); }
    for (const c2 of S2.cols) {
      const [x, y] = planP(c2.x, c2.z), u = Math.abs(planP(c2.x + 1, c2.z)[0] - x);
      if (!c2.porch) {
        const hb = c2.B / 2 * u, hl = (c2.B / 2 + 0.1) * u;
        g.setLineDash([6, 5]); g.strokeStyle = SOFT; g.lineWidth = 1.2; g.strokeRect(x - hl, y - hl, 2 * hl, 2 * hl); g.setLineDash([]);
        g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x - hb, y - hb, 2 * hb, 2 * hb); hatch(g, x - hb, y - hb, 2 * hb, 2 * hb, 7);
        g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x - hb, y - hb, 2 * hb, 2 * hb);
        g.strokeStyle = 'rgba(60,60,60,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - hb, y - hb); g.lineTo(x + hb, y + hb); g.moveTo(x + hb, y - hb); g.lineTo(x - hb, y + hb); g.stroke();
        g.font = `600 15px ${FONT}`; const s = `${c2.foot} (${mm(c2.B)}×${mm(c2.B)})`, tw = g.measureText(s).width + 8;
        g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(x + hb - 4, y + hb + 2, tw, 21); g.fillStyle = INK; g.fillText(s, x + hb, y + hb + 18);
      }
      const hc = 0.11 * u; g.fillStyle = c2.porch ? '#8a5a3c' : '#c23b2e'; g.fillRect(x - hc, y - hc, 2 * hc, 2 * hc);
      g.fillStyle = INK; g.font = `700 14px ${FONT}`; g.fillText(c2.ct, x + hc + 3, y - hc - 3);
    }
    // dimension chains between axes: along x above the house, along z on the east side
    const zT = zHi - 0.55, xE = xLo + 0.55;
    for (let k = 0; k + 1 < axX.length; k++) dimLine(g, planP(axX[k].x, zT), planP(axX[k + 1].x, zT), mm(Math.abs(axX[k + 1].x - axX[k].x)), [0, 0]);
    dimLine(g, planP(axX[0].x, zT + 0.45), planP(axX[axX.length - 1].x, zT + 0.45), mm(Math.abs(axX[axX.length - 1].x - axX[0].x)), [0, 0]);
    for (let k = 0; k + 1 < axZ.length; k++) dimLine(g, planP(xE, axZ[k].z), planP(xE, axZ[k + 1].z), mm(axZ[k + 1].z - axZ[k].z), [0, 0]);
    // right panel
    const lx = planBox.X + planBox.W + 60, lw = PW - M - 30 - lx; let ly = t + 40;
    heading(g, 'THỐNG KÊ MÓNG', lx, ly);
    ly = table(g, lx, ly + 26, [{ t: 'Loại', w: 90 }, { t: 'Kích thước', w: 170 }, { t: 'SL', w: 60, right: true }, { t: 'Thép lưới', w: 170 }, { t: 'Cột', w: 110 }],
      FOOTS.map(f => [f.t, `${mm(f.B)} × ${mm(f.B)}`, String(footN(f.t)), `Ø12a150 2 phương`, f.B >= 1.3 ? 'C2 4Ø18' : 'C1 4Ø16']), 36, 18) + 20;
    ly = noteLines(g, lx, ly + 10, lw, [`Tổng ${S2.footings} móng đơn, ${S2.columns} cột (kể cả 2 cột hiên C3).`, 'Loại móng theo diện tích chịu tải của cột:',
      '  MĐ1 ≥ 18 m², MĐ2 ≥ 11 m², MĐ3 ≥ 6.5 m², còn lại MĐ4.', 'Cột hiên C3 không có móng riêng: đứng trên dầm móng', 'console vươn ra từ nhà (xem KC-02).',
      'Nét đứt: bê tông lót đá 4×6 mác 100, rộng hơn móng 100.', 'Dải nâu: dầm móng DM 220 × 400, đỉnh −0.300.'], 18, 27) + 24;
    heading(g, 'VẬT LIỆU', lx, ly); ly = noteLines(g, lx, ly + 36, lw, MAT_NOTES.flatMap(s => s.length > 52 ? [s.slice(0, s.lastIndexOf(' ', 52)), '   ' + s.slice(s.lastIndexOf(' ', 52) + 1)] : [s]), 17, 26);
    pages.push(c);
  }

  // ---------------- KC-02 footing, column and beam details ----------------
  {
    const { c, g, top: t } = page('CHI TIẾT MÓNG, CỘT, DẦM', 'KC-02', pages.length + 1, TOTAL, date, size);
    heading(g, 'CHI TIẾT MÓNG ĐƠN MĐ1 – MĐ4, CỘT, DẦM', M + 60, M + 70, 'Kích thước mm · cao độ m (±0.000 = mặt nền nhà)');
    // four footing plans along the top
    const sc = 0.2, py = t + 120, pw = 470;
    FOOTS.forEach((f, i) => {
      const B = f.B * 1000, cx = M + 60 + pw * i + pw / 2 - 30, cy = py + 180, h = B * sc / 2, hl = (B + 200) * sc / 2;
      dots(g, cx - hl, cy - hl, 2 * hl, 2 * hl); g.fillStyle = '#fff'; g.fillRect(cx - h, cy - h, 2 * h, 2 * h); g.strokeStyle = INK; g.lineWidth = 2.2; g.strokeRect(cx - h, cy - h, 2 * h, 2 * h);
      g.strokeStyle = 'rgba(60,60,60,.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - h, cy - h); g.lineTo(cx - 25, cy - 25); g.moveTo(cx + h, cy - h); g.lineTo(cx + 25, cy - 25); g.moveTo(cx - h, cy + h); g.lineTo(cx - 25, cy + 25); g.moveTo(cx + h, cy + h); g.lineTo(cx + 25, cy + 25); g.stroke();
      const n = meshN(f.B), step = (B - 100) * sc / (n - 1);
      g.strokeStyle = '#b4532a'; g.lineWidth = 1.2; g.setLineDash([5, 4]);
      for (let k = 0; k < n; k++) { const o = -h + 50 * sc / 2 + k * step * 1; if (k % 2) continue; g.beginPath(); g.moveTo(cx + o, cy - h + 6); g.lineTo(cx + o, cy + h - 6); g.stroke(); g.beginPath(); g.moveTo(cx - h + 6, cy + o); g.lineTo(cx + h - 6, cy + o); g.stroke(); }
      g.setLineDash([]); hatch(g, cx - 22, cy - 22, 44, 44, 5, '#c23b2e'); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(cx - 22, cy - 22, 44, 44);
      dimLine(g, [cx - h, cy + hl], [cx + h, cy + hl], String(B), [0, 34]); dimLine(g, [cx - hl, cy + hl], [cx - h, cy + hl], '100', [0, 64]);
      dimLine(g, [cx + h, cy - h], [cx + h, cy + h], String(B), [hl - h + 30, 0]);
      g.font = `600 17px ${FONT}`; callout(g, cx - h * 0.5, cy - h * 0.62, cx - h - 10, cy - h - 30, 'Ø12a150', '1'); callout(g, cx + h * 0.62, cy - h * 0.3, cx + h + 6, cy - h - 30, 'Ø12a150', '2');
      g.fillStyle = INK; g.font = `800 28px ${FONT}`; g.textAlign = 'center'; g.fillText(`${f.t}`, cx, cy + hl + 112); g.font = `500 18px ${FONT}`;
      g.fillText(`${B} × ${B} · SL ${footN(f.t)}`, cx, cy + hl + 138); g.textAlign = 'left';
    });
    // typical section 1-1 (generic B)
    const sx = M + 140, sy0 = t + 640, k = 0.27, X = (v: number) => sx + 420 + v * k, Yv = (y: number) => sy0 + (500 - y) * k;  // y in mm, ±0 = 0
    g.fillStyle = INK; g.font = `800 26px ${FONT}`; g.fillText('MẶT CẮT 1-1 (ĐIỂN HÌNH MĐ)', sx, sy0 - 20);
    const Bm = 1500;
    dots(g, X(-Bm / 2 - 100), Yv(-2000), (Bm + 200) * k, 100 * k);                                          // lean concrete
    g.fillStyle = '#e9e6df'; g.strokeStyle = INK; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(X(-Bm / 2), Yv(-2000)); g.lineTo(X(Bm / 2), Yv(-2000)); g.lineTo(X(Bm / 2), Yv(-1700)); g.lineTo(X(160), Yv(-1500)); g.lineTo(X(110), Yv(-1500));
    g.lineTo(X(110), Yv(-700)); g.lineTo(X(-110), Yv(-700)); g.lineTo(X(-110), Yv(-1500)); g.lineTo(X(-160), Yv(-1500)); g.lineTo(X(-Bm / 2), Yv(-1700)); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(184,106,44,.3)'; g.fillRect(X(-900), Yv(-300), 1800 * k, 400 * k); g.strokeRect(X(-900), Yv(-300), 1800 * k, 400 * k);   // ground beam
    g.fillStyle = '#f2e6dc'; g.fillRect(X(-110), Yv(500), 220 * k, 800 * k); g.strokeRect(X(-110), Yv(500), 220 * k, 800 * k);                 // column above
    hatch(g, X(-900), Yv(0), 790 * k, 300 * k, 10); hatch(g, X(110), Yv(0), 790 * k, 300 * k, 10);                                            // brick wall on the beam
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(X(-1300), Yv(0)); g.lineTo(X(1300), Yv(0)); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(-1300), Yv(-760)); g.lineTo(X(-160), Yv(-760)); g.moveTo(X(160), Yv(-760)); g.lineTo(X(1300), Yv(-760)); g.stroke();
    // rebar: mesh dots, column bars with 150 feet, stirrups
    g.fillStyle = '#b4532a'; for (let v = -Bm / 2 + 50; v <= Bm / 2 - 50; v += 150) { g.beginPath(); g.arc(X(v), Yv(-1940), 3.2, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#b4532a'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(X(-Bm / 2 + 50), Yv(-1925)); g.lineTo(X(Bm / 2 - 50), Yv(-1925)); g.stroke();
    for (const v of [-80, 80]) { g.beginPath(); g.moveTo(X(v + Math.sign(v) * 150 * -1 * -1), Yv(-1925)); g.lineTo(X(v), Yv(-1925)); g.lineTo(X(v), Yv(480)); g.stroke(); }
    g.lineWidth = 1.2; for (let y = -1850; y < 480; y += 150) { g.beginPath(); g.moveTo(X(-85), Yv(y)); g.lineTo(X(85), Yv(y)); g.stroke(); }
    lvl(g, X(1300), Yv(0), '±0.000 nền nhà'); lvl(g, X(1300), Yv(-300), '−0.300 đỉnh dầm móng'); lvl(g, X(1300), Yv(-760), '−0.760 sân');
    lvl(g, X(-1300), Yv(-700), '−0.700', true); lvl(g, X(-1300), Yv(-1500), '−1.500', true); lvl(g, X(-1300), Yv(-2000), '−2.000 đáy móng', true);
    dimLine(g, [X(-Bm / 2), Yv(-2100)], [X(Bm / 2), Yv(-2100)], 'B (1500 / 1300 / 1200 / 1000)', [0, 40]);
    dimLine(g, [X(Bm / 2), Yv(-2000)], [X(Bm / 2), Yv(-1700)], '300', [70, 0]); dimLine(g, [X(Bm / 2), Yv(-1700)], [X(Bm / 2), Yv(-1500)], '200', [70, 0]); dimLine(g, [X(Bm / 2), Yv(-2100)], [X(Bm / 2), Yv(-2000)], '100', [70, 0]);
    g.font = `500 17px ${FONT}`;
    callout(g, X(300), Yv(-1940), X(560), Yv(-2240), 'Ø12a150 lưới đáy 2 lớp', '1'); callout(g, X(-80), Yv(-1100), X(-560), Yv(-1180), '4Ø16 / 4Ø18 thép cột, chân bẻ 150', '3');
    callout(g, X(60), Yv(-1250), X(560), Yv(-1350), 'Đai Ø8a150 (a100 ở 2 đầu)', 'S1'); callout(g, X(-600), Yv(-500), X(-700), Yv(-430), 'Dầm móng DM 220×400', '');
    callout(g, X(-500), Yv(150), X(-700), Yv(260), 'Tường gạch 220 / 110', ''); callout(g, X(-Bm / 2 - 50), Yv(-2050), X(-1000), Yv(-2240), 'BT lót đá 4×6 M100 dày 100', '');
    // column sections C1 / C2 / C3 and beam sections DM / DG
    const sec = (x: number, y: number, w: number, h: number, bars: [number, number][], dia: number, title: string, sub: string[]) => {
      const kk = 0.75; g.fillStyle = '#efe9e1'; g.fillRect(x, y, w * kk, h * kk); g.strokeStyle = INK; g.lineWidth = 2.2; g.strokeRect(x, y, w * kk, h * kk);
      g.strokeStyle = '#b4532a'; g.lineWidth = 2; g.strokeRect(x + 25 * kk, y + 25 * kk, (w - 50) * kk, (h - 50) * kk);
      g.fillStyle = '#b4532a'; for (const [bx, by] of bars) { g.beginPath(); g.arc(x + bx * kk, y + by * kk, dia * kk / 2 + 1.5, 0, Math.PI * 2); g.fill(); }
      dimLine(g, [x, y + h * kk], [x + w * kk, y + h * kk], String(w), [0, 30]); dimLine(g, [x + w * kk, y], [x + w * kk, y + h * kk], String(h), [30, 0]);
      g.fillStyle = INK; g.font = `800 22px ${FONT}`; g.fillText(title, x, y - 16); g.font = `400 16px ${FONT}`; sub.forEach((s, i) => g.fillText(s, x, y + h * kk + 66 + i * 22));
    };
    const cxs = M + 1420, cy0 = t + 640;
    const sq = (w: number, h: number, d0: number): [number, number][] => [[25 + d0 / 2 + 6, 25 + d0 / 2 + 6], [w - 31 - d0 / 2, 25 + d0 / 2 + 6], [25 + d0 / 2 + 6, h - 31 - d0 / 2], [w - 31 - d0 / 2, h - 31 - d0 / 2]];
    const nC = (ct: string) => S2.cols.filter(c2 => c2.ct === ct).length;
    sec(cxs, cy0, 220, 220, sq(220, 220, 16), 16, `C1 (SL ${nC('C1')})`, ['220×220 · 4Ø16', 'Đai Ø8a150']);
    sec(cxs + 300, cy0, 220, 220, sq(220, 220, 18), 18, `C2 (SL ${nC('C2')})`, ['220×220 · 4Ø18', 'Đai Ø8a150']);
    sec(cxs + 600, cy0, 220, 220, sq(220, 220, 16), 16, `C3 (SL ${nC('C3')})`, ['220×220 · 4Ø16 (lõi cột hiên)', 'Đai Ø8a150, ốp phào ngoài']);
    sec(cxs, cy0 + 380, 220, 400, [...sq(220, 400, 16)], 16, 'DM — dầm móng', ['220×400 · 2Ø16 trên + 2Ø16 dưới', 'Đai Ø8a150, đỉnh −0.300']);
    sec(cxs + 300, cy0 + 380, 220, 300, sq(220, 300, 14), 14, 'DG — dầm giằng tường', ['220×300 · 2Ø14 + 2Ø14', 'Đai Ø6a200, đỉnh +4.100']);
    sec(cxs + 600, cy0 + 380, 220, 300, sq(220, 300, 16), 16, 'DH — dầm hiên', ['220×300 · 2Ø16 + 2Ø16', 'Đai Ø8a150, đáy +2.920']);
    noteLines(g, cxs, cy0 + 880, 900, ['Dầm móng hiên vươn console từ nhà ra đỡ 2 cột C3 (không móng riêng).', 'Cột C ở tường 110 lệch tâm, mặt cột bằng mặt tường phía phòng khách.'], 17, 26);
    pages.push(c);
  }

  // ---------------- KC-03 foundation construction sequence (isometric) ----------------
  {
    const { c, g, top: t, bottom } = page('TRÌNH TỰ THI CÔNG MÓNG', 'KC-03', pages.length + 1, TOTAL, date, size);
    heading(g, 'TRÌNH TỰ THI CÔNG MÓNG ĐƠN', M + 60, M + 70, 'Minh hoạ cho móng MĐ1 1500 × 1500; các móng khác làm tương tự');
    const QW = (PW - 2 * M - 120) / 2, QH = (bottom - t - 110) / 2, X0 = M + 60, Y0 = t + 100;
    g.setLineDash([10, 8]); g.strokeStyle = LINE; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(X0 + QW, Y0); g.lineTo(X0 + QW, Y0 + 2 * QH); g.moveTo(X0, Y0 + QH); g.lineTo(X0 + 2 * QW, Y0 + QH); g.stroke(); g.setLineDash([]);
    const steps = ['B1: ĐỔ BÊ TÔNG LÓT', 'B2: ĐẶT CON KÊ BÊ TÔNG', 'B3: ĐAN LƯỚI THÉP MÓNG 2 LỚP', 'B4: DỰNG THÉP CỔ CỘT, ĐỔ BÊ TÔNG MÓNG'];
    steps.forEach((title, i) => {
      const qx = X0 + (i % 2) * QW, qy = Y0 + Math.floor(i / 2) * QH, ox = qx + QW / 2, oy = qy + QH * 0.62, s = 170;
      const P = (x: number, y: number, z: number): [number, number] => [ox + (x - z) * Math.cos(Math.PI / 6) * s, oy + (x + z) * Math.sin(Math.PI / 6) * s - y * s];
      const poly = (pts: [number, number][], fill: string) => { g.fillStyle = fill; g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); pts.forEach((p, j) => j ? g.lineTo(...p) : g.moveTo(...p)); g.closePath(); g.fill(); g.stroke(); };
      const boxI = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, top: string, side: string) => {
        poly([P(x0, y1, z1), P(x1, y1, z1), P(x1, y0, z1), P(x0, y0, z1)], side); poly([P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), P(x1, y0, z0)], side); poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], top); };
      const line = (a: [number, number, number], b: [number, number, number], w = 2.2, col = '#b4532a') => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(...P(...a)); g.lineTo(...P(...b)); g.stroke(); };
      const H = 0.85;
      boxI(-H - 0.1, H + 0.1, -H - 0.1, H + 0.1, -0.1, 0, '#f1efe9', '#dcd8cf');
      if (i >= 1) for (const a of [-0.55, 0, 0.55]) for (const b of [-0.55, 0, 0.55]) boxI(a - 0.03, a + 0.03, b - 0.03, b + 0.03, 0, 0.05, '#cfcac0', '#b9b4aa');
      if (i >= 2) { for (let v = -H + 0.05; v <= H - 0.05; v += 0.15) { line([v, 0.06, -H + 0.05], [v, 0.06, H - 0.05]); line([-H + 0.05, 0.075, v], [H - 0.05, 0.075, v], 2.2, '#8a3e1e'); } }
      if (i >= 3) { const cb = 0.08;
        for (const [a, b] of [[-cb, -cb], [cb, -cb], [-cb, cb], [cb, cb]] as [number, number][]) { line([a + Math.sign(a) * 0.15, 0.09, b], [a, 0.09, b], 3); line([a, 0.09, b], [a, 1.9, b], 3); }
        for (let y = 0.2; y < 1.85; y += 0.15) { line([-cb, y, -cb], [cb, y, -cb], 1.4, INK); line([cb, y, -cb], [cb, y, cb], 1.4, INK); line([cb, y, cb], [-cb, y, cb], 1.4, INK); line([-cb, y, cb], [-cb, y, -cb], 1.4, INK); } }
      g.fillStyle = INK; g.font = `700 30px ${FONT}`; g.fillText(title, qx + 30, qy + QH - 30);
      g.font = `500 18px ${FONT}`;
      const lab = [['Bê tông lót đá 4×6 M100 dày 100, rộng hơn móng 100 mỗi bên.'], ['Con kê bê tông 50 × 50 × 50, khoảng 500–600, giữ lớp bảo vệ 50.'],
        ['(2) Thép lớp dưới Ø12a150 · (1) thép lớp trên Ø12a150 vuông góc, buộc kẽm từng mắt.'], ['(3)(4) Thép cột 4Ø16/4Ø18 chân bẻ 150 đặt trên lưới, đai Ø8a150; ghép cốp pha,', 'đổ BT móng B22.5 liền khối phần vát, bảo dưỡng ẩm ≥ 7 ngày rồi lấp đất từng lớp.']][i];
      lab.forEach((l, j) => g.fillText(l, qx + 30, qy + 50 + j * 26, QW - 60));
    });
    pages.push(c);
  }

  // ---------------- KC-04 rebar schedule + concrete quantities ----------------
  {
    const { c, g, top: t } = page('THỐNG KÊ CỐT THÉP & BÊ TÔNG', 'KC-04', pages.length + 1, TOTAL, date, size);
    heading(g, 'BẢNG THỐNG KÊ CỐT THÉP', M + 60, M + 70, 'Tự tính từ mô hình hiện tại (số móng, cột, chiều dài dầm) · chiều dài thanh mm · trọng lượng kG');
    type Bar = { stt: string; shape: string; d: number; L: number; n1: number; n: number };
    const groups: { name: string; bars: Bar[] }[] = [];
    for (const f of FOOTS) { const n = footN(f.t); if (!n) continue; const nb = meshN(f.B), L = Math.round(f.B * 1000 - 80);
      groups.push({ name: `${f.t} (SL ${n})`, bars: [{ stt: '1', shape: `thẳng ${L}`, d: 12, L, n1: nb, n: nb * n }, { stt: '2', shape: `thẳng ${L}`, d: 12, L, n1: nb, n: nb * n }] }); }
    const colH = 4.1 + 1.95, porH = 2.92 + 0.65;
    for (const ct of ['C1', 'C2', 'C3']) { const n = S2.cols.filter(c2 => c2.ct === ct).length; if (!n) continue; const H = ct === 'C3' ? porH : colH, d0 = ct === 'C2' ? 18 : 16, L = Math.round(H * 1000 + 150 + 300);
      groups.push({ name: `${ct} (SL ${n})`, bars: [{ stt: '3', shape: `150┘ ${Math.round(H * 1000)} └300`, d: d0, L, n1: 4, n: 4 * n }, { stt: 'S1', shape: '□ 170×170 + móc 80', d: 8, L: 840, n1: Math.ceil(H / 0.15) + 1, n: (Math.ceil(H / 0.15) + 1) * n }] }); }
    const gb = S2.groundBeam, tb = S2.tieBeam;
    groups.push({ name: `DM 220×400 (${gb.toFixed(1)} m)`, bars: [{ stt: '1', shape: 'thẳng, nối ≥ 30d', d: 16, L: Math.round(gb * 1000 * 1.08), n1: 4, n: 4 }, { stt: '2', shape: '□ 170×350 + móc 80', d: 8, L: 1200, n1: Math.ceil(gb / 0.15), n: Math.ceil(gb / 0.15) }] });
    groups.push({ name: `DG 220×300 (${tb.toFixed(1)} m)`, bars: [{ stt: '1', shape: 'thẳng, nối ≥ 30d', d: 14, L: Math.round(tb * 1000 * 1.08), n1: 4, n: 4 }, { stt: '2', shape: '□ 170×250 + móc 80', d: 6, L: 1000, n1: Math.ceil(tb / 0.2), n: Math.ceil(tb / 0.2) }] });
    groups.push({ name: 'Bể phốt (đáy, nắp, giằng)', bars: [
      { stt: '1', shape: 'đáy thẳng 2340', d: 10, L: 2340, n1: 11, n: 11 }, { stt: '2', shape: 'đáy thẳng 1540', d: 10, L: 1540, n1: 16, n: 16 },
      { stt: 'TĐ', shape: 'nắp thẳng 1560', d: 10, L: 1560, n1: 6, n: 24 }, { stt: 'TĐ', shape: 'nắp phân bố 510', d: 6, L: 510, n1: 8, n: 32 },
      { stt: 'DB', shape: 'giằng thành 7800', d: 14, L: 7800, n1: 4, n: 4 }, { stt: 'DB', shape: '□ 170×240 + móc 80', d: 6, L: 980, n1: 40, n: 40 }] });
    const sum = { a: 0, b: 0, c2: 0 };
    const rowsOf = (gr: typeof groups[number]) => { let a = 0, b = 0;
      const rows = gr.bars.map((br, j) => { const tot = br.L / 1000 * br.n, kg = tot * kgm(br.d); if (br.d <= 10) a += kg; else b += kg;
        return [j === 0 ? gr.name : '', br.stt, br.shape, String(br.d), String(br.L), String(br.n1), String(br.n), tot.toFixed(1), kg.toFixed(1)]; });
      sum.a += a; sum.b += b; rows.push(['', '', `Tổng: Ø≤10 ${a.toFixed(1)} · Ø≤18 ${b.toFixed(1)} · Ø>18 0`, '', '', '', '', '', (a + b).toFixed(1)]); return rows; };
    const cols = [{ t: 'Cấu kiện', w: 230 }, { t: 'STT', w: 54 }, { t: 'Hình dạng, kích thước', w: 330 }, { t: 'Ø', w: 46, right: true }, { t: 'Dài thanh', w: 100, right: true },
      { t: 'SL 1CK', w: 74, right: true }, { t: 'SL TB', w: 74, right: true }, { t: 'Tổng dài m', w: 110, right: true }, { t: 'Kg', w: 90, right: true }];
    const blocks = groups.map(rowsOf), totalRows = blocks.reduce((s2, b) => s2 + b.length, 0), left: string[][] = [], right: string[][] = [];
    let toRight = false; for (const b of blocks) { if (!toRight && left.length + b.length > totalRows / 2 + 3) toRight = true; (toRight ? right : left).push(...b); }
    table(g, M + 40, t + 90, cols, left, 31, 15);
    const rx = M + 40 + cols.reduce((s2, cc) => s2 + cc.w, 0) + 40;
    let ry = table(g, rx, t + 90, cols, right, 31, 15) + 30;
    ry = table(g, rx, ry, [{ t: 'TỔNG CỘNG THÉP', w: 560 }, { t: 'kG', w: 160, right: true }], [['Ø ≤ 10 (CB240-T / CB300-V)', sum.a.toFixed(0)], ['10 < Ø ≤ 18 (CB300-V)', sum.b.toFixed(0)], ['Cộng (chưa kể hao hụt 2 %)', (sum.a + sum.b).toFixed(0)]], 34, 18) + 36;
    // concrete
    const footV = S2.cols.filter(c2 => !c2.porch).reduce((s2, c2) => { const A1 = c2.B * c2.B, A2 = 0.32 * 0.32; return s2 + A1 * 0.3 + 0.2 / 3 * (A1 + A2 + Math.sqrt(A1 * A2)); }, 0);
    const leanV = S2.cols.filter(c2 => !c2.porch).reduce((s2, c2) => s2 + (c2.B + 0.2) ** 2 * 0.1, 0) + gb * 0.42 * 0.1;
    const colV = S2.cols.reduce((s2, c2) => s2 + 0.0484 * (c2.porch ? porH : colH - 0.2), 0);
    heading(g, 'KHỐI LƯỢNG BÊ TÔNG', rx, ry + 6);
    table(g, rx, ry + 30, [{ t: 'Hạng mục', w: 400 }, { t: 'Mác', w: 160 }, { t: 'm³', w: 160, right: true }], [
      ['Bê tông lót móng, dầm móng', 'B7.5 (M100)', leanV.toFixed(2)], ['Móng đơn (bản + vát)', 'B22.5 (M300)', footV.toFixed(2)], ['Cột (cổ cột + thân)', 'B22.5', colV.toFixed(2)],
      ['Dầm móng DM 220×400', 'B22.5', (gb * 0.088).toFixed(2)], ['Dầm giằng DG 220×300', 'B22.5', (tb * 0.066).toFixed(2)], ['Bể phốt: đáy 120 + nắp 100', 'B20 (M250)', (2.4 * 1.6 * 0.12 + 2.4 * 1.6 * 0.1).toFixed(2)]], 34, 17);
    pages.push(c);
  }

  // ---------------- BP-01 septic tank ----------------
  {
    const { c, g, top: t } = page('CHI TIẾT BỂ PHỐT', 'BP-01', pages.length + 1, TOTAL, date, size);
    heading(g, 'BỂ PHỐT 3 NGĂN 1600 × 2400 × 1300', M + 60, M + 70, `Vị trí: sau khối WC (X ${SEPTIC.x0.toFixed(2)}–${SEPTIC.x1.toFixed(2)}, Z ${SEPTIC.z0.toFixed(2)}–${SEPTIC.z1.toFixed(2)} m) · xí WC1, WC2 vào ngăn chứa · nước ra từ ngăn lọc vào hố ga HG1`);
    // plan (reference orientation: long side vertical), 1 mm = k px
    const k = 0.3, px = M + 140, py = t + 140, Xp = (v: number) => px + v * k, Yp = (v: number) => py + v * k;
    g.fillStyle = INK; g.font = `800 26px ${FONT}`; g.fillText('MẶT BẰNG BỂ PHỐT', px, py - 40);
    hatch(g, Xp(0), Yp(0), 1600 * k, 2400 * k, 8); g.fillStyle = '#fff';
    const room = (x0: number, y0: number, x1: number, y1: number) => { g.fillRect(Xp(x0), Yp(y0), (x1 - x0) * k, (y1 - y0) * k); g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(Xp(x0), Yp(y0), (x1 - x0) * k, (y1 - y0) * k); };
    room(220, 220, 1380, 1310); room(220, 1420, 745, 2180); room(855, 1420, 1380, 2180);
    g.strokeStyle = INK; g.lineWidth = 2.4; g.strokeRect(Xp(0), Yp(0), 1600 * k, 2400 * k);
    const tag = (x: number, y: number, s: string) => { g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.arc(Xp(x), Yp(y), 15, 0, Math.PI * 2); g.stroke(); g.fillStyle = INK; g.font = `700 18px ${FONT}`; g.textAlign = 'center'; g.fillText(s, Xp(x), Yp(y) + 6); g.textAlign = 'left'; };
    tag(800, 760, '1'); tag(480, 1800, '2'); tag(1120, 1800, '3');
    const pipe = (x0: number, y0: number, x1: number, y1: number) => { g.fillStyle = '#d9e2ea'; g.strokeStyle = INK; g.lineWidth = 1.4; g.fillRect(Xp(x0), Yp(y0), (x1 - x0) * k, (y1 - y0) * k); g.strokeRect(Xp(x0), Yp(y0), (x1 - x0) * k, (y1 - y0) * k); };
    pipe(400, 1250, 460, 1480); pipe(560, 1250, 620, 1480); pipe(700, 1990, 900, 2050); pipe(1340, 1990, 1700, 2050);                   // T pipes Ø110 + outlet
    pipe(1000, -120, 1060, 300); pipe(560, -120, 620, 300);                                                                                // inlets from WC1 / WC2
    g.strokeStyle = INK; g.strokeRect(Xp(1150), Yp(270), 200 * k, 200 * k); g.font = `500 16px ${FONT}`; g.fillStyle = INK;
    callout(g, Xp(1250), Yp(370), Xp(1560), Yp(150), 'Cửa hút cặn 200×200', ''); callout(g, Xp(1030), Yp(-100), Xp(1350), Yp(-180), 'Ống xí WC1, WC2 Ø110', '');
    callout(g, Xp(1700), Yp(2020), Xp(1800), Yp(2250), 'Ra hố ga HG1 Ø110', '');
    const dimH = (a: number, b: number, s: string, y: number) => dimLine(g, [Xp(a), Yp(2400)], [Xp(b), Yp(2400)], s, [0, y]);
    [[0, 220], [220, 745], [745, 855], [855, 1380], [1380, 1600]].forEach(([a, b]) => dimH(a, b, String(b - a), 40)); dimH(0, 1600, '1600', 80);
    const dimV = (a: number, b: number, s: string, x: number) => dimLine(g, [Xp(1600), Yp(a)], [Xp(1600), Yp(b)], s, [x, 0]);
    [[0, 220], [220, 1310], [1310, 1420], [1420, 2180], [2180, 2400]].forEach(([a, b]) => dimV(a, b, String(b - a), 50)); dimV(0, 2400, '2400', 95);
    let ly = Yp(2400) + 150; noteLines(g, px, ly, 600, ['① Ngăn chứa   ② Ngăn lắng   ③ Ngăn lọc', 'Ống chữ T Ø110 nối các ngăn, miệng dưới mặt nước 300.'], 18, 28);
    // sections
    const sec = (x0: number, y0: number, spans: [number, string][], title: string, outlet: boolean) => {
      const kk = 0.25, W = spans.reduce((s2, sp) => s2 + sp[0], 0), X = (v: number) => x0 + v * kk, Y = (h: number) => y0 + (1400 - h) * kk;
      g.fillStyle = INK; g.font = `800 24px ${FONT}`; g.fillText(title, x0, y0 - 30);
      dots(g, X(-100), Y(100), (W + 200) * kk, 100 * kk); g.fillStyle = '#e9e6df'; g.fillRect(X(0), Y(220), W * kk, 120 * kk); g.strokeRect(X(0), Y(220), W * kk, 120 * kk);
      let a = 0; for (const [w, kind] of spans) { if (kind !== 'room') { hatch(g, X(a), Y(1300), w * kk, 1080 * kk, kind === 'w' ? 7 : 9); g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(X(a), Y(1300), w * kk, 1080 * kk); }
        else { g.strokeStyle = '#2f7fd8'; g.lineWidth = 1.2; g.setLineDash([8, 5]); g.beginPath(); g.moveTo(X(a + 30), Y(1080)); g.lineTo(X(a + w - 30), Y(1080)); g.stroke(); g.setLineDash([]); } a += w; }
      g.fillStyle = '#d6d2c8'; g.fillRect(X(0), Y(1400), W * kk, 100 * kk); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(X(0), Y(1400), W * kk, 100 * kk);
      g.strokeStyle = '#b4532a'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(40), Y(140)); g.lineTo(X(W - 40), Y(140)); g.moveTo(X(40), Y(200)); g.lineTo(X(W - 40), Y(200)); g.moveTo(X(40), Y(1330)); g.lineTo(X(W - 40), Y(1330)); g.stroke();
      if (outlet) { g.fillStyle = '#d9e2ea'; g.fillRect(X(W - 260), Y(1110), 460 * kk, 60 * kk); g.strokeRect(X(W - 260), Y(1110), 460 * kk, 60 * kk); }
      let b = 0; for (const [w] of spans) { dimLine(g, [X(b), Y(0)], [X(b + w), Y(0)], String(w), [0, 34]); b += w; }
      dimLine(g, [X(0), Y(0)], [X(W), Y(0)], String(W), [0, 70]);
      for (const [h0, h1, s] of [[0, 100, '100'], [100, 220, '120'], [220, 1300, '1080'], [1300, 1400, '100']] as [number, number, string][]) dimLine(g, [X(W), Y(h0)], [X(W), Y(h1)], s, [50, 0]);
      dimLine(g, [X(W), Y(0)], [X(W), Y(1400)], '1400', [100, 0]);
      g.font = `500 16px ${FONT}`; callout(g, X(W / 2), Y(170), X(W / 2 + 200), Y(-260), 'Đáy BTCT 120, Ø10a150 2 lớp', ''); callout(g, X(W * 0.3), Y(1350), X(W * 0.3 - 100), Y(1700), 'Tấm đan TĐ BTCT 100', '');
    };
    sec(M + 900, t + 190, [[220, 'w'], [1090, 'room'], [110, 'w'], [760, 'room'], [220, 'w']], 'MẶT CẮT 2-2 (DỌC BỂ)', false);
    sec(M + 900, t + 760, [[220, 'w'], [525, 'room'], [110, 'w'], [525, 'room'], [220, 'w']], 'MẶT CẮT 1-1 (NGANG BỂ)', true);
    // cover slabs + ring beam
    const rx = M + 1690, rw = PW - M - 30 - rx;
    const slab = (x: number, y: number, w: number, h: number, nL: number, nS: number, title: string, hole: boolean) => {
      const kk = 0.36; g.fillStyle = '#f3f1ec'; g.fillRect(x, y, w * kk, h * kk); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x, y, w * kk, h * kk);
      g.strokeStyle = '#b4532a'; g.lineWidth = 1.4;
      for (let i = 0; i < nL; i++) { const yy = y + (30 + i * (h - 60) / (nL - 1)) * kk; g.beginPath(); g.moveTo(x + 12, yy); g.lineTo(x + w * kk - 12, yy); g.stroke(); }
      for (let i = 0; i < nS; i++) { const xx = x + (40 + i * (w - 80) / (nS - 1)) * kk; g.beginPath(); g.moveTo(xx, y + 8); g.lineTo(xx, y + h * kk - 8); g.stroke(); }
      if (hole) { g.fillStyle = '#fff'; g.fillRect(x + (w - 320) * kk, y + 170 * kk, 200 * kk, 200 * kk); g.strokeStyle = INK; g.strokeRect(x + (w - 320) * kk, y + 170 * kk, 200 * kk, 200 * kk); }
      dimLine(g, [x, y + h * kk], [x + w * kk, y + h * kk], String(w), [0, 30]); dimLine(g, [x + w * kk, y], [x + w * kk, y + h * kk], String(h), [30, 0]);
      g.fillStyle = INK; g.font = `800 21px ${FONT}`; g.fillText(title, x, y - 14);
    };
    slab(rx, t + 170, 1600, 550, 6, 8, 'TĐ1 (SL 1) — 6Ø10 + 8Ø6, có cửa hút cặn', true);
    slab(rx, t + 470, 1600, 550, 6, 8, 'TĐ2 (SL 3) — 6Ø10 + 8Ø6', false);
    {const x = rx, y = t + 800, kk = 0.5; g.fillStyle = INK; g.font = `800 21px ${FONT}`; g.fillText('DB1 (L 2400, SL 2) · DB2 (L 1600, SL 2)', x, y - 14);
      dots(g, x, y + 290 * kk, 530 * kk, 120 * kk); g.fillStyle = '#efe9e1'; g.fillRect(x + 155 * kk, y, 220 * kk, 290 * kk); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x + 155 * kk, y, 220 * kk, 290 * kk);
      g.strokeStyle = '#b4532a'; g.strokeRect(x + 180 * kk, y + 25 * kk, 170 * kk, 240 * kk); g.fillStyle = '#b4532a';
      for (const [bx, by] of [[192, 37], [338, 37], [192, 253], [338, 253]]) { g.beginPath(); g.arc(x + bx * kk, y + by * kk, 5, 0, Math.PI * 2); g.fill(); }
      hatch(g, x + 155 * kk, y - 220 * kk, 220 * kk, 220 * kk, 7); dimLine(g, [x + 155 * kk, y + 290 * kk], [x + 375 * kk, y + 290 * kk], '220', [0, 90]); dimLine(g, [x + 375 * kk, y], [x + 375 * kk, y + 290 * kk], '290', [110, 0]);
      g.font = `500 16px ${FONT}`; callout(g, x + 192 * kk, y + 37 * kk, x + 420 * kk, y - 60 * kk, '4Ø14', '1'); callout(g, x + 350 * kk, y + 150 * kk, x + 470 * kk, y + 150 * kk, 'Ø6a200', '2'); }
    noteLines(g, rx, t + 1080, rw, ['GHI CHÚ', '– Thành bể xây gạch đặc 75#, vữa XM 50#, dày 220 (vách ngăn 110).', '– Bê tông gạch vỡ lót đáy mác 50 dày 100.', '– Đáy, nắp BTCT B20; trát trong vữa XM 75# dày 15,',
      '  chống thấm Sika 3 lớp, đánh màu.', '– Ống thông hơi Ø60 nối lên ống đứng trong hộp kỹ thuật WC2.', `– Dung tích hữu ích ≈ ${(1.16 * 1.09 * 0.95 + 1.16 * 0.76 * 0.95).toFixed(2)} m³ (đủ 6–8 người).`, '– Đỉnh nắp dưới mặt sân 100, lấp đất / lát gạch lên trên.'], 17, 26);
    pages.push(c);
  }

  // ---------------- KT-06 schedules: doors, windows ----------------
  {
    const { c, g, top: t } = page('THỐNG KÊ CỬA ĐI, CỬA SỔ & PHÒNG', 'KT-06', pages.length + 1, TOTAL, date, size);
    let y = t + 40; heading(g, 'THỐNG KÊ CỬA ĐI', M + 60, y);
    y = table(g, M + 60, y + 26, [{ t: 'Ký hiệu', w: 130 }, { t: 'Tên', w: 420 }, { t: 'Phòng', w: 230 }, { t: 'Rộng × cao (mm)', w: 260 }, { t: 'Loại', w: 760 }, { t: 'SL', w: 80, right: true }],
      d.openings.doors.filter(o => !o.hidden).map(o => {
        const total = o.base.kind === 'main' ? o.w + 2 * MAIN_SIDE : o.w, h = o.base.kind === 'main' ? o.h + MAIN_TRANSOM : o.h;
        return [codes.doors.get(o.id)!, o.label, o.room, `${mm(total)} × ${mm(h)}`, DOOR_KIND[o.base.kind] ?? '', '1'];
      }), 40, 20) + 60;
    heading(g, 'THỐNG KÊ CỬA SỔ (NHÔM KÍNH)', M + 60, y);
    y = table(g, M + 60, y + 26, [{ t: 'Ký hiệu', w: 130 }, { t: 'Tên', w: 420 }, { t: 'Phòng', w: 230 }, { t: 'Rộng × cao (mm)', w: 260 }, { t: 'Bậu (mm)', w: 150, right: true }, { t: 'Kiểu cánh', w: 360 }, { t: 'Ô sáng', w: 170 }, { t: 'SL', w: 80, right: true }],
      d.openings.wins.filter(o => !o.hidden).map(o => [codes.wins.get(o.id)!, o.label, o.room, `${mm(o.w)} × ${mm(o.h)}`, mm(o.sill), STYLE[o.base.style] ?? '', o.h >= 1.6 ? '450' : o.h >= 1.1 ? '280' : '—', '1']), 40, 20) + 40;
    g.fillStyle = SOFT; g.font = `400 20px ${FONT}`;
    g.fillText(`Tổng: ${codes.doors.size} cửa đi, ${codes.wins.size} cửa sổ. Cửa sổ cao 1800 = cánh 1350 + ô sáng 450 (trừ cửa sổ WC, bếp từ, cạnh máy giặt). Cửa chính tính cả 2 ô kính bên và ô sáng.`, M + 60, y);
    pages.push(c);
  }

  // ---------------- KT-06B floor / wall tiles (owner's choice) ----------------
  {
    const { c, g, top: t } = page('THỐNG KÊ GẠCH ỐP LÁT', 'KT-06B', pages.length + 1, TOTAL, date, size);
    heading(g, 'MẶT BẰNG LÁT GẠCH', planBox.X, M + 70, 'Gạch 800 × 800 trắng vân mây (khô) · WC, khu giặt: lát 400 × 400 xám chống trơn, ốp tường WC 800 × 400 xám');
    const wet = (room: string) => room === 'WC1' || room === 'WC2' || room === 'Lavabo';
    const P = planP;
    // room fills + tile grid from the room's corner, then the walls on top
    for (const r of d.rooms) {
      const [x0, z0, x1, z1] = map.rect(r.base.rect), T = wet(r.room) ? 0.4 : 0.8;
      const a = P(x0, z0), b = P(x1, z1), rx = Math.min(a[0], b[0]), ry = Math.min(a[1], b[1]), rw = Math.abs(b[0] - a[0]), rh = Math.abs(b[1] - a[1]);
      g.fillStyle = wet(r.room) ? '#c9cdd2' : '#f4f3f0'; g.fillRect(rx, ry, rw, rh);
      g.strokeStyle = wet(r.room) ? '#8d949b' : '#c9c3b6'; g.lineWidth = 1;
      for (let x = x0 + T; x < x1 - 0.01; x += T) { const p = P(x, z0), q = P(x, z1); g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); }
      for (let z = z0 + T; z < z1 - 0.01; z += T) { const p = P(x0, z), q = P(x1, z); g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); }
    }
    drawBase(g, false);
    for (const r of d.rooms) { const [x0, z0, x1, z1] = map.rect(r.base.rect), m = P((x0 + x1) / 2, (z0 + z1) / 2);
      g.font = `700 17px ${FONT}`; const s = r.title, tw = g.measureText(s).width + 12; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(m[0] - tw / 2, m[1] - 15, tw, 24);
      g.fillStyle = INK; g.textAlign = 'center'; g.fillText(s, m[0], m[1] + 3); g.textAlign = 'left'; }
    // quantities: floor by the laid grid (cut pieces count whole) + 3 % breakage; WC walls by area − openings + 5 %
    const lx = planBox.X + planBox.W + 50, lw = PW - M - 30 - lx; let ly = t + 40;
    const PER = { m80: 3, m40: 6, w84: 3 };                                    // tiles per box (check against the brand)
    let n80 = 0, n40 = 0, a80 = 0, a40 = 0;
    const rows = d.rooms.map(r => { const [x0, z0, x1, z1] = map.rect(r.base.rect), T = wet(r.room) ? 0.4 : 0.8, w = x1 - x0, dd = z1 - z0;
      const n = Math.ceil(w / T - 0.02) * Math.ceil(dd / T - 0.02), nw = Math.ceil(n * 1.03), A = w * dd;
      if (T > 0.5) { n80 += nw; a80 += A; } else { n40 += nw; a40 += A; }
      return [r.title, T > 0.5 ? '800×800 trắng vân mây' : '400×400 xám', `${w.toFixed(2)}×${dd.toFixed(2)}`, A.toFixed(2), String(n), String(nw)]; });
    heading(g, 'GẠCH LÁT NỀN', lx, ly);
    ly = table(g, lx, ly + 24, [{ t: 'Phòng', w: 118 }, { t: 'Loại gạch', w: 168 }, { t: 'Kích thước m', w: 112 }, { t: 'm²', w: 64, right: true }, { t: 'Viên', w: 60, right: true }, { t: '+3 %', w: 64, right: true }], rows, 27, 13) + 16;
    // WC walls: faces of WC1 (1.64 × 2.65) and WC2 (1.24 × 2.65), 2.4 high, less the doors and windows
    const HT = 2.4, wcs = [{ k: 'WC1', w: 12.46 - 10.82, d: 8.8 - 6.15 }, { k: 'WC2', w: 13.8 - 12.56, d: 8.8 - 6.15 }];
    let n84 = 0, a84 = 0;
    const wrows = wcs.map(wc => { const door = map.doors.find(dd => dd.spec.room === wc.k), win = map.windows.find(ww => ww.spec.room === wc.k);
      const open = (door && !door.hidden ? door.w * Math.min(HT, door.h) : 0) + (win && !win.hidden ? win.w * win.h : 0), A = 2 * (wc.w + wc.d) * HT - open, n = Math.ceil(A / 0.32 * 1.05);
      n84 += n; a84 += A; return [wc.k, '800×400 xám', `chu vi ${(2 * (wc.w + wc.d)).toFixed(2)} × ${HT}`, A.toFixed(2), String(Math.ceil(A / 0.32)), String(n)]; });
    heading(g, 'GẠCH ỐP TƯỜNG WC (cao 2.4 m)', lx, ly + 20);
    ly = table(g, lx, ly + 44, [{ t: 'Phòng', w: 118 }, { t: 'Loại gạch', w: 168 }, { t: 'Kích thước m', w: 112 }, { t: 'm²', w: 64, right: true }, { t: 'Viên', w: 60, right: true }, { t: '+5 %', w: 64, right: true }], wrows, 27, 13) + 16;
    heading(g, 'TỔNG HỢP ĐẶT HÀNG', lx, ly + 20);
    ly = table(g, lx, ly + 44, [{ t: 'Loại gạch', w: 250 }, { t: 'm²', w: 66, right: true }, { t: 'Viên', w: 66, right: true }, { t: 'Thùng', w: 70, right: true }, { t: 'Quy cách', w: 134 }], [
      ['Lát nền 800×800 trắng vân mây', a80.toFixed(1), String(n80), String(Math.ceil(n80 / PER.m80)), `${PER.m80} viên/thùng`],
      ['Lát nền WC 400×400 xám chống trơn', a40.toFixed(1), String(n40), String(Math.ceil(n40 / PER.m40)), `${PER.m40} viên/thùng`],
      ['Ốp tường WC 800×400 xám', a84.toFixed(1), String(n84), String(Math.ceil(n84 / PER.w84)), `${PER.w84} viên/thùng`]], 28, 13) + 20;
    noteLines(g, lx, ly + 10, lw, ['Số viên lát nền đếm theo lưới xếp từ góc phòng', '(viên cắt tính nguyên viên) + 3 % vỡ. Ron 2–3 mm;', 'nền WC dốc 1–2 % về phễu thu (KT-10B).',
      'Quy cách thùng tham khảo, kiểm tra theo hãng.', 'Chưa tính len chân tường và bậc tam cấp (granite).'], 15, 23);
    pages.push(c);
  }

  // ---------------- CT-01 main door D1, CT-02 porch column (owner's detail drawings, redrawn in black and white) ----------------
  const pline = (g: CanvasRenderingContext2D, pts: [number, number][], close = false, w = 1.6) => { g.strokeStyle = INK; g.lineWidth = w; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); if (close) g.closePath(); g.stroke(); };
  const glassH = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.strokeStyle = '#555'; g.lineWidth = 1; const st = Math.max(14, Math.min(w, h) / 2.2);
    for (let k = -h; k < w; k += st) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + h * 0.7, y); g.stroke(); } g.restore(); g.strokeStyle = INK; g.lineWidth = 1.4; g.strokeRect(x, y, w, h); };
  const secMark = (g: CanvasRenderingContext2D, x: number, y: number, n: string, dir: number) => { g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 20, 0, Math.PI * 2); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.moveTo(x - 20, y); g.lineTo(x + 20, y); g.lineTo(x, y + dir * 34); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.font = `700 18px ${FONT}`; g.textAlign = 'center'; g.fillText(n, x, y - 3 + (dir < 0 ? 18 : 0)); g.textAlign = 'left'; };
  const title2 = (g: CanvasRenderingContext2D, s: string, x: number, y: number) => { g.fillStyle = INK; g.font = `800 28px ${FONT}`; g.textAlign = 'center'; g.fillText(s, x, y); const w = g.measureText(s).width; g.fillRect(x - w / 2, y + 8, w, 2.5); g.textAlign = 'left'; };
  const gray = (g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => { const r = Math.min(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r;
    g.filter = 'grayscale(1) contrast(1.15)'; g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); g.filter = 'none'; g.strokeStyle = LINE; g.lineWidth = 1; g.strokeRect(x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); return y + (h + ih) / 2; };
  {
    const { c, g, top: t } = page('CHI TIẾT CỬA ĐI D1', 'CT-01', pages.length + 1, TOTAL, date, size);
    // header
    const hx = M + 40, hw = PW - 2 * M - 80, hy = t + 4;
    g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(hx, hy, hw, 150); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(hx + 200, hy); g.lineTo(hx + 200, hy + 150); g.moveTo(hx + 200, hy + 40); g.lineTo(hx + hw, hy + 40); g.moveTo(hx + 200, hy + 76); g.lineTo(hx + hw, hy + 76); g.stroke();
    g.fillStyle = INK; g.font = `700 24px ${FONT}`; g.fillText('CỬA D1', hx + 50, hy + 84); g.font = `500 19px ${FONT}`;
    g.fillText('KÍCH THƯỚC: 3000 (R) × 2900 (C) MM', hx + 230, hy + 28); g.fillText('THÔNG THUỶ: 2100 (R) × 2400 (C) MM', hx + 1100, hy + 28); g.fillText('SỐ LƯỢNG: 01 BỘ', hx + 230, hy + 64);
    g.fillText('VẬT LIỆU:   – Cửa gỗ (óc chó)', hx + 230, hy + 104); g.fillText('– Kính an toàn 8.38 mm', hx + 352, hy + 132);
    g.fillText('CHÚ Ý:  – Hướng cửa mở theo thiết kế trên mặt bằng', hx + 1100, hy + 104); g.fillText('– Đo lại kích thước thực tế trước khi thi công', hx + 1176, hy + 132);
    // elevation, 1 mm = k px, y up from the threshold
    const k = 0.3, X0 = M + 170, Yb = hy + 210 + 2900 * k + 40, E = (x: number, y: number): [number, number] => [X0 + x * k, Yb - y * k];
    const R = (x0: number, y0: number, x1: number, y1: number, w = 1.6) => { const a = E(x0, y1), b = E(x1, y0); g.strokeStyle = INK; g.lineWidth = w; g.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); };
    const G = (x0: number, y0: number, x1: number, y1: number) => { const a = E(x0, y1), b = E(x1, y0); glassH(g, a[0], a[1], b[0] - a[0], b[1] - a[1]); };
    const P2 = (x0: number, y0: number, x1: number, y1: number) => { R(x0, y0, x1, y1, 1.8); R(x0 + 18, y0 + 18, x1 - 18, y1 - 18, 1); };   // raised panel (2 lines)
    R(0, 0, 3000, 2900, 2.6);
    for (const [x0, x1] of [[0, 450], [2550, 3000]]) { R(x0, 2400, x1, 2900); R(x0 + 85, 2485, x1 - 85, 2815); G(x0 + 130, 2530, x1 - 130, 2770);
      R(x0, 0, x1, 2400); R(x0 + 85, 85, x1 - 85, 2315);
      for (const [y0, y1] of [[2010, 2315], [1200, 1925], [440, 1160], [80, 355]]) G(x0 + 130, y0 + 20, x1 - 130, y1 - 20); }
    R(450, 2400, 2550, 2900); R(535, 2485, 2465, 2815); G(550, 2530, 2450, 2770);
    for (const s of [1, -1]) {   // the two leaves, mirrored about x = 1500
      const X = (v: number) => 1500 + s * (v - 1500), Rx = (a: number, y0: number, b: number, y1: number, f: (x0: number, y0: number, x1: number, y1: number) => void) => f(Math.min(X(a), X(b)), y0, Math.max(X(a), X(b)), y1);
      Rx(450, 0, 1500, 2400, R);
      for (const [y0, y1] of [[2010, 2315], [80, 355]]) { Rx(550, y0, 1080, y1, P2); Rx(1180, y0, 1400, y1, P2); }
      for (const [y0, y1] of [[1200, 1925], [440, 1160]]) Rx(550, y0, 1400, y1, P2);
      for (const y of [400, 1200, 2000]) { const a = E(X(450), y + 60); g.fillStyle = INK; g.fillRect(a[0] - 3, a[1], 6, 120 * k); }
    }
    // the carved sun (half on each leaf) and the handles
    { const [cx, cy] = E(1500, 1180); g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 430 * k, 0, Math.PI * 2); g.fill();
      g.strokeStyle = INK; for (const [r, w] of [[430, 1.8], [400, 1], [300, 1.4], [90, 1.4]] as [number, number][]) { g.lineWidth = w; g.beginPath(); g.arc(cx, cy, r * k, 0, Math.PI * 2); g.stroke(); }
      g.lineWidth = 1; for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * 90 * k, cy + Math.sin(a) * 90 * k); g.lineTo(cx + Math.cos(a) * 295 * k, cy + Math.sin(a) * 295 * k); g.stroke(); }
      g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy - 430 * k); g.lineTo(cx, cy + 430 * k); g.stroke();
      for (const s of [-1, 1]) { g.fillStyle = '#fff'; g.beginPath(); g.roundRect(cx + s * 9 - 5, cy - 50 * k * 2, 10, 200 * k, 4); g.fill(); g.stroke(); } }
    g.setLineDash([10, 7]); g.strokeStyle = SOFT; g.lineWidth = 1.2; pline(g, [E(1500, 2400), E(450, 1200), E(1500, 0)]); pline(g, [E(1500, 2400), E(2550, 1200), E(1500, 0)]); g.setLineDash([]);
    // dimensions
    const chainX = (xs: number[], y: number, off: number) => { for (let i = 0; i + 1 < xs.length; i++) dimLine(g, E(xs[i], y), E(xs[i + 1], y), String(xs[i + 1] - xs[i]), [0, off]); };
    const chainY = (ys: number[], x: number, off: number) => { for (let i = 0; i + 1 < ys.length; i++) dimLine(g, E(x, ys[i]), E(x, ys[i + 1]), String(ys[i + 1] - ys[i]), [off, 0]); };
    chainX([0, 450, 2550, 3000], 2900, -40); chainX([0, 3000], 2900, -80);
    chainX([0, 85, 365, 450, 550, 1080, 1180, 1400, 1500, 1600, 1820, 1920, 2450, 2550, 2635, 2915, 3000], 0, 36); chainX([0, 450, 1500, 2550, 3000], 0, 76); chainX([0, 3000], 0, 116);
    chainY([0, 80, 355, 440, 1180, 1925, 2010, 2315, 2400, 2900], 3000, 46); chainY([0, 2400, 2900], 3000, 96); chainY([0, 2900], 3000, 140);
    chainY([0, 2400, 2900], 0, -50); chainY([0, 2900], 0, -94);
    secMark(g, E(1500, 2900)[0], E(1500, 2900)[1] - 140, '2', 1); secMark(g, E(-150, 1300)[0] - 80, E(-150, 1300)[1], '1', 1);
    title2(g, 'MẶT ĐỨNG CỬA ĐI D1', E(1500, 0)[0], E(1500, 0)[1] + 175);
    // plan section (1-1) under it
    { const yS = E(0, 0)[1] + 250, kd = 0.45, Pp = (x: number, d: number): [number, number] => [X0 + x * k, yS + d * kd];
      for (const [a, b] of [[-260, 0], [3000, 3260]]) { const p = Pp(a, -60), q = Pp(b, 160); hatch(g, p[0], p[1], q[0] - p[0], q[1] - p[1], 8); g.strokeStyle = INK; g.lineWidth = 1.8; g.strokeRect(p[0], p[1], q[0] - p[0], q[1] - p[1]); }
      const box2 = (x0: number, d0: number, x1: number, d1: number, w = 1.5) => { const p = Pp(x0, d0), q = Pp(x1, d1); g.strokeStyle = INK; g.lineWidth = w; g.strokeRect(p[0], p[1], q[0] - p[0], q[1] - p[1]); };
      box2(0, 0, 80, 100, 2); box2(2920, 0, 3000, 100, 2); box2(450, 0, 530, 100, 1.8); box2(2470, 0, 2550, 100, 1.8);
      for (const [a, b] of [[80, 450], [2550, 2920]]) { g.lineWidth = 3; pline(g, [Pp(a, 50), Pp(b, 50)], false, 3); }
      for (const [a, b] of [[530, 1500], [1500, 2470]]) { box2(a, 25, b, 75); for (let x = a + 100; x < b - 100; x += 260) box2(x, 15, Math.min(b - 100, x + 200), 85, 1); }
      g.fillStyle = INK; g.font = `700 18px ${FONT}`; g.fillText('BÊN TRONG', Pp(3300, 0)[0], Pp(0, -20)[1]); g.fillText('BÊN NGOÀI', Pp(3300, 0)[0], Pp(0, 150)[1]);
      for (const [xs, off] of [[[0, 80, 450, 2550, 2920, 3000], -40], [[0, 3000], -80]] as [number[], number][]) for (let i = 0; i + 1 < xs.length; i++) dimLine(g, Pp(xs[i], 0), Pp(xs[i + 1], 0), String(xs[i + 1] - xs[i]), [0, off]);
      title2(g, 'MẶT CẮT 1-1 (MẶT BẰNG CỬA)', Pp(1500, 0)[0], Pp(0, 160)[1] + 80); }
    // vertical section 2-2 (depth drawn 1 : 1 px per mm for legibility)
    { const sx = X0 + 3000 * k + 300, kd = 0.9, S = (d: number, y: number): [number, number] => [sx + d * kd, Yb - y * k];
      const a = S(-60, 3150), b = S(160, 2900); hatch(g, a[0], a[1], b[0] - a[0], b[1] - a[1], 8); g.strokeStyle = INK; g.lineWidth = 1.8; g.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      const bx = (d0: number, y0: number, d1: number, y1: number, w = 1.5) => { const p = S(d0, y1), q = S(d1, y0); g.strokeStyle = INK; g.lineWidth = w; g.strokeRect(p[0], p[1], q[0] - p[0], q[1] - p[1]); };
      bx(0, 2815, 100, 2900, 2); bx(0, 2400, 100, 2485, 2); g.fillStyle = INK; { const p = S(44, 2815), q = S(56, 2485); g.fillRect(p[0], p[1], q[0] - p[0], q[1] - p[1]); }
      bx(25, 0, 75, 2400, 1.8); for (const [y0, y1] of [[2010, 2315], [1200, 1925], [440, 1160], [80, 355]]) bx(35, y0, 65, y1, 1);
      g.font = `600 17px ${FONT}`; callout(g, ...S(50, 260), S(-160, 200)[0], S(0, 200)[1], 'PANO GỖ DÀY 30MM', '');
      g.font = `700 18px ${FONT}`; g.fillStyle = INK; g.fillText('BÊN NGOÀI', S(-120, 0)[0] - 40, S(0, -200)[1]); g.fillText('BÊN TRONG', S(140, 0)[0], S(0, -200)[1]);
      for (const [ys, off] of [[[0, 80, 355, 440, 1180, 1925, 2010, 2315, 2400, 2485, 2815, 2900], 70], [[0, 2400, 2900], 120], [[0, 2900], 165]] as [number[], number][])
        for (let i = 0; i + 1 < ys.length; i++) dimLine(g, S(100, ys[i]), S(100, ys[i + 1]), String(ys[i + 1] - ys[i]), [off, 0]);
      title2(g, 'MẶT CẮT 2-2', S(50, 0)[0], S(0, 0)[1] + 175); }
    // perspective from the model (grayscale)
    { const px = PW - M - 40 - 640, py = hy + 220; const yb2 = gray(g, renders.doorD1, px, py, 640, 900); title2(g, 'PHỐI CẢNH CỬA ĐI D1', px + 320, yb2 + 50); }
    pages.push(c);
  }
  {
    const { c, g, top: t } = page('CHI TIẾT CỘT HIÊN', 'CT-02', pages.length + 1, TOTAL, date, size);
    heading(g, 'CHI TIẾT CỘT HIÊN (CỘT SẢNH)', M + 60, M + 70, 'Lõi BTCT 220 × 220, xây bao + đắp phào vữa · kích thước mm');
    // profile: [y0, y1, width] bottom → top
    const L2: [number, number, number][] = [[0, 60, 700], [60, 150, 660], [150, 680, 580], [680, 730, 640], [730, 800, 620], [800, 850, 540], [850, 2620, 480], [2620, 2650, 540], [2650, 2750, 480], [2750, 2780, 540], [2780, 2860, 600], [2860, 2900, 640]];
    const k = 0.42, top0 = t + 160, Yb = top0 + 2900 * k;
    const outline = (cx: number) => { const pts: [number, number][] = []; for (const [y0, y1, w] of L2) { pts.push([cx + w / 2 * k, Yb - y0 * k], [cx + w / 2 * k, Yb - y1 * k]); }
      const back = pts.map(([x, y]) => [2 * cx - x, y] as [number, number]).reverse(); return [...pts, ...back]; };
    // elevation
    const ex = M + 330;
    { const o = outline(ex); g.fillStyle = '#fff'; g.beginPath(); o.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.closePath(); g.fill(); pline(g, o, true, 2.2);
      for (const [y0, , w] of L2.slice(1)) pline(g, [[ex - w / 2 * k, Yb - y0 * k], [ex + w / 2 * k, Yb - y0 * k]], false, 1.2);
      for (const u of [-135, 0, 135]) { g.strokeStyle = INK; g.lineWidth = 1.3; g.strokeRect(ex + (u - 25) * k, Yb - 2470 * k, 50 * k, 1520 * k); }
      g.strokeRect(ex - 160 * k, Yb - 580 * k, 320 * k, 330 * k);
      const dimV = (ys: number[], x: number, off: number) => { for (let i = 0; i + 1 < ys.length; i++) dimLine(g, [x, Yb - ys[i] * k], [x, Yb - ys[i + 1] * k], String(ys[i + 1] - ys[i]), [off, 0]); };
      dimV([0, 800, 2620, 2900], ex - 350 * k, -40); dimV([0, 2900], ex - 350 * k, -85);
      dimV([0, 150, 680, 800, 950, 2470, 2620, 2900], ex + 350 * k, 40); dimV([0, 2900], ex + 350 * k, 85);
      dimLine(g, [ex - 350 * k, Yb], [ex + 350 * k, Yb], '700', [0, 40]); dimLine(g, [ex - 320 * k, Yb - 2900 * k], [ex + 320 * k, Yb - 2900 * k], '640', [0, -30]);
      dimLine(g, [ex - 240 * k, Yb - 1700 * k], [ex + 240 * k, Yb - 1700 * k], '480', [0, 0]);
      g.font = `500 16px ${FONT}`; callout(g, ex + 135 * k, Yb - 1300 * k, ex + 420 * k, Yb - 1380 * k, 'LÕM 30MM SO VỚI CỘT', '');
      callout(g, ex + 300 * k, Yb - 2820 * k, ex + 420 * k, Yb - 3000 * k, 'CHI TIẾT 01', ''); callout(g, ex + 320 * k, Yb - 760 * k, ex + 420 * k, Yb - 980 * k, 'CHI TIẾT 02', '');
      title2(g, 'MẶT ĐỨNG', ex, Yb + 110); }
    // section 1-1
    const sx = M + 830;
    { const o = outline(sx); g.save(); g.beginPath(); o.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.closePath(); g.clip(); hatch(g, sx - 360 * k, Yb - 2900 * k, 720 * k, 2900 * k, 9); g.restore(); pline(g, o, true, 2.2);
      dots(g, sx - 110 * k, Yb - 2900 * k, 220 * k, 2900 * k);
      dimLine(g, [sx - 350 * k, Yb], [sx - 110 * k, Yb], '240', [0, 40]); dimLine(g, [sx - 110 * k, Yb], [sx + 110 * k, Yb], '220', [0, 40]); dimLine(g, [sx + 110 * k, Yb], [sx + 350 * k, Yb], '240', [0, 40]); dimLine(g, [sx - 350 * k, Yb], [sx + 350 * k, Yb], '700', [0, 80]);
      dimLine(g, [sx - 240 * k, Yb - 1700 * k], [sx - 110 * k, Yb - 1700 * k], '130', [0, 0]); dimLine(g, [sx + 110 * k, Yb - 1700 * k], [sx + 240 * k, Yb - 1700 * k], '130', [0, 0]);
      dimLine(g, [sx - 320 * k, Yb - 2900 * k], [sx + 320 * k, Yb - 2900 * k], '640', [0, -30]);
      g.font = `500 16px ${FONT}`; callout(g, sx, Yb - 2200 * k, sx + 420 * k, Yb - 2300 * k, 'LÕI BTCT 220×220, 4Ø16', ''); callout(g, sx - 200 * k, Yb - 400 * k, sx - 440 * k, Yb - 260 * k, 'XÂY GẠCH + TRÁT, ĐẮP PHÀO', '');
      title2(g, 'MẶT CẮT 1-1', sx, Yb + 110); }
    // details 01 (capital) and 02 (base cap), enlarged
    const detail = (x0: number, y0: number, ya: number, yb: number, title: string) => { const kk = 1.5, prof: [number, number][] = [];
      for (const [a, b, w] of L2) { if (b <= ya || a >= yb) continue; const lo = Math.max(a, ya), hi = Math.min(b, yb); prof.push([x0 + (w / 2 - 240) * kk + 120, y0 + (yb - lo) * kk], [x0 + (w / 2 - 240) * kk + 120, y0 + (yb - hi) * kk]); }
      g.setLineDash([8, 6]); g.strokeStyle = SOFT; g.lineWidth = 1.2; g.strokeRect(x0, y0 - 20, 300, (yb - ya) * kk + 40); g.setLineDash([]);
      pline(g, [[x0 + 20, y0 + (yb - ya) * kk], ...prof, [x0 + 20, y0]], false, 2.2);
      let last = -1; for (const [a, b, w] of L2) { if (b <= ya || a >= yb) continue; const ym = y0 + (yb - Math.min(b, yb)) * kk, ylo = y0 + (yb - Math.max(a, ya)) * kk;
        dimLine(g, [x0 + 300, ym], [x0 + 300, ylo], String(Math.min(b, yb) - Math.max(a, ya)), [36, 0]); if (last >= 0 && w !== last) { g.fillStyle = INK; g.font = `500 14px ${FONT}`; g.fillText(String(Math.abs(w - last) / 2), x0 + (w / 2 - 240) * kk + 126, ylo - 4); } last = w; }
      title2(g, title, x0 + 150, y0 + (yb - ya) * kk + 90); };
    detail(M + 1180, t + 160, 2620, 2900, 'CHI TIẾT 01'); detail(M + 1180, t + 760, 680, 850, 'CHI TIẾT 02');
    // plan 2-2
    { const kk = 0.55, cx = M + 1820, cy = t + 1130, Q = (x: number, y: number): [number, number] => [cx + x * kk, cy + y * kk];
      for (const h of [350, 340, 290]) { const a = Q(-h, -h); g.strokeStyle = INK; g.lineWidth = h === 350 ? 2 : 1.2; g.strokeRect(a[0], a[1], 2 * h * kk, 2 * h * kk); }
      { const a = Q(-240, -240); hatch(g, a[0], a[1], 480 * kk, 480 * kk, 9); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(a[0], a[1], 480 * kk, 480 * kk); }
      g.fillStyle = '#fff'; for (const u of [-135, 0, 135]) for (const [px, py, w, h] of [[u - 25, -240, 50, 30], [u - 25, 210, 50, 30], [-240, u - 25, 30, 50], [210, u - 25, 30, 50]]) { const a = Q(px, py); g.fillRect(a[0], a[1], w * kk, h * kk); g.strokeRect(a[0], a[1], w * kk, h * kk); }
      { const a = Q(-110, -110); dots(g, a[0], a[1], 220 * kk, 220 * kk); }
      dimLine(g, Q(-350, 350), Q(-240, 350), '110', [0, 40]); dimLine(g, Q(-240, 350), Q(240, 350), '480', [0, 40]); dimLine(g, Q(240, 350), Q(350, 350), '110', [0, 40]); dimLine(g, Q(-350, 350), Q(350, 350), '700', [0, 80]);
      dimLine(g, Q(350, -350), Q(350, 350), '700', [50, 0]); dimLine(g, Q(-110, -350), Q(110, -350), '220', [0, -30]);
      title2(g, 'MẶT CẮT 2-2', cx, Q(0, 350)[1] + 140); }
    { const px = PW - M - 40 - 440, py = t + 140; const yb2 = gray(g, renders.colP, px, py, 440, 760); title2(g, 'PHỐI CẢNH CỘT', px + 220, yb2 + 50); }
    pages.push(c);
  }

  // ---------------- KT-07 furniture ----------------
  {
    const { c, g, top: t } = page('THỐNG KÊ NỘI THẤT', 'KT-07', pages.length + 1, TOTAL, date, size);
    heading(g, 'THỐNG KÊ NỘI THẤT & THIẾT BỊ', M + 60, t + 40, 'Kích thước bao: rộng (theo trục Đông–Tây) × sâu × cao, mm');
    const rows = [...d.objects].sort((a, b) => a.room.localeCompare(b.room, 'vi')).map((o, i) => [String(i + 1), o.label, o.room, `${mm(o.size[0])} × ${mm(o.size[1])} × ${mm(o.size[2])}`]);
    const half = Math.ceil(rows.length / 2), cols = [{ t: 'TT', w: 70 }, { t: 'Tên', w: 470 }, { t: 'Phòng', w: 250 }, { t: 'Kích thước (mm)', w: 330 }];
    table(g, M + 60, t + 110, cols, rows.slice(0, half), 38, 19);
    table(g, M + 60 + 1150, t + 110, cols, rows.slice(half), 38, 19);
    pages.push(c);
  }

  // ---------------- KT-08 electrical plan ----------------
  const SYM_COL: Record<ElecKind, string> = { switch2: '#c0392b', switch1: '#c0392b', heaterSw: '#c0392b', socket: '#2f6fb3', data: '#7d3c98', ac: '#16a085', tv: '#1d2430', heater: '#d35400', camera: '#7d3c98', panel: '#1d2430', wifi: '#7d3c98', fanCtl: '#c0392b', acOut: '#16a085' };
  type FixK = 'down' | 'spot' | 'ceiling' | 'pendant' | 'fan' | 'porch' | 'sconce' | 'eave';
  const symbol = (g: CanvasRenderingContext2D, kind: ElecKind | FixK, x: number, y: number, ang = 0, s = 1) => {
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s); g.lineWidth = 2.2;
    const col = kind in SYM_COL ? SYM_COL[kind as ElecKind] : '#b7950b';
    g.strokeStyle = col; g.fillStyle = '#fff';
    if (kind === 'down' || kind === 'eave') { const r = kind === 'eave' ? 7 : 9; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fillStyle = col; g.fill(); }
    else if (kind === 'spot') { g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(-11, 0); g.lineTo(11, 0); g.moveTo(0, -11); g.lineTo(0, 11); g.stroke(); }
    else if (kind === 'porch') { g.beginPath(); g.arc(0, 0, 17, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fillStyle = col; g.fill(); }
    else if (kind === 'sconce') { g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-7, -7); g.lineTo(7, 7); g.moveTo(7, -7); g.lineTo(-7, 7); g.stroke(); }
    else if (kind === 'ceiling') { g.beginPath(); g.arc(0, 0, 17, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-12, -12); g.lineTo(12, 12); g.moveTo(12, -12); g.lineTo(-12, 12); g.stroke(); }
    else if (kind === 'fan') { g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2); g.fill(); g.stroke(); for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; g.save(); g.rotate(a); g.beginPath(); g.ellipse(19, 0, 12, 5, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore(); } }
    else if (kind === 'fanCtl') { g.fillStyle = col; g.fillRect(-9, -9, 18, 18); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill(); }
    else if (kind === 'pendant') { g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill(); }
    else if (kind === 'switch1') { g.fillStyle = col; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(0, 0); g.lineTo(14, -16); g.lineTo(20, -11); g.stroke(); }
    else if (kind === 'switch2' || kind === 'heaterSw') { g.fillStyle = col; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(0, 0); g.lineTo(14, -16); g.lineTo(20, -11); g.moveTo(0, 0); g.lineTo(-14, -16); g.lineTo(-20, -11); g.stroke();
      if (kind === 'heaterSw') { g.font = `700 14px ${FONT}`; g.fillText('NL', 12, 16); } }
    else if (kind === 'socket') { g.fillStyle = col; g.beginPath(); g.arc(0, 0, 11, Math.PI, 0); g.closePath(); g.fill(); g.beginPath(); g.moveTo(-7, -11); g.lineTo(-7, -19); g.moveTo(7, -11); g.lineTo(7, -19); g.stroke(); }
    else if (kind === 'data') { g.fillStyle = col; g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.lineTo(0, -15); g.closePath(); g.fill(); }
    else if (kind === 'ac') { g.fillRect(-34, -16, 68, 16); g.strokeRect(-34, -16, 68, 16); g.fillStyle = col; g.font = `700 13px ${FONT}`; g.textAlign = 'center'; g.fillText('ĐH', 0, -3); }
    else if (kind === 'acOut') { g.fillRect(-26, -26, 52, 26); g.strokeRect(-26, -26, 52, 26); g.beginPath(); g.arc(-6, -13, 9, 0, Math.PI * 2); g.stroke(); g.fillStyle = col; g.font = `700 11px ${FONT}`; g.textAlign = 'center'; g.fillText('DN', 14, -9); }
    else if (kind === 'tv') { g.fillStyle = col; g.fillRect(-30, -8, 60, 8); }
    else if (kind === 'heater') { g.beginPath(); g.roundRect(-30, -22, 60, 22, 10); g.fill(); g.stroke(); g.fillStyle = col; g.font = `700 13px ${FONT}`; g.textAlign = 'center'; g.fillText('NL', 0, -6); }
    else if (kind === 'wifi') { g.fillStyle = col; g.beginPath(); g.arc(0, -4, 4, 0, Math.PI * 2); g.fill(); g.strokeStyle = col; for (const r of [10, 17]) { g.beginPath(); g.arc(0, -4, r, -Math.PI * 0.8, -Math.PI * 0.2); g.stroke(); } }
    else if (kind === 'camera') { g.fillStyle = col; g.fillRect(-12, -18, 24, 14); g.beginPath(); g.moveTo(12, -11); g.lineTo(22, -18); g.lineTo(22, -4); g.closePath(); g.fill(); }
    else if (kind === 'panel') { g.fillStyle = col; g.fillRect(-20, -14, 40, 14); g.fillStyle = '#fff'; g.font = `700 11px ${FONT}`; g.textAlign = 'center'; g.fillText('TĐ', 0, -3); }
    g.restore();
  };
  // KT-08 lighting plan (fixtures, 2-way switches, travellers, fixture runs) and KT-08B power plan (sockets, data,
  // ACs with outdoor units and pipes, TVs, water heaters, camera, panel): same plan base, different layers
  const LIGHT_KINDS = new Set<ElecKind>(['switch2', 'switch1', 'fanCtl']);
  // light groups in drawing order: rooms as listed, then the bedside / outdoor groups; fans numbered on their own
  const grpCode = new Map<string, number>(), fanCode = new Map<string, number>();
  for (const f of d.fixtures) { if (f.kind === 'fan') { if (!fanCode.has(f.room)) fanCode.set(f.room, fanCode.size + 1); } else if (!grpCode.has(f.room)) grpCode.set(f.room, grpCode.size + 1); }
  const swCode = (e: typeof ELEC[number]) => { const lamp = e.lamp ?? e.room, n = grpCode.get(lamp); if (e.kind === 'fanCtl') return `HS${fanCode.get(e.room) ?? ''}`;
    const pair = ELEC.filter(x => (x.kind === 'switch2' || x.kind === 'switch1') && (x.lamp ?? x.room) === lamp); return `K${n ?? '?'}${pair.length > 1 ? '.' + (pair.indexOf(e) + 1) : ''}`; };
  for (const mode of ['light', 'power'] as const) {
    const isL = mode === 'light';
    const { c, g } = page(isL ? 'MẶT BẰNG CHIẾU SÁNG' : 'MẶT BẰNG Ổ CẮM & ĐIỀU HOÀ', isL ? 'KT-08' : 'KT-08B', pages.length + 1, TOTAL, date, size);
    heading(g, isL ? 'SƠ ĐỒ ĐÈN — ĐÈN, CÔNG TẮC 2 CHIỀU, DÂY ĐẢO, DÂY RA ĐÈN' : 'SƠ ĐỒ ĐIỆN — Ổ CẮM, ĐIỀU HOÀ, NÓNG LẠNH, TIVI, CAMERA, TỦ ĐIỆN', planBox.X, M + 70,
      isL ? 'Đn: nhóm đèn · Kn: công tắc nhóm n (Kn.1/.2: cặp 2 chiều) · H: cao lắp từ nền, L: cách góc tường gần nhất dọc tường (mm) · định vị đèn: KT-08C' : 'H: độ cao lắp tính từ nền ±0.000 · L: khoảng cách dọc tường tới góc phòng gần nhất (mm) · mạch xem KT-09');
    g.globalAlpha = 0.25; g.drawImage(renders.plan, pf.X, pf.Y, pf.W, pf.H); g.globalAlpha = 1;
    drawBase(g, false);
    const P = planP;
    const at = (e: typeof ELEC[number]) => { const v = DIRV[e.n], X = map.mx(e.x) + v[0] * 0.16, Z = map.mz(e.z) + v[1] * 0.16; return P(X, Z); };
    const items = ELEC.filter(e => isL ? LIGHT_KINDS.has(e.kind) : !LIGHT_KINDS.has(e.kind));
    /** distance along its wall from a fitting to the nearer corner of the room it is in (default plan coords) */
    const alongL = (e: typeof ELEC[number]) => { for (const r of d.rooms) { const [x0, z0, x1, z1] = r.base.rect;
        const on = e.n === '+x' ? Math.abs(e.x - x0) < 0.16 : e.n === '-x' ? Math.abs(e.x - x1) < 0.16 : e.n === '+z' ? Math.abs(e.z - z0) < 0.16 : Math.abs(e.z - z1) < 0.16;
        const a = e.n[1] === 'x' ? e.z : e.x, [a0, a1] = e.n[1] === 'x' ? [z0, z1] : [x0, x1];
        if (on && a >= a0 - 0.05 && a <= a1 + 0.05) return Math.max(0, Math.min(a - a0, a1 - a)); } return null; };
    if (isL) {
      // fixture runs: from the room's main light, nearest-neighbour through the room's fixtures (dashed yellow)
      g.setLineDash([6, 6]); g.lineWidth = 1.6; g.strokeStyle = 'rgba(183,149,11,.8)';
      for (const room of new Set(d.fixtures.map(f => f.room))) {
        const fs = d.fixtures.filter(f => f.room === room && f.kind !== 'fan'); if (fs.length < 2) continue;
        const start = fs.find(f => f.kind === 'ceiling') ?? fs[0], left = fs.filter(f => f !== start); let cur = start;
        while (left.length) { left.sort((a, b) => Math.hypot(a.x - cur.x, a.z - cur.z) - Math.hypot(b.x - cur.x, b.z - cur.z)); const nx = left.shift()!;
          g.beginPath(); g.moveTo(...P(cur.x, cur.z)); g.lineTo(...P(nx.x, nx.z)); g.stroke(); cur = nx; }
      }
      // 2-way wiring: traveller between the two switches (red), switch to the room's main light (yellow)
      const roomLight = (room: string) => d.fixtures.find(f => f.room === room && f.kind === 'ceiling') ?? d.fixtures.find(f => f.room === room && f.kind !== 'fan');
      g.setLineDash([10, 7]); g.lineWidth = 2;
      const isSw = (e: typeof ELEC[number]) => e.kind === 'switch2' || e.kind === 'switch1', lampOf = (e: typeof ELEC[number]) => e.lamp ?? e.room;
      for (const room of new Set(ELEC.filter(isSw).map(lampOf))) {
        const sw = ELEC.filter(e => isSw(e) && lampOf(e) === room), lt = roomLight(room);
        if (sw.length === 2) { const a = at(sw[0]), b = at(sw[1]); g.strokeStyle = 'rgba(192,57,43,.8)'; g.beginPath(); g.moveTo(...a); g.quadraticCurveTo((a[0] + b[0]) / 2 + 30, (a[1] + b[1]) / 2 - 30, ...b); g.stroke(); }
        if (lt) { const a = at(sw[0]), b = P(lt.x, lt.z); g.strokeStyle = 'rgba(183,149,11,.9)'; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
      }
      // fan speed controller to its ceiling fan (red dashes)
      g.strokeStyle = 'rgba(192,57,43,.8)';
      for (const fc of ELEC.filter(e => e.kind === 'fanCtl')) { const f = d.fixtures.find(x => x.kind === 'fan' && x.room === fc.room); if (!f) continue;
        const a = at(fc), b = P(f.x, f.z); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
      g.setLineDash([]);
      for (const f of d.fixtures) { const [x, y] = P(f.x, f.z); symbol(g, f.kind, x, y); }
      // codes (owner's request): every light carries its group Đn, every switch Kn (Kn.1 / Kn.2 for a 2-way pair),
      // the fans Qn with their speed controllers HSn
      g.font = `700 12px ${FONT}`;
      for (const f of d.fixtures) { const [x, y] = P(f.x, f.z), s2 = f.kind === 'fan' ? `Q${fanCode.get(f.room)}` : `Đ${grpCode.get(f.room) ?? '?'}`, r2 = f.kind === 'fan' ? 26 : f.kind === 'porch' ? 18 : 12;
        const tw = g.measureText(s2).width + 6; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(x + r2 - 2, y - r2 - 12, tw, 15); g.fillStyle = '#8a6d00'; g.fillText(s2, x + r2 + 1, y - r2); }
    } else {
      // refrigerant pipe from each indoor unit to its outdoor unit (same circuit)
      g.strokeStyle = 'rgba(22,160,133,.85)'; g.lineWidth = 2.6; g.setLineDash([4, 5]);
      for (const o of ELEC.filter(e => e.kind === 'acOut')) { const i = ELEC.find(e => e.kind === 'ac' && e.circuit === o.circuit); if (!i) continue; const a = at(i), b = at(o); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
      g.setLineDash([]);
    }
    // fittings, rotated so they sit against their wall
    for (const e of items) {
      const v = DIRV[e.n], [x0, y0] = P(map.mx(e.x), map.mz(e.z)), [x1, y1] = P(map.mx(e.x) + v[0], map.mz(e.z) + v[1]);
      const ang = Math.atan2(x1 - x0, -(y1 - y0)); // symbol's "up" (-y) points into the room
      const [sx, sy] = at(e); symbol(g, e.kind, sx, sy, ang, e.kind === 'ac' || e.kind === 'acOut' || e.kind === 'tv' || e.kind === 'heater' ? 1 : 0.95);
      {// code (switches) + H mounting height + L distance along the wall to the nearest room corner (owner's request)
        const L = alongL(e), lab = `${isL && e.kind !== 'socket' ? swCode(e) + ' ' : ''}H${mm(e.y)}${L !== null ? ' L' + mm(L) : ''}`;
        g.font = `700 12px ${FONT}`; const tw = g.measureText(lab).width + 8, f = e.kind === 'ac' || e.kind === 'acOut' || e.kind === 'tv' || e.kind === 'heater' ? 0.55 : 0.5, tx = sx + (x1 - x0) * f, ty = sy + (y1 - y0) * f;
        g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(tx - tw / 2, ty - 10, tw, 15); g.fillStyle = isL ? '#a93226' : '#30485e'; g.textAlign = 'center'; g.fillText(lab, tx, ty + 2); g.textAlign = 'left';
      }
    }
    // legend
    const lx = planBox.X + planBox.W + 70; let ly = M + 150;
    northArrow(g, lx + 40, ly + 40); ly += 120; heading(g, 'KÝ HIỆU', lx, ly); ly += 20;
    const count = (k: ElecKind) => ELEC.filter(e => e.kind === k).length;
    const nfx = (k: string) => d.fixtures.filter(f => f.kind === k).length;
    const rows: [ElecKind | FixK, string, number][] = isL ? [
      ['spot', 'Đèn spotlight âm trần Φ90 (4 góc phòng ngủ)', nfx('spot')], ['down', 'Đèn downlight âm trần Φ75', nfx('down')],
      ['porch', 'Đèn ốp trần hiên (bóng to giữa hiên)', nfx('porch')], ['sconce', 'Đèn hắt tường ngoài nhà', nfx('sconce')], ['eave', 'Downlight âm trần mái đua Φ75', nfx('eave')],
      ['fan', 'Quạt trần (phòng khách, bàn ăn)', nfx('fan')], ['fanCtl', 'Hộp số quạt trần (cao 1.25)', count('fanCtl')], ['switch2', 'Công tắc 2 chiều (cao 1.25 / tab đầu giường 0.6)', count('switch2')], ['switch1', 'Công tắc 1 chiều (cao 1.25 / tab đầu giường 0.6)', count('switch1')]
    ] : [
      ['socket', 'Ổ cắm đôi 3 chấu (cao 0.4 trừ ghi chú)', count('socket')], ['data', 'Ổ mạng LAN + truyền hình', count('data')], ['ac', 'Điều hoà treo tường (cao 2.85)', count('ac')], ['acOut', 'Cục nóng ngoài tường (giá đỡ, cao 2.3)', count('acOut')],
      ['tv', 'Tivi treo tường', count('tv')], ['heater', 'Bình nóng lạnh 50 L dùng chung (cao 2.05)', count('heater')], ['heaterSw', 'Công tắc 2 cực nóng lạnh', count('heaterSw')],
      ['camera', 'Camera an ninh', count('camera')], ['wifi', 'Wifi: củ tổng trên nóc tủ rượu, bộ phát hành lang (cao 2.4)', count('wifi')], ['panel', 'Tủ điện tổng + aptomat tổng 63A', count('panel')],
    ];
    for (const [k, t, n] of rows) { ly += isL ? 36 : 44; symbol(g, k, lx + 26, ly + (['down', 'spot', 'ceiling', 'pendant', 'fan', 'porch', 'sconce', 'eave'].includes(k) ? -6 : 6), 0, isL ? 0.85 : 1); g.fillStyle = INK; g.font = `400 19px ${FONT}`; g.fillText(t, lx + 70, ly, 460); g.font = `700 19px ${FONT}`; g.textAlign = 'right'; g.fillText(String(n), lx + 590, ly); g.textAlign = 'left'; }
    ly += 50; g.lineWidth = 2;
    const lineKey = (col: string, dash: number[], t: string) => { g.setLineDash(dash); g.strokeStyle = col; g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + 52, ly); g.stroke(); g.setLineDash([]); g.fillStyle = INK; g.font = `400 19px ${FONT}`; g.fillText(t, lx + 70, ly + 6); ly += 36; };
    if (isL) { lineKey('rgba(192,57,43,.8)', [10, 7], 'Dây đảo giữa 2 công tắc 2 chiều'); lineKey('rgba(183,149,11,.9)', [10, 7], 'Dây từ công tắc ra đèn chính'); lineKey('rgba(183,149,11,.8)', [6, 6], 'Dây nối các đèn trong phòng'); }
    else lineKey('rgba(22,160,133,.85)', [4, 5], 'Ống đồng gas + ống nước ngưng điều hoà');
    ly += 20; heading(g, 'GHI CHÚ', lx, ly); ly += 20; g.fillStyle = SOFT; g.font = `400 18px ${FONT}`;
    if (isL) {
      // group table: code, group, lights, switches
      const kindName: Record<string, string> = { down: 'downlight Φ75', spot: 'spotlight Φ90', ceiling: 'ốp trần', porch: 'ốp trần hiên', sconce: 'hắt tường', eave: 'downlight mái đua' };
      const grows = [...grpCode.entries()].map(([room, n]) => { const fs = d.fixtures.filter(f => f.room === room), byK = new Map<string, number>(); fs.forEach(f => byK.set(f.kind, (byK.get(f.kind) ?? 0) + 1));
        const sw = ELEC.filter(e => (e.kind === 'switch2' || e.kind === 'switch1') && (e.lamp ?? e.room) === room);
        const nm = room.replace('Phòng ngủ', 'PN').replace(' (downlight)', ' — downlight');
        return [`Đ${n}`, nm, [...byK].map(([k, c2]) => `${c2} ${kindName[k] ?? k}`).join(', '), sw.length ? sw.map(swCode).join(', ') + (sw[0].kind === 'switch2' ? ' (2 chiều)' : ' (1 chiều)') : '—']; });
      ly = table(g, lx, ly + 16, [{ t: 'Nhóm', w: 62 }, { t: 'Khu vực', w: 170 }, { t: 'Đèn', w: 230 }, { t: 'Công tắc', w: 150 }], grows, 25, 13);
      ly += 6;
    }
    (isL ? ['Dây đèn 2 × 1.5 mm² đi trên trần trong ống luồn. Mạch C1: khách, bếp, hiên, ngoài nhà · C2: phòng ngủ, thờ, hành lang, giặt, WC.']
      : ['Chỉ 3 phòng ngủ có điều hoà; phòng khách, bếp không lắp.', 'Cục nóng: tường hậu (PN1, PN2), hồi tây (PN3); ống gas, ống nước ngưng đi trên trần.', 'Ổ cắm khu ướt (WC, giặt, bếp) qua RCBO 30 mA.',
        'Bếp từ dây riêng 2 × 4.0 mm², aptomat 2P 32A.', 'Tiếp địa cọc đồng, R ≤ 4 Ω, nối dây PE tới mọi ổ cắm.'])
      .forEach(t => { ly += 28; g.fillText('• ' + t, lx, ly, 590); });
    pages.push(c);
  }

  // ---------------- KT-08C reflected ceiling plan: gypsum ceilings, levels, lights, fans, setting-out dimensions ----------------
  {
    const { c, g, top: t } = page('MẶT BẰNG TRẦN THẠCH CAO', 'KT-08C', pages.length + 1, TOTAL, date, size);
    heading(g, 'MẶT BẰNG TRẦN THẠCH CAO — ĐÈN, QUẠT, ĐỊNH VỊ', planBox.X, M + 70, 'Kích thước mm từ mặt tường hoàn thiện tới tâm đèn / quạt · cao độ trần tính từ nền ±0.000');
    const P = planP;
    const rr = (x0: number, z0: number, x1: number, z1: number) => { const a = P(x0, z0), b = P(x1, z1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])] as [number, number, number, number]; };
    const isWC = (r: string) => r === 'WC1' || r === 'WC2';
    for (const r of d.rooms) { if (r.room === 'Sảnh') continue; const [x0, z0, x1, z1] = map.rect(r.base.rect), q = rr(x0, z0, x1, z1);
      g.fillStyle = isWC(r.room) ? '#e4e6e8' : '#fbfaf7'; g.fillRect(...q);
      if (r.room === 'Phòng khách') { const B = 0.55, iq = rr(x0 + B, z0 + B, x1 - B, z1 - B); g.fillStyle = '#f1efe8'; g.fillRect(...iq); g.setLineDash([12, 6]); g.strokeStyle = '#c99a2e'; g.lineWidth = 2.4; g.strokeRect(...iq); g.setLineDash([]); g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(...iq); } }
    drawBase(g, false);
    // levels + names
    for (const r of d.rooms) { if (r.room === 'Sảnh') continue; const [x0, z0, x1, z1] = map.rect(r.base.rect), m = P((x0 + x1) / 2, (z0 + z1) / 2);
      const lv = isWC(r.room) ? 'Trần BT +2.400' : r.room === 'Phòng khách' ? 'Viền +3.200 · giữa +3.350' : 'TC phẳng +3.200';
      g.textAlign = 'center'; g.font = `700 16px ${FONT}`; const w1 = Math.max(g.measureText(r.title).width, g.measureText(lv).width) + 12;
      const yy = m[1] + (r.room === 'Phòng khách' ? 60 : 30); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(m[0] - w1 / 2, yy - 16, w1, 42);
      g.fillStyle = INK; g.fillText(r.title, m[0], yy); g.fillStyle = ACC; g.font = `600 14px ${FONT}`; g.fillText(lv, m[0], yy + 20); g.textAlign = 'left'; }
    for (const f of d.fixtures) { const [x, y] = P(f.x, f.z); symbol(g, f.kind, x, y); }
    g.font = `700 12px ${FONT}`;
    for (const f of d.fixtures) { const [x, y] = P(f.x, f.z), s2 = f.kind === 'fan' ? `Q${fanCode.get(f.room)}` : `Đ${grpCode.get(f.room) ?? '?'}`, r2 = f.kind === 'fan' ? 26 : f.kind === 'porch' ? 18 : 12;
      const tw = g.measureText(s2).width + 6; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(x + r2 - 2, y - r2 - 12, tw, 15); g.fillStyle = '#8a6d00'; g.fillText(s2, x + r2 + 1, y - r2); }
    // setting-out: per room, a chain of the fixture x's along its north (top) edge and of the z's along its west/east edge
    const own = (room: string, f: typeof d.fixtures[number]) => f.room === room || f.room.startsWith(room + ' (');
    for (const r of d.rooms) { if (r.room === 'Sảnh') continue; const [x0, z0, x1, z1] = map.rect(r.base.rect), fs = d.fixtures.filter(f => own(r.room, f)); if (!fs.length) continue;
      const u = (v: number[]) => v.sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] > 0.05);
      const xs = u([x0, ...fs.map(f => f.x), x1]), zs = u([z0, ...fs.map(f => f.z), z1]);
      const zA = z1 - 0.18, xA = x0 + 0.18;   // inside the room, near its back and east walls
      g.save(); g.globalAlpha = 0.95;
      for (let i = 0; i + 1 < xs.length; i++) if (xs[i + 1] - xs[i] > 0.12) dimLine(g, P(xs[i], zA), P(xs[i + 1], zA), mm(xs[i + 1] - xs[i]), [0, 0]);
      for (let i = 0; i + 1 < zs.length; i++) if (zs[i + 1] - zs[i] > 0.12) dimLine(g, P(xA, zs[i]), P(xA, zs[i + 1]), mm(zs[i + 1] - zs[i]), [0, 0]);
      g.restore(); }
    // legend
    const lx = planBox.X + planBox.W + 60, lw = PW - M - 30 - lx; let ly = t + 40;
    heading(g, 'KÝ HIỆU', lx, ly); ly += 10;
    for (const [k2, s2] of [['spot', 'Spotlight âm trần Φ90 (khoét Φ75–80)'], ['down', 'Downlight âm trần Φ75 (khoét Φ65–70)'], ['fan', 'Quạt trần, móc treo bắt vào sàn mái BTCT'], ['porch', 'Đèn ốp trần hiên'], ['eave', 'Downlight mái đua (trần BT sơn)']] as [FixK, string][]) {
      ly += 40; symbol(g, k2, lx + 26, ly - 6, 0, 0.9); g.fillStyle = INK; g.font = `400 18px ${FONT}`; g.fillText(s2, lx + 70, ly, lw - 70); }
    ly += 40; g.setLineDash([12, 6]); g.strokeStyle = '#c99a2e'; g.lineWidth = 2.4; g.strokeRect(lx + 6, ly - 14, 40, 18); g.setLineDash([]); g.fillStyle = INK; g.fillText('Giật cấp trần phòng khách, hắt LED khe', lx + 70, ly);
    ly += 50; heading(g, 'GHI CHÚ TRẦN', lx, ly); ly += 16;
    ly = noteLines(g, lx, ly + 24, lw, ['Trần thạch cao khung xương chìm, tấm 9 mm (WC dùng', 'trần BT sơn chống ẩm +2.400, đèn IP44).', 'Phòng ngủ, bếp, thờ, hành lang: trần phẳng +3.200.',
      'Phòng khách: viền 550 ở +3.200, ô giữa +3.350, LED hắt khe.', 'Quạt trần: thanh treo xuyên trần, bắt vào sàn BTCT, gia cố khung.', 'Kích thước tính từ mặt tường hoàn thiện tới tâm đèn.', 'Mã Đn / Qn trùng sơ đồ đèn KT-08.'], 17, 26) + 10;
    pages.push(c);
  }

  // ---------------- KT-09 single-line diagram + loads ----------------
  {
    const { c, g, top: t } = page('SƠ ĐỒ NGUYÊN LÝ TỦ ĐIỆN & PHỤ TẢI', 'KT-09', pages.length + 1, TOTAL, date, size);
    heading(g, 'SƠ ĐỒ NGUYÊN LÝ TỦ ĐIỆN TỔNG', M + 60, t + 40, '1 pha 220 V · tủ đặt trong phòng khách cạnh cửa chính, cao 1.6 m');
    const x0 = M + 90, rowH = 50, yTop = t + 120;
    // supply -> meter -> main breaker -> busbar
    g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 3;
    const brk = (x: number, y: number) => { g.strokeRect(x - 12, y - 12, 24, 24); g.beginPath(); g.moveTo(x - 12, y + 12); g.lineTo(x + 12, y - 12); g.stroke(); };
    g.font = `700 20px ${FONT}`; g.fillText('Lưới điện 1 pha', x0 - 30, yTop - 10);
    g.beginPath(); g.moveTo(x0, yTop); g.lineTo(x0, yTop + 50); g.stroke();
    g.strokeRect(x0 - 26, yTop + 50, 52, 40); g.font = `700 16px ${FONT}`; g.textAlign = 'center'; g.fillText('kWh', x0, yTop + 76); g.textAlign = 'left';
    g.font = `400 18px ${FONT}`; g.fillText('Công tơ điện lực', x0 + 40, yTop + 76);
    g.beginPath(); g.moveTo(x0, yTop + 90); g.lineTo(x0, yTop + 140); g.stroke(); brk(x0, yTop + 152);
    g.font = `700 19px ${FONT}`; g.fillText(`${MAIN_BREAKER.name}: ${MAIN_BREAKER.breaker}`, x0 + 40, yTop + 150);
    g.font = `400 17px ${FONT}`; g.fillStyle = SOFT; g.fillText(`${MAIN_BREAKER.cable} · ${MAIN_BREAKER.note}`, x0 + 40, yTop + 174); g.fillStyle = INK;
    const busY0 = yTop + 200, busY1 = busY0 + (CIRCUITS.length - 1) * rowH + 30;
    g.beginPath(); g.moveTo(x0, yTop + 164); g.lineTo(x0, busY0); g.stroke();
    g.lineWidth = 7; g.beginPath(); g.moveTo(x0, busY0); g.lineTo(x0, busY1); g.stroke(); g.lineWidth = 2.5;
    g.font = `400 16px ${FONT}`; g.fillStyle = SOFT; g.fillText('Thanh cái', x0 - 80, busY0 + 14); g.fillStyle = INK;
    CIRCUITS.forEach((cc, i) => {
      const y = busY0 + 20 + i * rowH;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 70, y); g.stroke(); brk(x0 + 82, y); g.beginPath(); g.moveTo(x0 + 94, y); g.lineTo(x0 + 520, y); g.stroke();
      g.beginPath(); g.moveTo(x0 + 520, y - 8); g.lineTo(x0 + 536, y); g.lineTo(x0 + 520, y + 8); g.fill();
      g.font = `700 18px ${FONT}`; g.fillText(cc.id, x0 + 110, y - 8); g.font = `400 16px ${FONT}`; g.fillText(cc.breaker, x0 + 160, y - 8);
      g.fillStyle = SOFT; g.fillText(cc.cable, x0 + 380, y - 8); g.fillStyle = INK;
      g.font = `400 18px ${FONT}`; g.fillText(cc.name, x0 + 552, y + 6, 560);
    });
    // load table + device counts
    const tx = M + 1300; let ty = t + 40;
    heading(g, 'BẢNG PHỤ TẢI', tx, ty);
    const total = CIRCUITS.reduce((s2, cc) => s2 + cc.kw, 0), demand = total * 0.5, amps = demand * 1000 / (220 * 0.9);
    ty = table(g, tx, ty + 26, [{ t: 'Mạch', w: 90 }, { t: 'Phụ tải', w: 560 }, { t: 'kW', w: 110, right: true }],
      [...CIRCUITS.map(cc => [cc.id, cc.name, cc.kw.toFixed(1)]), ['Σ', 'Tổng công suất đặt', total.toFixed(1)], ['', 'Công suất tính toán (hệ số đồng thời 0.5)', demand.toFixed(1)], ['', 'Dòng điện tính toán (cos φ 0.9) — aptomat tổng 63A', `${amps.toFixed(0)} A`]], 34, 18) + 30;
    g.fillStyle = SOFT; g.font = `400 17px ${FONT}`; g.fillText('Phòng khách, bếp không lắp điều hoà. Nếu chạy cùng lúc 3 điều hoà, nóng lạnh và bếp từ thường xuyên: xin công tơ 63A trở lên.', tx, ty, 760); ty += 60;
    heading(g, 'SỐ LƯỢNG THIẾT BỊ THEO PHÒNG', tx, ty);
    const kinds: ElecKind[] = ['switch2', 'switch1', 'socket', 'data', 'ac', 'tv', 'heater'];
    const roomsE = [...new Set(ELEC.map(e => e.room))];
    table(g, tx, ty + 26, [{ t: 'Phòng', w: 190 }, ...kinds.map(k => ({ t: ({ switch2: 'CT 2C', switch1: 'CT 1C', socket: 'Ổ cắm', data: 'Mạng', ac: 'ĐH', tv: 'TV', heater: 'NL' } as Record<string, string>)[k], w: 82, right: true }))],
      roomsE.map(r => [d.rooms.find(x => x.room === r)?.title ?? r, ...kinds.map(k => String(ELEC.filter(e => e.room === r && e.kind === k).length || '—'))]), 32, 17);
    pages.push(c);
  }

  // ---------------- KT-10 / KT-10B water supply, drainage, solar + hot manifold, technical shaft ----------------
  // One drawer for both sheets: PP maps DEFAULT plan coords to the page, k scales symbols and text.
  // ---------------- KT-09C power wiring: every circuit from the panel through its sockets / switches / appliances ----------------
  {
    const { c, g, top: t } = page('SƠ ĐỒ ĐI DÂY CẤP ĐIỆN', 'KT-09C', pages.length + 1, TOTAL, date, size);
    heading(g, 'SƠ ĐỒ ĐI DÂY CẤP ĐIỆN — Ổ CẮM, CÔNG TẮC, THIẾT BỊ', planBox.X, M + 70, 'Mỗi mạch một màu, đi từ tủ điện tổng (TĐ) trên trần, thả xuống từng điểm theo thứ tự · dây đèn từ công tắc ra đèn: KT-08');
    g.globalAlpha = 0.45; drawBase(g, false); g.globalAlpha = 1;
    const PP = (x: number, z: number) => planP(map.mx(x), map.mz(z));
    const panel = ELEC.find(e => e.kind === 'panel')!;
    const COLS = ['#c0392b', '#d35400', '#b7950b', '#1e8449', '#117a65', '#2471a3', '#6c3483', '#a93226', '#7d6608', '#1a5276', '#943126', '#566573'];
    const rows: string[][] = [];
    CIRCUITS.forEach((ci, k) => {
      const col = COLS[k % COLS.length];
      // the points of this circuit: switches (lighting C1 / C2), sockets, appliances; the panel itself excluded
      const pts = ELEC.filter(e => e.circuit === ci.id && e.kind !== 'panel' && e.kind !== 'data'); if (!pts.length) return;
      // nearest-neighbour chain from the panel, each leg drawn orthogonally (along z, then x) as it runs in the ceiling
      let cur: [number, number] = [panel.x, panel.z]; const left = [...pts]; let L = 0, legs = 0; const off = (k - 5.5) * 0.035;
      g.strokeStyle = col; g.lineWidth = 2.6;
      while (left.length) { left.sort((a, b) => (Math.abs(a.x - cur[0]) + Math.abs(a.z - cur[1])) - (Math.abs(b.x - cur[0]) + Math.abs(b.z - cur[1]))); const nx = left.shift()!;
        const a = PP(cur[0] + off, cur[1] + off), m = PP(cur[0] + off, nx.z + off), b = PP(nx.x + off, nx.z + off);
        g.setLineDash(legs === 0 ? [] : [12, 5]); g.beginPath(); g.moveTo(...a); g.lineTo(...m); g.lineTo(...b); g.stroke();
        L += Math.abs(nx.x - cur[0]) + Math.abs(nx.z - cur[1]) + (3.2 - nx.y) * 2; cur = [nx.x, nx.z]; legs++;
        const [px, py] = PP(nx.x, nx.z); g.fillStyle = col; g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill(); }
      g.setLineDash([]);
      // circuit label at its first point
      const f = pts.reduce((b2, e) => (Math.abs(e.x - panel.x) + Math.abs(e.z - panel.z)) < (Math.abs(b2.x - panel.x) + Math.abs(b2.z - panel.z)) ? e : b2, pts[0]);
      const [lx2, ly2] = PP(f.x, f.z); g.font = `800 15px ${FONT}`; const s2 = ci.id, tw = g.measureText(s2).width + 10;
      g.fillStyle = col; g.fillRect(lx2 + 8, ly2 - 26 - (k % 3) * 18, tw, 20); g.fillStyle = '#fff'; g.fillText(s2, lx2 + 13, ly2 - 11 - (k % 3) * 18);
      const n = (kd: string) => pts.filter(e => e.kind === kd).length, sw = pts.filter(e => e.kind === 'switch1' || e.kind === 'switch2').length;
      rows.push([ci.id, ci.name, ci.breaker, ci.cable, [n('socket') ? `${n('socket')} ổ` : '', sw ? `${sw} CT` : '', pts.length - n('socket') - sw ? `${pts.length - n('socket') - sw} TB` : ''].filter(Boolean).join(' + '), String(Math.ceil(L * 1.1 + 2)), col]);
    });
    // panel
    { const [px, py] = PP(panel.x, panel.z); g.fillStyle = INK; g.fillRect(px - 20, py - 14, 40, 28); g.fillStyle = '#fff'; g.font = `700 13px ${FONT}`; g.textAlign = 'center'; g.fillText('TĐ', px, py + 5); g.textAlign = 'left'; }
    // right panel: circuit table with colour keys
    const lx = planBox.X + planBox.W + 50, lw = PW - M - 30 - lx; let ly = t + 40;
    heading(g, 'CÁC MẠCH', lx, ly);
    const y0 = ly + 24;
    ly = table(g, lx + 24, y0, [{ t: 'Mạch', w: 54 }, { t: 'Cấp cho', w: 200 }, { t: 'Aptomat', w: 120 }, { t: 'Dây', w: 92 }, { t: 'Điểm', w: 70 }, { t: 'm', w: 40, right: true }], rows.map(r => r.slice(0, 6)), 30, 12);
    rows.forEach((r, i) => { g.fillStyle = r[6]; g.fillRect(lx, y0 + 30 * (i + 1) + 7, 16, 16); });
    noteLines(g, lx, ly + 34, lw, ['Nét liền: tủ điện → điểm đầu mạch; nét đứt: nối tiếp các điểm.', 'Dây đi trên trần trong ống luồn PVC Ø20, thả xuống điểm trong tường.', 'Ổ cắm, CT: hộp âm tường; nối dây trong hộp, không nối giữa ống.',
      'Mạch ổ cắm khu ướt, bếp, phòng ngủ qua RCBO 30 mA (KT-09).', 'CT: công tắc · TB: điều hoà, nóng lạnh, camera, wifi, hộp số quạt.', 'Chiều dài ước tính, đã cộng 10 % + đoạn lên xuống tường.'], 16, 25);
    pages.push(c);
  }

  // ---------------- KT-09B network diagram + service entry (owner's request) ----------------
  {
    const { c, g, top: t } = page('SƠ ĐỒ MẠNG & ĐƯỜNG DÂY VÀO NHÀ', 'KT-09B', pages.length + 1, TOTAL, date, size);
    heading(g, 'SƠ ĐỒ MẠNG — ĐIỆN, CÁP QUANG VÀO NHÀ, LAN, WIFI', planBox.X, M + 70, 'Điện + cáp quang vào ở góc phòng thờ (giáp hiên) · modem / wifi tổng ở phòng khách · LAN Cat6 đi trên trần, thả xuống ổ trong ống luồn');
    g.globalAlpha = 0.5; drawBase(g, false); g.globalAlpha = 1;
    const PP = (x: number, z: number) => planP(map.mx(x), map.mz(z)), CEIL_Y = 3.2;
    const panel = ELEC.find(e => e.kind === 'panel')!, modem = ELEC.find(e => e.kind === 'wifi' && e.onTop)!;
    // orthogonal route a → b (z first, then x), its plan length, and a polyline on the page
    const route = (a: [number, number], b: [number, number], col: string, w: number, dash: number[], viaX?: number) => {
      const pts: [number, number][] = viaX === undefined ? [a, [a[0], b[1]], b] : [a, [viaX, a[1]], [viaX, b[1]], b];
      g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash); g.beginPath(); pts.forEach((p, i) => { const q = PP(p[0], p[1]); i ? g.lineTo(...q) : g.moveTo(...q); }); g.stroke(); g.setLineDash([]);
      let L = 0; for (let i = 0; i + 1 < pts.length; i++) L += Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]); return L; };
    const dot = (x: number, z: number, col: string, r = 7) => { const [px, py] = PP(x, z); g.fillStyle = col; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); };
    const tag = (x: number, z: number, s: string, col: string, dx = 12, dy = -12) => { const [px, py] = PP(x, z); g.font = `700 15px ${FONT}`; const tw = g.measureText(s).width + 10;
      g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(px + dx, py + dy - 16, tw, 22); g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(px + dx, py + dy - 16, tw, 22); g.fillStyle = col; g.fillText(s, px + dx + 5, py + dy); };
    const RED = '#c0392b', ORG = '#e67e22', GRN = '#1e8449', PUR = '#7d3c98';
    const IN = SERVICE_IN;
    // service entry: power to the panel, fibre to the modem
    const lP = route([IN.x, IN.z], [panel.x, panel.z], RED, 4, []);
    const lF = route([IN.x, IN.z - 0.08], [modem.x, modem.z], ORG, 3.5, [10, 6], 1.45);
    dot(IN.x, IN.z, INK, 10); tag(IN.x, IN.z, 'ĐIỂM VÀO: ĐIỆN + CÁP QUANG', INK, -330, 40);
    dot(panel.x, panel.z, RED, 9); tag(panel.x, panel.z, 'TĐ — tủ điện tổng', RED, 14, 34);
    dot(modem.x, modem.z, ORG, 10); tag(modem.x, modem.z, 'MODEM / WIFI TỔNG (trên nóc tủ rượu)', ORG, -60, 46);
    // LAN runs from the modem (star): every data outlet, the camera and the corridor access point
    const targets = ELEC.filter(e => (e.kind === 'data' && !/cáp quang/.test(e.note ?? '')) || (e.kind === 'camera' && !e.wireless) || (e.kind === 'wifi' && !e.onTop));
    // wifi cameras: marked, power only
    for (const e of ELEC.filter(x => x.kind === 'camera' && x.wireless)) { dot(e.x, e.z, '#2471a3'); tag(e.x, e.z, 'CAMERA WIFI (chỉ cấp điện)', '#2471a3', e.x > 7 ? -250 : 12, 30); }
    const runs = targets.map((e, i) => { const col = e.kind === 'wifi' ? PUR : GRN, L = route([modem.x, modem.z], [e.x, e.z], col, 2.6, e.kind === 'camera' ? [4, 4] : [], i % 2 ? 5.75 : 5.85);
      dot(e.x, e.z, col); const id = `L${i + 1}`; tag(e.x, e.z, `${id} ${e.kind === 'wifi' ? 'WIFI PHỤ' : e.kind === 'camera' ? 'CAMERA' : 'LAN'} · ${e.room}`, col, 10, e.z > 8 ? 34 : -12);
      const drop = (CEIL_Y - modem.y > 0 ? CEIL_Y - modem.y : 0.3) + (CEIL_Y - e.y);
      return { id, e, L: Math.ceil((L + drop) * 1.1 + 1) }; });
    // right panel: topology + cable table
    const lx = planBox.X + planBox.W + 60, lw = PW - M - 30 - lx; let ly = t + 40;
    heading(g, 'SƠ ĐỒ NGUYÊN LÝ', lx, ly); ly += 30;
    { const bx = (x: number, y: number, w: number, h: number, s: string, col: string) => { g.fillStyle = '#fff'; g.strokeStyle = col; g.lineWidth = 2.2; g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h); g.fillStyle = col; g.font = `700 15px ${FONT}`; g.textAlign = 'center'; g.fillText(s, x + w / 2, y + h / 2 + 5, w - 8); g.textAlign = 'left'; };
      const ar = (x0: number, y0: number, x1: number, y1: number, col: string, dash: number[] = []) => { g.strokeStyle = col; g.lineWidth = 2.2; g.setLineDash(dash); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]); };
      bx(lx, ly, 170, 44, 'Cột điện / tủ nhà mạng', INK); ar(lx + 170, ly + 14, lx + 230, ly + 14, RED); ar(lx + 170, ly + 32, lx + 230, ly + 32, ORG, [8, 5]);
      bx(lx + 230, ly - 30, 160, 40, 'Công tơ → TĐ tổng', RED); bx(lx + 230, ly + 30, 160, 40, 'Modem quang + wifi', ORG);
      const yy = ly + 110; ar(lx + 310, ly + 70, lx + 310, yy - 10, GRN);
      bx(lx + 230, yy - 10, 160, 40, 'Switch 8 cổng (trong tủ rượu)', GRN);
      runs.forEach((r, i) => { const y = yy + 50 + i * 34; ar(lx + 390, yy + 10, lx + 430, y + 12, r.e.kind === 'wifi' ? PUR : GRN, r.e.kind === 'camera' ? [4, 4] : []);
        g.fillStyle = r.e.kind === 'wifi' ? PUR : GRN; g.font = `600 14px ${FONT}`; g.fillText(`${r.id} ${r.e.kind === 'wifi' ? 'Wifi phụ (PoE)' : r.e.kind === 'camera' ? 'Camera (PoE)' : 'Ổ LAN'} — ${r.e.room}`, lx + 436, y + 17, lw - 440); });
      ly = yy + 60 + runs.length * 34; }
    heading(g, 'BẢNG CÁP', lx, ly + 10);
    ly = table(g, lx, ly + 34, [{ t: 'Tuyến', w: 70 }, { t: 'Từ → tới', w: 300 }, { t: 'Loại cáp', w: 150 }, { t: 'Dài ≈ m', w: 80, right: true }], [
      ['Đ', 'Điểm vào → tủ điện tổng', 'Cu/PVC 2×16 mm²', String(Math.ceil(lP * 1.1 + 3))], ['Q', 'Điểm vào → modem', 'Cáp quang thuê bao', String(Math.ceil(lF * 1.1 + 6))],
      ...runs.map(r => [r.id, `Modem → ${r.e.note ?? r.e.room}`, r.e.kind === 'data' ? 'Cat6 UTP' : 'Cat6 UTP (PoE)', String(r.L)])], 27, 13) + 20;
    noteLines(g, lx, ly + 10, lw, ['Cáp điện và cáp mạng đi ống luồn riêng, cách nhau ≥ 100 mm;', 'qua tường bằng ống PVC chờ sẵn ở góc phòng thờ, có hộp nối IP55.',
      'LAN đi trên trần thạch cao về modem, mỗi ổ 1 sợi riêng (hình sao).', 'Wifi phụ hành lang cạnh WC cấp nguồn PoE hoặc ổ cắm cao 2.4 m.', 'Chiều dài đã cộng 10 % và đoạn thả xuống ổ.'], 16, 25);
    pages.push(c);
  }

  // water points (đầu chờ): supply outlets (end of each cold / hot branch), fixture drains (start of waste / soil), floor
  // drains, the garden tap; default plan coords, with the room they are in for the setting-out
  const roomAt = (x: number, z: number) => d.rooms.find(r => { const [x0, z0, x1, z1] = r.base.rect; return x >= x0 - 0.12 && x <= x1 + 0.12 && z >= z0 - 0.12 && z <= z1 + 0.12 && r.room !== 'Sảnh'; });
  const WPTS: { id: string; name: string; kind: string; x: number; z: number; h: number | null; col: string; room: ReturnType<typeof roomAt> }[] = [];
  { const add = (name: string, kind: string, x: number, z: number, h: number | null, col: string) => { if (WPTS.some(w => Math.hypot(w.x - x, w.z - z) < 0.05 && w.kind === kind)) return; WPTS.push({ id: `N${WPTS.length + 1}`, name, kind, x, z, h, col, room: roomAt(x, z) }); };
    for (const pp of PIPES) { if (pp.kind === 'cold' || pp.kind === 'hot') { const e = pp.pts[pp.pts.length - 1]; if (e[1] < 2.0) add(pp.note?.replace(/^nóng → /, '') ?? '', pp.kind === 'hot' ? 'cấp nóng' : 'cấp lạnh', e[0], e[2], e[1], PIPE_STYLE[pp.kind].css); }
      if ((pp.kind === 'waste' || pp.kind === 'soil') && pp.pts[0][1] > -0.2 && !/phễu|ống gom|bể phốt|HG/.test(pp.note ?? '')) add(pp.note ?? '', pp.kind === 'soil' ? 'thoát xí' : 'thoát', pp.pts[0][0], pp.pts[0][2], pp.pts[0][1] > 0.05 ? pp.pts[0][1] : null, PIPE_STYLE[pp.kind].css); }
    for (const f of FLOOR_DRAINS) add('Phễu thu sàn ' + f.label, 'thoát sàn', f.x, f.z, null, PIPE_STYLE.waste.css);
    for (const t of TAPS) add(t.label, 'cấp lạnh', t.x, t.z, t.y, PIPE_STYLE.cold.css); }
  const drawPlumb = (g: CanvasRenderingContext2D, PP: (x: number, z: number) => [number, number], k: number, detail: boolean) => {
    const rectP = (x0: number, z0: number, x1: number, z1: number) => { const a = PP(x0, z0), b = PP(x1, z1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])] as const; };
    const F = (px: number, w = 700) => `${w} ${Math.round(px * k)}px ${FONT}`;
    // roof equipment outlines (dashed): tank, solar heater
    g.lineWidth = 2; g.setLineDash([10, 6]);
    g.strokeStyle = ACC; g.strokeRect(...rectP(TANK.x0, TANK.z - 0.57, TANK.x1, TANK.z + 0.57));
    g.strokeStyle = '#e08a1e'; g.strokeRect(...rectP(SOLAR.x0, SOLAR.z0, SOLAR.x1, SOLAR.z1)); g.setLineDash([]);
    // wet-zone floor slopes towards the drains (KT-10B)
    if (detail) {
      const zones: { r: [number, number, number, number]; fd: number }[] = [
        { r: [10.84, 7.68, 11.84, 8.78], fd: 0 }, { r: [10.84, 6.17, 12.44, 7.62], fd: 1 }, { r: [12.58, 6.17, 13.78, 8.78], fd: 2 }, { r: [10.82, 5.05, 13.8, 6.05], fd: 3 }];
      for (const zn of zones) {
        const f = FLOOR_DRAINS[zn.fd], [x0, z0, x1, z1] = zn.r;
        g.fillStyle = 'rgba(47,127,216,.07)'; g.fillRect(...rectP(x0, z0, x1, z1));
        for (const [cx, cz] of [[x0 + 0.15, z0 + 0.15], [x1 - 0.15, z0 + 0.15], [x1 - 0.15, z1 - 0.15], [x0 + 0.15, z1 - 0.15]] as [number, number][]) {
          const a = PP(cx, cz), b = PP(cx + (f.x - cx) * 0.55, cz + (f.z - cz) * 0.55), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 25) continue;
          g.strokeStyle = '#2f7fd8'; g.lineWidth = 2; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
          g.fillStyle = '#2f7fd8'; g.beginPath(); g.moveTo(...b); g.lineTo(b[0] - 12 * Math.cos(ang - 0.4), b[1] - 12 * Math.sin(ang - 0.4)); g.lineTo(b[0] - 12 * Math.cos(ang + 0.4), b[1] - 12 * Math.sin(ang + 0.4)); g.closePath(); g.fill();
        }
        const [px, py] = PP(f.x, f.z); g.fillStyle = '#2f7fd8'; g.font = F(15, 700); g.fillText('i = 1 %', px + 14 * k, py + 26 * k);
      }
    }
    // septic tank, manholes, shaft
    g.fillStyle = 'rgba(156,152,144,.35)'; g.strokeStyle = INK; g.lineWidth = 2; const sr = rectP(SEPTIC.x0, SEPTIC.z0, SEPTIC.x1, SEPTIC.z1); g.fillRect(...sr); g.strokeRect(...sr);
    for (const f of [1 / 3, 2 / 3]) { g.beginPath(); g.moveTo(sr[0] + sr[2] * f, sr[1]); g.lineTo(sr[0] + sr[2] * f, sr[1] + sr[3]); g.stroke(); }
    g.fillStyle = INK; g.font = F(16); g.textAlign = 'center'; g.fillText(SEPTIC.label, sr[0] + sr[2] / 2, sr[1] + sr[3] / 2 + 6); g.textAlign = 'left';
    for (const h of MANHOLES) { const [x, y] = PP(h.x, h.z), r = 14 * k; g.fillStyle = '#fff'; g.strokeStyle = INK; g.fillRect(x - r, y - r, 2 * r, 2 * r); g.strokeRect(x - r, y - r, 2 * r, 2 * r); g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.stroke(); g.fillStyle = INK; g.font = F(16); g.fillText(h.label, x + r + 4, y + 6); }
    { const r = rectP(SHAFT.x0, SHAFT.z0, SHAFT.x1, SHAFT.z1); g.fillStyle = '#ffe9a8'; g.fillRect(...r); g.strokeStyle = INK; g.lineWidth = 2.5; g.strokeRect(...r);
      g.beginPath(); g.moveTo(r[0], r[1]); g.lineTo(r[0] + r[2], r[1] + r[3]); g.moveTo(r[0] + r[2], r[1]); g.lineTo(r[0], r[1] + r[3]); g.stroke(); }
    // pipes (plan projection): drains first, supply on top; dots where a pipe changes level
    for (const kd of ['rain', 'soil', 'waste', 'vent', 'cold', 'hot'] as PipeKind[]) for (const pp of PIPES.filter(q => q.kind === kd)) {
      g.strokeStyle = PIPE_STYLE[kd].css; g.lineWidth = (kd === 'soil' ? 6 : kd === 'waste' || kd === 'vent' ? 4.5 : 3.5) * Math.max(1, k * 0.8); g.setLineDash(kd === 'vent' ? [3, 4] : []);
      g.beginPath(); pp.pts.forEach((q, i) => { const [x, y] = PP(q[0], q[2]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
      for (let i = 0; i + 1 < pp.pts.length; i++) { const a = pp.pts[i], b = pp.pts[i + 1]; if (Math.abs(a[1] - b[1]) > 0.3 && Math.hypot(a[0] - b[0], a[2] - b[2]) < 0.05) { const [x, y] = PP(b[0], b[2]); g.fillStyle = PIPE_STYLE[kd].css; g.beginPath(); g.arc(x, y, 6 * k, 0, Math.PI * 2); g.fill(); } }
      if (detail && pp.d) { // size label at the middle of the longest horizontal run
        let best = -1, bl = 0; for (let i = 0; i + 1 < pp.pts.length; i++) { const a = pp.pts[i], b = pp.pts[i + 1], l = Math.hypot(a[0] - b[0], a[2] - b[2]); if (l > bl) { bl = l; best = i; } }
        if (best >= 0 && bl > 0.5) { const a = pp.pts[best], b = pp.pts[best + 1], [x, y] = PP((a[0] + b[0]) / 2, (a[2] + b[2]) / 2); g.font = F(13, 700); const t2 = `Ø${pp.d}`, tw = g.measureText(t2).width + 8;
          g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x - tw / 2, y - 22, tw, 18); g.fillStyle = PIPE_STYLE[kd].css; g.textAlign = 'center'; g.fillText(t2, x, y - 8); g.textAlign = 'left'; } }
    }
    // floor drains, valves, garden tap
    for (const f of FLOOR_DRAINS) { const [px, py] = PP(f.x, f.z), r = 9 * k; g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.moveTo(px - r * 0.7, py); g.lineTo(px + r * 0.7, py); g.moveTo(px, py - r * 0.7); g.lineTo(px, py + r * 0.7); g.stroke();
      if (detail) { g.fillStyle = INK; g.font = F(14, 600); g.fillText('PT ' + f.label, px + r + 4, py - 6); } }
    const bow = (x: number, y: number, col: string) => { const r = 10 * k; g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - r, y - r * 0.7); g.lineTo(x + r, y + r * 0.7); g.lineTo(x + r, y - r * 0.7); g.lineTo(x - r, y + r * 0.7); g.closePath(); g.fill(); g.stroke(); };
    for (const v of VALVES) { const [x, y] = PP(v.x, v.z); bow(x, y, '#d23a2a'); g.fillStyle = '#b02a1a'; g.font = F(15); g.fillText(v.label.split(' ')[0], x - 10 * k, y - 14 * k); }
    for (const t of TAPS) { const [x, y] = PP(t.x, t.z); bow(x, y, '#2f7fd8'); g.fillStyle = INK; g.font = F(15); g.fillText(t.label, x + 14 * k, y + 22 * k); }
  };
  {
    const { c, g, top: t } = page('CẤP THOÁT NƯỚC', 'KT-10', pages.length + 1, TOTAL, date, size);
    heading(g, 'MẶT BẰNG CẤP THOÁT NƯỚC & HỘP KỸ THUẬT', planBox.X, M + 70, 'Téc 1500 L + bình năng lượng mặt trời trên mái bằng WC · ống cấp trên sàn gác WC (+2.62) và trong trần (+3.45) · ống thoát dưới nền (−0.30)');
    g.globalAlpha = 0.22; g.drawImage(renders.plan, pf.X, pf.Y, pf.W, pf.H); g.globalAlpha = 1;
    g.globalAlpha = 0.55; drawBase(g, false); g.globalAlpha = 1;
    const PP = (x: number, z: number) => planP(map.mx(x), map.mz(z));
    drawPlumb(g, PP, 1, false);
    // water points: code on every one; setting-out dimensions here for those outside the WC block (KT-10B has the rest)
    for (const w of WPTS) { const [px, py] = PP(w.x, w.z); g.fillStyle = w.col; g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill(); g.fillStyle = INK; g.font = `800 13px ${FONT}`; g.fillText(w.id, px + 6, py + 15);
      if (!w.room || (w.x >= 10.5 && w.z >= 4.8)) continue; const [x0, z0, x1, z1] = w.room.base.rect, wx = w.x - x0 <= x1 - w.x ? x0 : x1, wz = w.z - z0 <= z1 - w.z ? z0 : z1;
      if (Math.abs(w.x - wx) > 0.04) dimLine(g, PP(wx, w.z), PP(w.x, w.z), mm(Math.abs(w.x - wx)), [0, 0]); if (Math.abs(w.z - wz) > 0.04) dimLine(g, PP(w.x, wz), PP(w.x, w.z), mm(Math.abs(w.z - wz)), [0, 0]); }
    const tags: [number, number, string][] = [[9.7, 1.62, 'Chậu rửa bát (nóng + lạnh)'], [10.95, 5.45, 'Lavabo'], [13.5, 5.46, 'Máy giặt'], [11.26, 7.32, 'Xí WC1'], [13.18, 8.45, 'Xí WC2'], [13.55, 7.41, 'NL điện 50 L'], [11.06, 6.59, 'Lavabo WC1'], [13.655, 8.66, 'HKT']];
    g.font = `700 15px ${FONT}`;
    for (const [x, z, s2] of tags) { const [px, py] = PP(x, z), tw = g.measureText(s2).width + 10; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(px + 8, py - 30, tw, 22); g.fillStyle = INK; g.fillText(s2, px + 13, py - 13); }
    // right column: legend, 3D, notes
    const lx = planBox.X + planBox.W + 60, lw = PW - M - 30 - lx; let ly = t + 40;
    heading(g, 'KÝ HIỆU', lx, ly); ly += 10;
    for (const kd of ['cold', 'hot', 'soil', 'waste', 'vent', 'rain'] as PipeKind[]) { ly += 32; g.strokeStyle = PIPE_STYLE[kd].css; g.lineWidth = 5; g.setLineDash(kd === 'vent' ? [3, 4] : []); g.beginPath(); g.moveTo(lx, ly - 6); g.lineTo(lx + 52, ly - 6); g.stroke(); g.setLineDash([]);
      g.fillStyle = INK; g.font = `600 17px ${FONT}`; g.fillText(PIPE_STYLE[kd].name, lx + 66, ly, 300); g.fillStyle = SOFT; g.font = `400 15px ${FONT}`; g.fillText(PIPE_STYLE[kd].spec, lx + 370, ly, lw - 370); }
    const keyBox = (draw: () => void, s2: string) => { ly += 32; draw(); g.fillStyle = INK; g.font = `600 17px ${FONT}`; g.fillText(s2, lx + 66, ly, lw - 66); };
    keyBox(() => { g.setLineDash([10, 6]); g.strokeStyle = ACC; g.lineWidth = 2; g.strokeRect(lx + 10, ly - 20, 32, 22); g.setLineDash([]); }, TANK.label);
    keyBox(() => { g.setLineDash([10, 6]); g.strokeStyle = '#e08a1e'; g.lineWidth = 2; g.strokeRect(lx + 10, ly - 20, 32, 22); g.setLineDash([]); }, SOLAR.label);
    keyBox(() => { g.fillStyle = '#ffe9a8'; g.fillRect(lx + 10, ly - 20, 32, 22); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(lx + 10, ly - 20, 32, 22); }, SHAFT.label + ' (góc WC2, có nắp thăm)');
    keyBox(() => { g.fillStyle = '#d23a2a'; g.beginPath(); g.moveTo(lx + 14, ly - 16); g.lineTo(lx + 38, ly - 2); g.lineTo(lx + 38, ly - 16); g.lineTo(lx + 14, ly - 2); g.closePath(); g.fill(); }, 'V1 van nóng NLMT · V2 van nóng bình điện (sau cửa thăm gác)');
    ly += 30; g.fillStyle = INK; g.font = `600 17px ${FONT}`; g.fillText('●  Ống đứng    ⊕  Phễu thu sàn (có bẫy mùi)    ⊠  Hố ga', lx + 10, ly);
    ly += 20; const img = renders.pipes3d, iw = lw, ih = iw * img.height / img.width; g.drawImage(img, lx, ly, iw, ih); g.strokeStyle = LINE; g.lineWidth = 1.5; g.strokeRect(lx, ly, iw, ih); ly += ih + 30;
    heading(g, 'GHI CHÚ', lx, ly); g.fillStyle = SOFT; g.font = `400 16px ${FONT}`; ly += 6;
    ['Nước nóng: mở V1 đóng V2 dùng năng lượng mặt trời; trời âm u mở V2 đóng V1 dùng bình điện.', 'Nước nóng cấp cho 2 sen, lavabo và chậu rửa bát; ống nóng bọc cách nhiệt.',
      'Téc trên chân cao 1.55 m (đáy +5.45), cao hơn bình NLMT để cấp tự chảy; áp sen ~3.5 m cột nước, yếu thì lắp bơm tăng áp.',
      'Vòi tưới cây ở tường hồi Tây, ngoài WC2, cao 0.6 m.', 'Ống thoát dưới nền dốc ≥ 2 %; xí vào bể phốt (ra HG1); thoát sàn WC, lavabo qua HG3 thẳng ra mương; bếp qua HG2 ra mương. Chi tiết WC: KT-10B (WC1), KT-10C (WC2, khu giặt).',
      'Vị trí ống sơ bộ — đội thi công cần đo lại tại hiện trường.'].forEach(l2 => { ly += 25; g.fillText('• ' + l2, lx, ly, lw); });
    pages.push(c);
  }
  for (const sh of [
    { code: 'KT-10B', title: 'CHI TIẾT CẤP THOÁT NƯỚC WC1', head: 'WC1 — CẤP NÓNG LẠNH, THOÁT SÀN, ĐẦU CHỜ', f: zf1, img: 'planWC1', rooms: ['WC1'], detail: false },
    { code: 'KT-10C', title: 'CHI TIẾT CẤP THOÁT NƯỚC WC2 & KHU GIẶT', head: 'WC2, KHU GIẶT + LAVABO — CẤP NÓNG LẠNH, THOÁT SÀN, ĐẦU CHỜ', f: zf2, img: 'planWC2', rooms: ['WC2', 'Lavabo'], detail: true }]) {
    const zf = sh.f;
    const { c, g, top: t } = page(sh.title, sh.code, pages.length + 1, TOTAL, date, size);
    heading(g, sh.head, zb.X, M + 70, 'Mũi tên: dốc sàn về phễu thu · Ø: đường kính ống · N…: đầu chờ nước, kích thước mm tới tường gần nhất (bảng bên phải)');
    g.globalAlpha = 0.3; g.drawImage(renders[sh.img], zf.X, zf.Y, zf.W, zf.H); g.globalAlpha = 1;
    const ZP = (x: number, z: number) => { const w = W(x, z); return topXY(zf, w[0], w[1]); };
    g.save(); g.beginPath(); g.rect(zf.X, zf.Y, zf.W, zf.H); g.clip();
    g.globalAlpha = 0.6; drawBase(g, false, ZP); g.globalAlpha = 1;
    drawPlumb(g, (x, z) => ZP(map.mx(x), map.mz(z)), 1.5, true);
    // the wet rooms not on this sheet are faded out
    for (const r of d.rooms) { if (!['WC1', 'WC2', 'Lavabo'].includes(r.room) || sh.rooms.includes(r.room)) continue; const [x0, z0, x1, z1] = r.base.rect, a = ZP(map.mx(x0), map.mz(z0)), b = ZP(map.mx(x1), map.mz(z1));
      g.fillStyle = 'rgba(255,255,255,.82)'; g.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); g.fillStyle = SOFT; g.font = `700 22px ${FONT}`; g.textAlign = 'center'; g.fillText(`${r.title} — xem ${r.room === 'WC1' ? 'KT-10B' : 'KT-10C'}`, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); g.textAlign = 'left'; }
    // setting-out of every water point of this sheet: a dimension to the nearer wall across x and across z
    for (const w of WPTS) { if (!w.room || !sh.rooms.includes(w.room.room)) continue; const [x0, z0, x1, z1] = w.room.base.rect, P2 = (x: number, z: number) => ZP(map.mx(x), map.mz(z));
      const wx = w.x - x0 <= x1 - w.x ? x0 : x1, wz = w.z - z0 <= z1 - w.z ? z0 : z1;
      if (Math.abs(w.x - wx) > 0.04) dimLine(g, P2(wx, w.z), P2(w.x, w.z), mm(Math.abs(w.x - wx)), [0, 0]);
      if (Math.abs(w.z - wz) > 0.04) dimLine(g, P2(w.x, wz), P2(w.x, w.z), mm(Math.abs(w.z - wz)), [0, 0]);
      const [px, py] = P2(w.x, w.z); g.fillStyle = w.col; g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.fill(); g.fillStyle = INK; g.font = `800 17px ${FONT}`; g.fillText(w.id, px + 9, py + 20); }
    g.restore(); g.strokeStyle = LINE; g.lineWidth = 1.5; g.strokeRect(zf.X, zf.Y, zf.W, zf.H);
    const lx = zb.X + zb.W + 60, lw = PW - M - 30 - lx; let ly = t + 40;
    if (sh.detail) {
    heading(g, 'CHI TIẾT PHỄU THU SÀN (MẶT CẮT)', lx, ly); ly += 30;
    { // schematic section: drawing on the left 55 %, labels in a column on the right with leader lines
      const X0 = lx + 10, Wd = Math.round(lw * 0.55), Y0 = ly + 30, cx = X0 + Wd / 2, dw = 44;
      const band = (y0: number, y1: number, col: string, slope: number) => { // a layer sloping down towards the drain
        g.fillStyle = col; for (const side of [-1, 1]) { const xa = side < 0 ? X0 : cx + dw, xb = side < 0 ? cx - dw : X0 + Wd, ya = side < 0 ? slope : 0, yb = side < 0 ? 0 : slope;
          g.beginPath(); g.moveTo(xa, Y0 + y0 - ya); g.lineTo(xb, Y0 + y0 - yb); g.lineTo(xb, Y0 + y1 - yb); g.lineTo(xa, Y0 + y1 - ya); g.closePath(); g.fill(); } };
      band(0, 12, '#d9dee2', 10); band(12, 58, '#c9bfae', 10); band(58, 64, '#2f7fd8', 0); band(64, 150, '#a8a49c', 0);
      // drain body + grate, trap, outlet pipe
      g.fillStyle = '#6f767d'; g.fillRect(cx - dw - 8, Y0 - 3, 2 * dw + 16, 8); g.fillStyle = '#5f666d'; g.fillRect(cx - dw + 6, Y0 + 5, 2 * dw - 12, 80);
      g.strokeStyle = '#5f666d'; g.lineWidth = 16; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, Y0 + 84); g.lineTo(cx, Y0 + 190); g.quadraticCurveTo(cx, Y0 + 232, cx + 40, Y0 + 232); g.quadraticCurveTo(cx + 80, Y0 + 232, cx + 80, Y0 + 195); g.stroke();
      g.strokeStyle = '#7d8790'; g.lineWidth = 18; g.beginPath(); g.moveTo(cx + 80, Y0 + 198); g.lineTo(X0 + Wd, Y0 + 212); g.stroke(); g.lineCap = 'butt';
      const LX = X0 + Wd + 30; let k2 = 0;
      const lbl = (x: number, y: number, s3: string) => { const ty = Y0 - 10 + k2 * 40; k2++; g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(LX - 6, ty); g.stroke();
        g.fillStyle = INK; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); g.font = `600 15px ${FONT}`; g.fillText(s3, LX, ty + 5, PW - M - 30 - LX); };
      lbl(cx + dw, Y0, 'Phễu thu inox Ø90 có lưới');
      lbl(X0 + 60, Y0 + 2, 'Gạch chống trơn, dốc 1 % về phễu');
      lbl(X0 + 100, Y0 + 34, 'Vữa tạo dốc M75, dày 30–50');
      lbl(X0 + Wd - 60, Y0 + 61, 'Chống thấm, bẻ lên tường 300 (sen 1800)');
      lbl(X0 + Wd - 90, Y0 + 110, 'Sàn BTCT / nền bê tông');
      lbl(cx + 40, Y0 + 232, 'Bẫy mùi (con thỏ) Ø60');
      lbl(X0 + Wd - 30, Y0 + 210, 'Ống uPVC Ø60 → ống gom Ø75, dốc 2 %');
      ly = Y0 + 305; }
    }
    heading(g, 'ĐỊNH VỊ ĐẦU CHỜ CẤP, THOÁT NƯỚC', lx, ly);
    ly = table(g, lx, ly + 24, [{ t: 'Mã', w: 50 }, { t: 'Điểm nước', w: 270 }, { t: 'Loại', w: 92 }, { t: 'Cách tường X', w: 112, right: true }, { t: 'Cách tường Z', w: 112, right: true }, { t: 'Cao H', w: 76, right: true }],
      WPTS.filter(w => w.room && sh.rooms.includes(w.room.room)).map(w => { const r = w.room?.base.rect; return [w.id, w.name, w.kind, r ? mm(Math.min(w.x - r[0], r[2] - w.x)) : '—', r ? mm(Math.min(w.z - r[1], r[3] - w.z)) : '—', w.h === null ? 'sàn' : mm(w.h)]; }), 25, 13) + 30;
    heading(g, 'GHI CHÚ', lx, ly); g.fillStyle = SOFT; g.font = `400 16px ${FONT}`; ly += 6;
    ['Sàn WC hạ 30 mm so với sàn nhà, có gờ chặn nước ở cửa.', 'Mỗi phễu thu có bẫy mùi; ống gom Ø90 dưới khu Lavabo qua HG3 thẳng ra mương.', 'Xí đi ống Ø90 riêng vào bể phốt, không chung với ống thoát sàn.',
      'Van V1 / V2 đặt ngay sau cửa thăm gác (phía Lavabo, trên cửa WC1) để thao tác.', 'Vòi đồng xả chậu ở khu tắm, cao 550, dưới củ sen.', 'Thử kín nước chống thấm 24 h trước khi lát gạch.'].forEach(l2 => { ly += 25; g.fillText('• ' + l2, lx, ly, lw); });
    pages.push(c);
  }
  // ---------------- KT-10D 3D views of the water system (owner's request) ----------------
  {
    const { c, g, top: t, bottom } = page('PHỐI CẢNH 3D HỆ THỐNG NƯỚC', 'KT-10D', pages.length + 1, TOTAL, date, size);
    heading(g, 'PHỐI CẢNH 3D HỆ THỐNG CẤP THOÁT NƯỚC', M + 60, M + 70, 'Nhà làm mờ · ống theo màu ký hiệu bên dưới · bể phốt, hố ga, hố thu nước mưa dưới đất');
    const gw = (PW - 2 * M - 160) / 2, gh = bottom - t - 200;
    [['pipesA', 'Nhìn từ phía sau nhà (Bắc–Tây): téc, bình NLMT, khối WC, bể phốt, ống thoát mưa trong cột'], ['pipesB', 'Nhìn từ mặt tiền (Nam): ống cấp trên trần, thoát sàn WC qua HG3 ra mương, thoát bếp qua HG2']].forEach(([k, cap], i) => {
      const img = renders[k], r = Math.min(gw / img.width, gh / img.height), iw = img.width * r, ih = img.height * r, x = M + 60 + i * (gw + 40), y = t + 90;
      g.drawImage(img, x, y, iw, ih); g.strokeStyle = LINE; g.lineWidth = 1.5; g.strokeRect(x, y, iw, ih);
      g.fillStyle = INK; g.font = `600 20px ${FONT}`; g.fillText(cap, x, y + ih + 34, iw); });
    let lx = M + 60; const ly = bottom - 40;
    for (const kd of ['cold', 'hot', 'soil', 'waste', 'vent', 'rain'] as PipeKind[]) { g.strokeStyle = PIPE_STYLE[kd].css; g.lineWidth = 6; g.setLineDash(kd === 'vent' ? [3, 4] : []); g.beginPath(); g.moveTo(lx, ly - 6); g.lineTo(lx + 46, ly - 6); g.stroke(); g.setLineDash([]);
      g.fillStyle = INK; g.font = `600 17px ${FONT}`; g.fillText(PIPE_STYLE[kd].name, lx + 56, ly); lx += 56 + g.measureText(PIPE_STYLE[kd].name).width + 40; }
    pages.push(c);
  }

  // ---------------- KT-11 / KT-12 sections of every room ----------------
  for (let sh = 0; sh * 6 < sections.length; sh++) {
    const code = `KT-1${1 + sh}`, title = `MẶT CẮT CÁC PHÒNG (${sh + 1})`;
    const { c, g, top: t } = page(title, code, pages.length + 1, TOTAL, date, size);
    heading(g, title, M + 60, t + 40, 'Cắt đứng qua giữa phòng theo chiều dài phòng, nhìn về nửa phía sau · tường cắt tô đen · cao độ tính bằng m');
    sections.slice(sh * 6, sh * 6 + 6).forEach((S2, i) => {
      const col = i % 3, row = Math.floor(i / 3), cx0 = SG.x0 + col * (SCW + SG.gap), cy0 = SG.y0 + 30 + row * (SCH + 56 + SG.gap);
      g.drawImage(renders['sec-' + S2.r.room], cx0, cy0, SCW, SCH);
      g.save(); g.beginPath(); g.rect(cx0, cy0, SCW, SCH); g.clip();
      const PX = (uu: number) => cx0 + SCW / 2 + (uu - S2.uc) / S2.hw * SCW / 2, PY = (y: number) => cy0 + SCH / 2 - (y - S2.yc) / S2.hh * SCH / 2;
      const fillU = (u0: number, u1: number, y0: number, y1: number, col2: string) => { g.fillStyle = col2; g.fillRect(PX(Math.min(u0, u1)), PY(y1), Math.abs(PX(u1) - PX(u0)), PY(y0) - PY(y1)); };
      // ground and floor slab
      fillU(S2.uc - S2.hw, S2.uc + S2.hw, -0.6, -0.1, 'rgba(150,135,110,.25)'); fillU(S2.uc - S2.hw, S2.uc + S2.hw, -0.1, 0, '#2b3038');
      // cut walls, then their openings
      const onCut = (a0: number, a1: number) => S2.alongX ? a0 <= S2.zc + 1e-6 && a1 >= S2.zc - 1e-6 : a0 <= S2.xc + 1e-6 && a1 >= S2.xc - 1e-6;
      const uR = (ex0: number, ez0: number, ex1: number, ez1: number): [number, number] => S2.alongX ? [ex0 - 7, ex1 - 7] : [S2.u(S2.xc, ez0), S2.u(S2.xc, ez1)];
      for (const w of d.walls) { const ex0 = map.mx(w[0]), ez0 = map.mz(w[1]), ex1 = map.mx(w[2]), ez1 = map.mz(w[3]);
        if (!(S2.alongX ? onCut(ez0, ez1) : onCut(ex0, ex1))) continue; const [p, q] = uR(ex0, ez0, ex1, ez1);
        const T = THO_SCREEN, wood = w[0] === THO_X && w[1] === 4.95 && w[2] === 11.45 && !S2.alongX && S2.xc > map.mx(T.x0) && S2.xc < map.mx(T.x1);
        if (wood) { const open = S2.xc > map.mx(T.open[0]) && S2.xc < map.mx(T.open[1]); fillU(p, q, T.top, E1, '#2b3038'); fillU(p, q, open ? T.openH : 0, T.top, '#8a5a3c'); continue; }
        fillU(p, q, 0, w[0] === 12.46 && w[2] === 12.56 ? 2.5 : E1, '#2b3038'); }
      for (const w of map.windows) { if (w.hidden) continue; const r = w.rect, ex0 = map.mx(r[0]), ez0 = map.mz(r[1]), ex1 = map.mx(r[2]), ez1 = map.mz(r[3]);
        if (!(S2.alongX ? onCut(ez0, ez1) && ex1 - ex0 < 0.4 : onCut(ex0, ex1) && ez1 - ez0 < 0.4)) continue; const [p, q] = uR(ex0, ez0, ex1, ez1);
        fillU(p, q, w.sill, w.sill + w.h, '#ffffff'); g.strokeStyle = ACC; g.lineWidth = 2; for (const f of [0.35, 0.65]) { const uu = p + (q - p) * f; g.beginPath(); g.moveTo(PX(uu), PY(w.sill)); g.lineTo(PX(uu), PY(w.sill + w.h)); g.stroke(); } }
      for (const dd of map.doors) { if (dd.hidden) continue; const sp = dd.spec, [a0, a1] = dd.span;
        const cutsIt = S2.alongX ? sp.axis === 'z' && onCut(map.mz(a0), map.mz(a1)) : sp.axis === 'x' && onCut(map.mx(a0), map.mx(a1)); if (!cutsIt) continue;
        const [p, q] = S2.alongX ? [map.mx(sp.at - 0.13) - 7, map.mx(sp.at + 0.13) - 7] as [number, number] : [S2.u(S2.xc, map.mz(sp.at - 0.13)), S2.u(S2.xc, map.mz(sp.at + 0.13))] as [number, number];
        fillU(p, q, 0, dd.h + (sp.kind === 'main' ? 0.45 : 0), '#ffffff'); }
      // ceiling line + levels
      const ch2 = ceilOf(S2.r.room);
      g.strokeStyle = '#b4532a'; g.lineWidth = 3; g.beginPath(); g.moveTo(PX(S2.ua), PY(ch2)); g.lineTo(PX(S2.ub), PY(ch2)); g.stroke();
      const lv: [number, string][] = [[0, '±0.000 nền'], [ch2, `${level(ch2)} trần${ch2 === 2.4 ? ' BT' : S2.r.room === 'Sảnh' ? ' hiên' : ' thạch cao'}`], [E1, `${level(E1)} đỉnh tường`]];
      g.font = `600 15px ${FONT}`;
      for (const [y, s2] of lv) { const X = cx0 + 8, Y = PY(y); g.fillStyle = INK; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + 12, Y); g.lineTo(X + 6, Y - 9); g.closePath(); g.fill();
        const tw = g.measureText(s2).width + 8; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(X + 16, Y - 18, tw, 20); g.fillStyle = INK; g.fillText(s2, X + 20, Y - 3); }
      g.restore();
      // dimensions: room length (bottom) and clear height (right)
      dimLine(g, [PX(S2.ua), PY(-0.1)], [PX(S2.ub), PY(-0.1)], fmtM(S2.ub - S2.ua), [0, 34]);
      g.strokeStyle = LINE; g.lineWidth = 1.5; g.strokeRect(cx0, cy0, SCW, SCH);
      const idx = sh * 6 + i + 1;
      g.fillStyle = ACC; g.font = `700 24px ${FONT}`; g.fillText(`${idx}`, cx0, cy0 + SCH + 44);
      g.fillStyle = INK; g.font = `600 23px ${FONT}`; g.fillText(`${S2.r.title} — cắt ${S2.alongX ? 'dọc (Đông–Tây)' : 'ngang (Nam–Bắc)'} · thông thuỷ ${fmtM(ceilOf(S2.r.room))} m`, cx0 + 40, cy0 + SCH + 44, SCW - 40);
    });
    pages.push(c);
  }

  // ---------------- KT-10 / KT-11 3D views (3 x 2 grid) ----------------
  for (const [code, title, prefix] of [['KT-13', 'PHỐI CẢNH NGOẠI THẤT 3D', 'x', 9], ['KT-14', 'PHỐI CẢNH NỘI THẤT 3D', 'i', 10]] as const) {
    const { c, g, top: t, bottom } = page(title, code, pages.length + 1, TOTAL, date, size);
    heading(g, title, M + 60, t + 40);
    const list = views3d.filter(v => v.k.startsWith(prefix)), gap = 34, x0 = M + 60, y0 = t + 80;
    const cw = (PW - 2 * M - 120 - 2 * gap) / 3, ch = (bottom - y0 - gap) / 2 - 50;
    list.forEach((v, i) => {
      const col = i % 3, row = Math.floor(i / 3), x = x0 + col * (cw + gap), y = y0 + row * (ch + 50 + gap);
      const img = renders[v.k], s2 = Math.max(cw / img.width, ch / img.height), sw = cw / s2, sh = ch / s2;
      g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, cw, ch);   // cover-crop into the cell
      g.strokeStyle = LINE; g.lineWidth = 1.5; g.strokeRect(x, y, cw, ch);
      g.fillStyle = ACC; g.font = `700 24px ${FONT}`; g.fillText(`${i + 1}`, x, y + ch + 36);
      g.fillStyle = INK; g.font = `600 24px ${FONT}`; g.fillText(v.cap, x + 30, y + ch + 36, cw - 30);
    });
    pages.push(c);
  }

  onProgress('Đang ghi file PDF…');
  const blob = await pdfFromCanvases(pages);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `ho-so-thiet-ke-nha-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** A minimal PDF: one A3 landscape page per canvas, each page a full-bleed JPEG image. */
async function pdfFromCanvases(canvases: HTMLCanvasElement[]): Promise<Blob> {
  const enc = new TextEncoder(), parts: (Uint8Array | string)[] = [], offsets: number[] = [];
  let pos = 0;
  const push = (p: Uint8Array | string) => { parts.push(p); pos += typeof p === 'string' ? enc.encode(p).length : p.length; };
  const obj = (n: number, body: () => void) => { offsets[n] = pos; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const Wpt = 1190.55, Hpt = 841.89, n = canvases.length;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${canvases.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`));
  for (let i = 0; i < n; i++) {
    const cv = canvases[i];
    const jpg = await new Promise<Uint8Array>(res => cv.toBlob(b => b!.arrayBuffer().then(ab => res(new Uint8Array(ab))), 'image/jpeg', 0.9));
    const pg = 3 + i * 3, ct = pg + 1, im = pg + 2;
    obj(pg, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${Wpt} ${Hpt}] /Resources << /XObject << /Im${i} ${im} 0 R >> >> /Contents ${ct} 0 R >>`));
    const cs = `q ${Wpt} 0 0 ${Hpt} 0 0 cm /Im${i} Do Q`;
    obj(ct, () => push(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
    obj(im, () => { push(`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream'); });
  }
  const xref = pos, count = 3 + n * 3;
  let x = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let k = 1; k < count; k++) x += `${String(offsets[k]).padStart(10, '0')} 00000 n \n`;
  push(x + `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}
