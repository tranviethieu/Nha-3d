// "Xuất PDF": a set of A3 drawing sheets built from the live model (cover, floor plan with dimensions, four
// elevations, roof plan, preliminary structure, door / window and furniture schedules). Each sheet is drawn on a
// canvas (so Vietnamese text renders with the system fonts) around off-screen renders from Game.snapshot, and the
// sheets are packed as JPEG pages into a small hand-written PDF (no PDF library needed).
import type { Game } from './Game';
import { COLOR_SPECS, MAIN_SIDE, THO_SCREEN, fmtM, type Dir } from './layout';
import { CIRCUITS, ELEC, MAIN_BREAKER, type ElecKind } from './electrical';
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
  main: `Cửa đôi nhôm kính nẹp vàng, 2 ô kính bên ${mm(MAIN_SIDE)} + ô sáng 450`, inner: 'Cửa gỗ 1 cánh', outer: 'Cửa gỗ 1 cánh (ra ngoài)', wc: 'Cửa nhôm / nhựa 1 cánh',
};
const DIRV: Record<Dir, [number, number]> = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

export async function exportDesignPdf(game: Game, onProgress: (s: string) => void) {
  const d: Data = game.designData(), map = d.map, MZ = d.mirrorZ;
  const R = d.roofs, F = R.main;
  // edited plan -> world, and the house's world bounds
  const W = (x: number, z: number): [number, number] => [x - 7, MZ === null ? z - 4.5 : MZ - (z - 4.5)];
  const hx0 = map.mx(0) - 7, hx1 = map.mx(14) - 7, zA = W(0, map.mz(0))[1], zB = W(0, map.mz(9))[1];
  const hz0 = Math.min(zA, zB), hz1 = Math.max(zA, zB);
  const E1 = 3.9, ridge = E1 + F.rise, size = `${fmtM(map.houseD)} × ${fmtM(map.houseW)}`;
  const date = new Date().toLocaleDateString('vi-VN');
  const TOTAL = 19;

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
  const zc0 = W(map.mx(10.5), map.mz(4.8)), zc1 = W(map.mx(14.2), map.mz(10.95));
  const zf = fit(zb.X, zb.Y, zb.W, zb.H, (zc0[0] + zc1[0]) / 2, (zc0[1] + zc1[1]) / 2, Math.abs(zc1[0] - zc0[0]) / 2 + 0.3, Math.abs(zc1[1] - zc0[1]) / 2 + 0.3);
  await snap('planWC', { pos: [zf.cx, 40, zf.cy], target: [zf.cx, 0, zf.cy], up: [0, 0, 1], half: [zf.hw, zf.hh] }, { w: zf.W, h: zf.H, roof: false, clipY: 1.3 });

  // elevations: orthographic, camera just outside the house on each side (inside the boundary wall)
  onProgress('Đang dựng các mặt đứng…');
  const ey0 = -0.9, ey1 = ridge + 1.0, ecy = (ey0 + ey1) / 2, ehh = (ey1 - ey0) / 2;
  const ex0 = Math.min(hx0 - 1.5, map.mx(-1.4) - 7), ex1 = F.X1 - 7 + 0.4, ecx = (ex0 + ex1) / 2, ehwX = (ex1 - ex0) / 2 + 0.6;
  const ez0 = Math.min(F.Z0 - 4.5, hz0 - 1.0), ez1 = Math.max(F.Z1 - 4.5, hz1 + 1.0), ecz = (hz0 + hz1) / 2, ehwZ = (ez1 - ez0) / 2 + 0.6;
  const elev: { k: string; title: string; pos: V3; target: V3; hw: number; along: 'x' | 'z'; flip: boolean }[] = [
    { k: 'S', title: 'MẶT ĐỨNG CHÍNH — HƯỚNG NAM', pos: [ecx, ecy, hz0 - 1.0], target: [ecx, ecy, 10], hw: ehwX, along: 'x', flip: true },
    { k: 'N', title: 'MẶT ĐỨNG SAU — HƯỚNG BẮC', pos: [ecx, ecy, hz1 + 2.2], target: [ecx, ecy, -10], hw: ehwX, along: 'x', flip: false },
    { k: 'E', title: 'MẶT ĐỨNG BÊN — HƯỚNG ĐÔNG (PHÍA SẢNH)', pos: [map.mx(-1.7) - 7, ecy, ecz], target: [10, ecy, ecz], hw: ehwZ, along: 'z', flip: false },
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
    { k: 'i3', cap: 'Phòng ngủ 1', pos: V(6.0, 1.7, 5.4), target: V(3.4, 0.8, 7.9), fov: 64, roof: true },
    { k: 'i4', cap: 'Phòng ngủ 2', pos: V(10.4, 1.7, 5.4), target: V(7.4, 0.8, 7.7), fov: 64, roof: true },
    { k: 'i5', cap: 'Phòng ngủ 3', pos: V(10.4, 1.7, 3.6), target: V(12.8, 0.8, 0.7), fov: 64, roof: true },
    { k: 'i6', cap: 'Phòng thờ', pos: V(0.35, 1.85, 8.65), target: V(2.3, 0.9, 6.5), fov: 78, roof: true },
  ];
  const GW = 1110, GH = 940;
  // 3D plan (roof off, room names), as seen from above in the overview
  const p3w = PW - 2 * M - 120, p3h = PH - 2 * M - TB - 170;
  await snap('plan3d', { pos: [pcx, 21, pcz - 3.2], target: [pcx, 0, pcz - 0.2], fov: 40 }, { w: Math.round(p3w * 0.75), h: Math.round(p3h * 0.75), roof: false, labels: true });
  for (const v of views3d) await snap(v.k, { pos: v.pos, target: v.target, fov: v.fov }, { w: GW, h: GH, roof: v.roof });

  // plumbing 3D (house ghosted) and one section per room (vertical cut through the room's centre, along its
  // longer side, looking at the far half; plan coords -> world so the mirror and room stretches are followed)
  onProgress('Đang dựng ống nước và mặt cắt…');
  await snap('pipes3d', { pos: V(19.5, 8.5, 15.5), target: V(10.6, 0.6, 5.6), fov: 40 }, { w: 1300, h: 900, roof: false, pipes: true });
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
    ]) + 50;
    heading(g, 'DANH MỤC BẢN VẼ', x, y += 10);
    table(g, x, y + 30, [{ t: 'Ký hiệu', w: 150 }, { t: 'Tên bản vẽ', w: 680 }], [
      ['KT-00', 'Trang bìa & tổng quan'], ['KT-01', 'Mặt bằng bố trí & kích thước'], ['KT-01B', 'Mặt bằng 3D (bỏ mái)'], ['KT-02', 'Mặt đứng chính (Nam) & mặt đứng sau (Bắc)'],
      ['KT-03', 'Mặt đứng bên (Đông, Tây)'], ['KT-04', 'Mặt bằng mái'], ['KT-05', 'Kết cấu sơ bộ'], ['KT-05B', 'Định vị cột C, dầm D'], ['KT-06', 'Thống kê cửa đi, cửa sổ & phòng'], ['KT-07', 'Thống kê nội thất'], ['KT-08', 'Sơ đồ đèn (chiếu sáng)'], ['KT-08B', 'Mặt bằng ổ cắm & điều hoà'], ['KT-09', 'Sơ đồ nguyên lý tủ điện & phụ tải'], ['KT-10', 'Cấp thoát nước & hộp kỹ thuật'], ['KT-10B', 'Chi tiết thoát sàn & cấp nóng khu WC'], ['KT-11', 'Mặt cắt các phòng (1)'], ['KT-12', 'Mặt cắt các phòng (2)'], ['KT-13', 'Phối cảnh ngoại thất 3D'], ['KT-14', 'Phối cảnh nội thất 3D'],
    ], 38, 20);
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
    const south = [0, 1.0, 5.95, 9.95, 14].map(sx), north = [0, 2.6, 6.45, 10.77, 12.51, 14].map(sx);
    const east = [0, 4.95, 9].map(sz), west = [0, 4.0, 4.95, 6.25, 9].map(sz);
    const chain = (vals: number[], side: 'S' | 'N' | 'E' | 'W', ring: number) => {
      for (let i = 0; i + 1 < vals.length; i++) {
        const a = vals[i], b = vals[i + 1], lab = fmtM(b - a);
        if (side === 'S' || side === 'N') { const z = side === 'S' ? sz(0) : sz(9); const pa = P(a, z), pb = P(b, z); const dir = (P(a, z + (side === 'S' ? -1 : 1))[1] - pa[1]); dimLine(g, pa, pb, lab, [0, Math.sign(dir) * (90 + ring * 60)]); }
        else { const x = side === 'E' ? map.mx(-1.3) : sx(14); const pa = P(x, a), pb = P(x, b); const dir = (P(x + (side === 'E' ? -1 : 1), a)[0] - pa[0]); dimLine(g, pa, pb, lab, [Math.sign(dir) * (110 + ring * 60), 0]); }
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
    const lv: [number, string][] = [[-0.3, 'Sân'], [0, 'Nền'], [0.9, 'Bậu cửa sổ'], [2.7, 'Đỉnh cửa'], [E1, 'Đỉnh tường'], [ridge, 'Đỉnh mái']];
    g.lineWidth = 1.2;
    for (const [y, name] of lv) {
      const yy = py(y); g.strokeStyle = LINE; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(X + 150, yy); g.lineTo(X + w - 20, yy); g.stroke(); g.setLineDash([]);
      g.fillStyle = INK; g.beginPath(); g.moveTo(X + 132, yy); g.lineTo(X + 146, yy - 12); g.lineTo(X + 118, yy - 12); g.closePath(); g.fill();
      const dy = y < 0 ? 40 : 0; g.font = `700 19px ${FONT}`; g.fillText(level(y), X + 8, yy - 16 + dy); g.font = `400 16px ${FONT}`; g.fillStyle = SOFT; g.fillText(name, X + 8, yy + 6 + dy);
    }
    // overall length under the drawing
    const a0 = e.along === 'x' ? hx0 : hz0, a1 = e.along === 'x' ? hx1 : hz1, yb = py(-0.3);
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

  // ---------------- KT-04 roof plan ----------------
  {
    const { c, g } = page('MẶT BẰNG MÁI', 'KT-04', pages.length + 1, TOTAL, date, size);
    heading(g, 'MẶT BẰNG MÁI', planBox.X, M + 70, 'Mái ngói dốc 4 phía + mái bằng bê tông trên khu WC (đặt téc nước)');
    g.drawImage(renders.roof, pf.X, pf.Y, pf.W, pf.H);
    const lx = planBox.X + planBox.W + 70; let ly = M + 150; northArrow(g, lx + 40, ly + 40); ly += 140;
    heading(g, 'THÔNG SỐ MÁI', lx, ly);
    const deg = (t: number) => `${Math.round(Math.atan(t) * 180 / Math.PI)}°`;
    ly = table(g, lx, ly + 26, [{ t: 'Mái', w: 200 }, { t: 'Dài × rộng (m)', w: 200 }, { t: 'Cao', w: 100, right: true }, { t: 'Dốc', w: 90, right: true }], [
      ['Mái chính', `${fmtM(F.L)} × ${fmtM(F.W)}`, fmtM(F.rise), deg(F.t)],
      ['Mái phòng thờ', `${fmtM(R.tho.L)} × ${fmtM(R.tho.W)}`, fmtM(R.tho.rise), deg(R.tho.t)],
      ['Mái sảnh', `${fmtM(R.sanh.L)} × ${fmtM(R.sanh.W)}`, fmtM(R.sanh.rise), deg(R.sanh.t)],
    ], 38, 19) + 40;
    const fx0 = map.mx(10.72), fz0 = map.mz(6.2);
    table(g, lx, ly, [{ t: 'Hạng mục', w: 260 }, { t: 'Giá trị', w: 330 }], [
      ['Cao độ mép mái (đỉnh tường)', level(E1)], ['Cao độ đỉnh mái chính', level(ridge)],
      ['Mái bằng BTCT khu WC', `${fmtM(F.X1 - fx0)} × ${fmtM(F.Z1 - fz0)} m`], ['Lan can mái bằng', 'cao 0.3 m'],
      ['Téc nước inox nằm ngang', '1500 L · Φ1140 × L1750 · cao 1365'], ['Tải téc khi đầy', '≈ 1.7 tấn'],
    ], 38, 19);
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
      ['Móng đơn', '1.0 × 1.0 m, sâu 1.6 m', `${s.footings} cái`], ['Cột BTCT', '220 × 220', `${s.columns} cột`],
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
    const ox = map.mx(0), oz = map.mz(0), r2 = (v: number) => Math.round(v * 100) / 100;
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

  // ---------------- KT-06 schedules: doors, windows ----------------
  {
    const { c, g, top: t } = page('THỐNG KÊ CỬA ĐI, CỬA SỔ & PHÒNG', 'KT-06', pages.length + 1, TOTAL, date, size);
    let y = t + 40; heading(g, 'THỐNG KÊ CỬA ĐI', M + 60, y);
    y = table(g, M + 60, y + 26, [{ t: 'Ký hiệu', w: 130 }, { t: 'Tên', w: 420 }, { t: 'Phòng', w: 230 }, { t: 'Rộng × cao (mm)', w: 260 }, { t: 'Loại', w: 760 }, { t: 'SL', w: 80, right: true }],
      d.openings.doors.filter(o => !o.hidden).map(o => {
        const total = o.base.kind === 'main' ? o.w + 2 * MAIN_SIDE : o.w, h = o.base.kind === 'main' ? o.h + 0.45 : o.h;
        return [codes.doors.get(o.id)!, o.label, o.room, `${mm(total)} × ${mm(h)}`, DOOR_KIND[o.base.kind] ?? '', '1'];
      }), 40, 20) + 60;
    heading(g, 'THỐNG KÊ CỬA SỔ (NHÔM KÍNH)', M + 60, y);
    y = table(g, M + 60, y + 26, [{ t: 'Ký hiệu', w: 130 }, { t: 'Tên', w: 420 }, { t: 'Phòng', w: 230 }, { t: 'Rộng × cao (mm)', w: 260 }, { t: 'Bậu (mm)', w: 150, right: true }, { t: 'Kiểu cánh', w: 360 }, { t: 'Ô sáng', w: 170 }, { t: 'SL', w: 80, right: true }],
      d.openings.wins.filter(o => !o.hidden).map(o => [codes.wins.get(o.id)!, o.label, o.room, `${mm(o.w)} × ${mm(o.h)}`, mm(o.sill), STYLE[o.base.style] ?? '', o.h >= 1.6 ? '450' : o.h >= 1.1 ? '280' : '—', '1']), 40, 20) + 40;
    g.fillStyle = SOFT; g.font = `400 20px ${FONT}`;
    g.fillText(`Tổng: ${codes.doors.size} cửa đi, ${codes.wins.size} cửa sổ. Cửa sổ cao 1800 = cánh 1350 + ô sáng 450 (trừ cửa sổ WC, bếp từ, cạnh máy giặt). Cửa chính tính cả 2 ô kính bên và ô sáng.`, M + 60, y);
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
  const SYM_COL: Record<ElecKind, string> = { switch2: '#c0392b', heaterSw: '#c0392b', socket: '#2f6fb3', data: '#7d3c98', ac: '#16a085', tv: '#1d2430', heater: '#d35400', camera: '#7d3c98', panel: '#1d2430', acOut: '#16a085' };
  const symbol = (g: CanvasRenderingContext2D, kind: ElecKind | 'down' | 'ceiling' | 'pendant', x: number, y: number, ang = 0, s = 1) => {
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s); g.lineWidth = 2.2;
    const col = kind in SYM_COL ? SYM_COL[kind as ElecKind] : '#b7950b';
    g.strokeStyle = col; g.fillStyle = '#fff';
    if (kind === 'down') { g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fillStyle = col; g.fill(); }
    else if (kind === 'ceiling') { g.beginPath(); g.arc(0, 0, 17, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-12, -12); g.lineTo(12, 12); g.moveTo(12, -12); g.lineTo(-12, 12); g.stroke(); }
    else if (kind === 'pendant') { g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill(); }
    else if (kind === 'switch2' || kind === 'heaterSw') { g.fillStyle = col; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(0, 0); g.lineTo(14, -16); g.lineTo(20, -11); g.moveTo(0, 0); g.lineTo(-14, -16); g.lineTo(-20, -11); g.stroke();
      if (kind === 'heaterSw') { g.font = `700 14px ${FONT}`; g.fillText('NL', 12, 16); } }
    else if (kind === 'socket') { g.fillStyle = col; g.beginPath(); g.arc(0, 0, 11, Math.PI, 0); g.closePath(); g.fill(); g.beginPath(); g.moveTo(-7, -11); g.lineTo(-7, -19); g.moveTo(7, -11); g.lineTo(7, -19); g.stroke(); }
    else if (kind === 'data') { g.fillStyle = col; g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.lineTo(0, -15); g.closePath(); g.fill(); }
    else if (kind === 'ac') { g.fillRect(-34, -16, 68, 16); g.strokeRect(-34, -16, 68, 16); g.fillStyle = col; g.font = `700 13px ${FONT}`; g.textAlign = 'center'; g.fillText('ĐH', 0, -3); }
    else if (kind === 'acOut') { g.fillRect(-26, -26, 52, 26); g.strokeRect(-26, -26, 52, 26); g.beginPath(); g.arc(-6, -13, 9, 0, Math.PI * 2); g.stroke(); g.fillStyle = col; g.font = `700 11px ${FONT}`; g.textAlign = 'center'; g.fillText('DN', 14, -9); }
    else if (kind === 'tv') { g.fillStyle = col; g.fillRect(-30, -8, 60, 8); }
    else if (kind === 'heater') { g.beginPath(); g.roundRect(-30, -22, 60, 22, 10); g.fill(); g.stroke(); g.fillStyle = col; g.font = `700 13px ${FONT}`; g.textAlign = 'center'; g.fillText('NL', 0, -6); }
    else if (kind === 'camera') { g.fillStyle = col; g.fillRect(-12, -18, 24, 14); g.beginPath(); g.moveTo(12, -11); g.lineTo(22, -18); g.lineTo(22, -4); g.closePath(); g.fill(); }
    else if (kind === 'panel') { g.fillStyle = col; g.fillRect(-20, -14, 40, 14); g.fillStyle = '#fff'; g.font = `700 11px ${FONT}`; g.textAlign = 'center'; g.fillText('TĐ', 0, -3); }
    g.restore();
  };
  // KT-08 lighting plan (fixtures, 2-way switches, travellers, fixture runs) and KT-08B power plan (sockets, data,
  // ACs with outdoor units and pipes, TVs, water heaters, camera, panel): same plan base, different layers
  const LIGHT_KINDS = new Set<ElecKind>(['switch2']);
  for (const mode of ['light', 'power'] as const) {
    const isL = mode === 'light';
    const { c, g } = page(isL ? 'MẶT BẰNG CHIẾU SÁNG' : 'MẶT BẰNG Ổ CẮM & ĐIỀU HOÀ', isL ? 'KT-08' : 'KT-08B', pages.length + 1, TOTAL, date, size);
    heading(g, isL ? 'SƠ ĐỒ ĐÈN — ĐÈN, CÔNG TẮC 2 CHIỀU, DÂY ĐẢO, DÂY RA ĐÈN' : 'SƠ ĐỒ ĐIỆN — Ổ CẮM, ĐIỀU HOÀ, NÓNG LẠNH, TIVI, CAMERA, TỦ ĐIỆN', planBox.X, M + 70,
      isL ? 'Mỗi phòng 2 công tắc 2 chiều cùng điều khiển đèn phòng · mạch C1 / C2 · số nhỏ: độ cao lắp (m) / mạch' : 'Số nhỏ cạnh ký hiệu: độ cao lắp (m) / mạch · mạch xem KT-09');
    g.globalAlpha = 0.25; g.drawImage(renders.plan, pf.X, pf.Y, pf.W, pf.H); g.globalAlpha = 1;
    drawBase(g, false);
    const P = planP;
    const at = (e: typeof ELEC[number]) => { const v = DIRV[e.n], X = map.mx(e.x) + v[0] * 0.16, Z = map.mz(e.z) + v[1] * 0.16; return P(X, Z); };
    const items = ELEC.filter(e => isL ? LIGHT_KINDS.has(e.kind) : !LIGHT_KINDS.has(e.kind));
    if (isL) {
      // fixture runs: from the room's main light, nearest-neighbour through the room's fixtures (dashed yellow)
      g.setLineDash([6, 6]); g.lineWidth = 1.6; g.strokeStyle = 'rgba(183,149,11,.8)';
      for (const room of new Set(d.fixtures.map(f => f.room))) {
        const fs = d.fixtures.filter(f => f.room === room); if (fs.length < 2) continue;
        const start = fs.find(f => f.kind === 'ceiling') ?? fs[0], left = fs.filter(f => f !== start); let cur = start;
        while (left.length) { left.sort((a, b) => Math.hypot(a.x - cur.x, a.z - cur.z) - Math.hypot(b.x - cur.x, b.z - cur.z)); const nx = left.shift()!;
          g.beginPath(); g.moveTo(...P(cur.x, cur.z)); g.lineTo(...P(nx.x, nx.z)); g.stroke(); cur = nx; }
      }
      // 2-way wiring: traveller between the two switches (red), switch to the room's main light (yellow)
      const roomLight = (room: string) => d.fixtures.find(f => f.room === room && f.kind === 'ceiling') ?? d.fixtures.find(f => f.room === room);
      g.setLineDash([10, 7]); g.lineWidth = 2;
      for (const room of new Set(ELEC.filter(e => e.kind === 'switch2').map(e => e.room))) {
        const sw = ELEC.filter(e => e.kind === 'switch2' && e.room === room), lt = roomLight(room);
        if (sw.length === 2) { const a = at(sw[0]), b = at(sw[1]); g.strokeStyle = 'rgba(192,57,43,.8)'; g.beginPath(); g.moveTo(...a); g.quadraticCurveTo((a[0] + b[0]) / 2 + 30, (a[1] + b[1]) / 2 - 30, ...b); g.stroke(); }
        if (lt) { const a = at(sw[0]), b = P(lt.x, lt.z); g.strokeStyle = 'rgba(183,149,11,.9)'; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
      }
      g.setLineDash([]);
      for (const f of d.fixtures) { const [x, y] = P(f.x, f.z); symbol(g, f.kind, x, y); }
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
      if (e.kind === 'socket' || e.kind === 'switch2' || e.kind === 'data') {
        const tx = sx + (x1 - x0) * 0.32, ty = sy + (y1 - y0) * 0.32;
        g.fillStyle = SOFT; g.font = `600 13px ${FONT}`; g.textAlign = 'center'; g.fillText(`${e.y.toFixed(2)}${e.circuit ? ' · ' + e.circuit : ''}`, tx, ty + 4); g.textAlign = 'left';
      }
    }
    // legend
    const lx = planBox.X + planBox.W + 70; let ly = M + 150;
    northArrow(g, lx + 40, ly + 40); ly += 120; heading(g, 'KÝ HIỆU', lx, ly); ly += 20;
    const count = (k: ElecKind) => ELEC.filter(e => e.kind === k).length;
    const rows: [ElecKind | 'down' | 'ceiling' | 'pendant', string, number][] = isL ? [
      ['ceiling', 'Đèn ốp trần LED (phòng khách, phòng ngủ)', d.fixtures.filter(f => f.kind === 'ceiling').length], ['down', 'Đèn âm trần LED Φ90', d.fixtures.filter(f => f.kind === 'down').length],
      ['pendant', 'Đèn thả bàn ăn', d.fixtures.filter(f => f.kind === 'pendant').length], ['switch2', 'Công tắc 2 chiều (cao 1.25 / đầu giường 0.9)', count('switch2')],
    ] : [
      ['socket', 'Ổ cắm đôi 3 chấu (cao 0.4 trừ ghi chú)', count('socket')], ['data', 'Ổ mạng LAN + truyền hình', count('data')], ['ac', 'Điều hoà treo tường (cao 2.85)', count('ac')], ['acOut', 'Cục nóng ngoài tường (giá đỡ, cao 2.3)', count('acOut')],
      ['tv', 'Tivi treo tường', count('tv')], ['heater', 'Bình nóng lạnh 50 L dùng chung (cao 2.05)', count('heater')], ['heaterSw', 'Công tắc 2 cực nóng lạnh', count('heaterSw')],
      ['camera', 'Camera an ninh', count('camera')], ['panel', 'Tủ điện tổng + aptomat tổng 63A', count('panel')],
    ];
    for (const [k, t, n] of rows) { ly += 44; symbol(g, k, lx + 26, ly + (k === 'down' || k === 'ceiling' || k === 'pendant' ? -6 : 6)); g.fillStyle = INK; g.font = `400 19px ${FONT}`; g.fillText(t, lx + 70, ly, 460); g.font = `700 19px ${FONT}`; g.textAlign = 'right'; g.fillText(String(n), lx + 590, ly); g.textAlign = 'left'; }
    ly += 50; g.lineWidth = 2;
    const lineKey = (col: string, dash: number[], t: string) => { g.setLineDash(dash); g.strokeStyle = col; g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + 52, ly); g.stroke(); g.setLineDash([]); g.fillStyle = INK; g.font = `400 19px ${FONT}`; g.fillText(t, lx + 70, ly + 6); ly += 36; };
    if (isL) { lineKey('rgba(192,57,43,.8)', [10, 7], 'Dây đảo giữa 2 công tắc 2 chiều'); lineKey('rgba(183,149,11,.9)', [10, 7], 'Dây từ công tắc ra đèn chính'); lineKey('rgba(183,149,11,.8)', [6, 6], 'Dây nối các đèn trong phòng'); }
    else lineKey('rgba(22,160,133,.85)', [4, 5], 'Ống đồng gas + ống nước ngưng điều hoà');
    ly += 20; heading(g, 'GHI CHÚ', lx, ly); ly += 20; g.fillStyle = SOFT; g.font = `400 18px ${FONT}`;
    (isL ? ['Phòng khách: trần giật cấp, LED hắt khe, đèn ốp giữa + âm trần viền.', 'Phòng ngủ: trần phẳng +3.200, đèn ốp + âm trần, không đặt đèn trên đầu giường.',
      'WC: trần bê tông +2.400, 1 đèn âm trần chống ẩm IP44.', 'Dây đèn 2 × 1.5 mm² đi trên trần trong ống luồn; công tắc cao 1.25 m.', 'Mạch C1: khách, bếp, hiên · C2: phòng ngủ, thờ, hành lang, giặt, WC.']
      : ['Chỉ 3 phòng ngủ có điều hoà; phòng khách, bếp không lắp.', 'Cục nóng: tường hậu (PN1, PN2), hồi tây (PN3); ống gas, ống nước ngưng đi trên trần.', 'Ổ cắm khu ướt (WC, giặt, bếp) qua RCBO 30 mA.',
        'Bếp từ dây riêng 2 × 4.0 mm², aptomat 2P 32A.', 'Tiếp địa cọc đồng, R ≤ 4 Ω, nối dây PE tới mọi ổ cắm.'])
      .forEach(t => { ly += 28; g.fillText('• ' + t, lx, ly, 590); });
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
    const kinds: ElecKind[] = ['switch2', 'socket', 'data', 'ac', 'tv', 'heater'];
    const roomsE = [...new Set(ELEC.map(e => e.room))];
    table(g, tx, ty + 26, [{ t: 'Phòng', w: 190 }, ...kinds.map(k => ({ t: ({ switch2: 'CT 2C', socket: 'Ổ cắm', data: 'Mạng', ac: 'ĐH', tv: 'TV', heater: 'NL' } as Record<string, string>)[k], w: 95, right: true }))],
      roomsE.map(r => [d.rooms.find(x => x.room === r)?.title ?? r, ...kinds.map(k => String(ELEC.filter(e => e.room === r && e.kind === k).length || '—'))]), 32, 17);
    pages.push(c);
  }

  // ---------------- KT-10 / KT-10B water supply, drainage, solar + hot manifold, technical shaft ----------------
  // One drawer for both sheets: PP maps DEFAULT plan coords to the page, k scales symbols and text.
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
        { r: [10.84, 7.53, 11.84, 8.78], fd: 0 }, { r: [10.84, 6.32, 12.44, 7.47], fd: 1 }, { r: [12.58, 6.32, 13.78, 8.78], fd: 2 }, { r: [10.82, 5.05, 13.8, 6.2], fd: 3 }];
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
    for (const kd of ['soil', 'waste', 'vent', 'cold', 'hot'] as PipeKind[]) for (const pp of PIPES.filter(q => q.kind === kd)) {
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
    const tags: [number, number, string][] = [[9.7, 1.62, 'Chậu rửa bát (nóng + lạnh)'], [10.95, 5.45, 'Lavabo'], [13.5, 5.46, 'Máy giặt'], [11.26, 6.85, 'Xí WC1'], [13.18, 8.45, 'Xí WC2'], [10.95, 8.2, 'NL điện 50 L'], [12.24, 8.58, 'HKT']];
    g.font = `700 15px ${FONT}`;
    for (const [x, z, s2] of tags) { const [px, py] = PP(x, z), tw = g.measureText(s2).width + 10; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(px + 8, py - 30, tw, 22); g.fillStyle = INK; g.fillText(s2, px + 13, py - 13); }
    // right column: legend, 3D, notes
    const lx = planBox.X + planBox.W + 60, lw = PW - M - 30 - lx; let ly = t + 40;
    heading(g, 'KÝ HIỆU', lx, ly); ly += 10;
    for (const kd of ['cold', 'hot', 'soil', 'waste', 'vent'] as PipeKind[]) { ly += 32; g.strokeStyle = PIPE_STYLE[kd].css; g.lineWidth = 5; g.setLineDash(kd === 'vent' ? [3, 4] : []); g.beginPath(); g.moveTo(lx, ly - 6); g.lineTo(lx + 52, ly - 6); g.stroke(); g.setLineDash([]);
      g.fillStyle = INK; g.font = `600 17px ${FONT}`; g.fillText(PIPE_STYLE[kd].name, lx + 66, ly, 300); g.fillStyle = SOFT; g.font = `400 15px ${FONT}`; g.fillText(PIPE_STYLE[kd].spec, lx + 370, ly, lw - 370); }
    const keyBox = (draw: () => void, s2: string) => { ly += 32; draw(); g.fillStyle = INK; g.font = `600 17px ${FONT}`; g.fillText(s2, lx + 66, ly, lw - 66); };
    keyBox(() => { g.setLineDash([10, 6]); g.strokeStyle = ACC; g.lineWidth = 2; g.strokeRect(lx + 10, ly - 20, 32, 22); g.setLineDash([]); }, TANK.label);
    keyBox(() => { g.setLineDash([10, 6]); g.strokeStyle = '#e08a1e'; g.lineWidth = 2; g.strokeRect(lx + 10, ly - 20, 32, 22); g.setLineDash([]); }, SOLAR.label);
    keyBox(() => { g.fillStyle = '#ffe9a8'; g.fillRect(lx + 10, ly - 20, 32, 22); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(lx + 10, ly - 20, 32, 22); }, SHAFT.label + ' (góc WC1, có nắp thăm)');
    keyBox(() => { g.fillStyle = '#d23a2a'; g.beginPath(); g.moveTo(lx + 14, ly - 16); g.lineTo(lx + 38, ly - 2); g.lineTo(lx + 38, ly - 16); g.lineTo(lx + 14, ly - 2); g.closePath(); g.fill(); }, 'V1 van nóng NLMT · V2 van nóng bình điện (sau cửa thăm gác)');
    ly += 30; g.fillStyle = INK; g.font = `600 17px ${FONT}`; g.fillText('●  Ống đứng    ⊕  Phễu thu sàn (có bẫy mùi)    ⊠  Hố ga', lx + 10, ly);
    ly += 20; const img = renders.pipes3d, iw = lw, ih = iw * img.height / img.width; g.drawImage(img, lx, ly, iw, ih); g.strokeStyle = LINE; g.lineWidth = 1.5; g.strokeRect(lx, ly, iw, ih); ly += ih + 30;
    heading(g, 'GHI CHÚ', lx, ly); g.fillStyle = SOFT; g.font = `400 16px ${FONT}`; ly += 6;
    ['Nước nóng: mở V1 đóng V2 dùng năng lượng mặt trời; trời âm u mở V2 đóng V1 dùng bình điện.', 'Nước nóng cấp cho 2 sen, lavabo và chậu rửa bát; ống nóng bọc cách nhiệt.',
      'Téc trên chân cao 1.55 m (đáy +5.45), cao hơn bình NLMT để cấp tự chảy; áp sen ~3.5 m cột nước, yếu thì lắp bơm tăng áp.',
      'Vòi tưới cây ở tường hậu sau WC1, cao 0.6 m.', 'Ống thoát dưới nền dốc ≥ 2 %; xí vào bể phốt, nước sàn và bếp vào hố ga. Chi tiết khu WC: KT-10B.',
      'Vị trí ống sơ bộ — đội thi công cần đo lại tại hiện trường.'].forEach(l2 => { ly += 25; g.fillText('• ' + l2, lx, ly, lw); });
    pages.push(c);
  }
  {
    const { c, g, top: t } = page('CHI TIẾT THOÁT SÀN KHU WC', 'KT-10B', pages.length + 1, TOTAL, date, size);
    heading(g, 'KHU WC, LAVABO — THOÁT SÀN, CẤP NÓNG & VAN', zb.X, M + 70, 'Phóng to mặt bằng · mũi tên: hướng dốc sàn về phễu thu · số Ø: đường kính ống (mm)');
    g.globalAlpha = 0.3; g.drawImage(renders.planWC, zf.X, zf.Y, zf.W, zf.H); g.globalAlpha = 1;
    const ZP = (x: number, z: number) => { const w = W(x, z); return topXY(zf, w[0], w[1]); };
    g.save(); g.beginPath(); g.rect(zf.X, zf.Y, zf.W, zf.H); g.clip();
    g.globalAlpha = 0.6; drawBase(g, false, ZP); g.globalAlpha = 1;
    drawPlumb(g, (x, z) => ZP(map.mx(x), map.mz(z)), 1.5, true);
    g.restore(); g.strokeStyle = LINE; g.lineWidth = 1.5; g.strokeRect(zf.X, zf.Y, zf.W, zf.H);
    // right: floor-drain detail (schematic section) + table + notes
    const lx = zb.X + zb.W + 60, lw = PW - M - 30 - lx; let ly = t + 40;
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
    heading(g, 'PHỄU THU SÀN', lx, ly);
    ly = table(g, lx, ly + 24, [{ t: 'Vị trí', w: 200 }, { t: 'Thu nước từ', w: 380 }, { t: 'Ống ra', w: 120 }], [
      ['WC1 khu tắm', 'sen đứng, vách kính', 'Ø60'], ['WC1 khu khô', 'sàn quanh bồn cầu, cửa', 'Ø60'], ['WC2', 'sen + sàn (WC hẹp 1.2 m)', 'Ø60'], ['Lavabo', 'sàn trước lavabo, máy giặt tràn', 'Ø60'],
    ], 32, 16) + 34;
    heading(g, 'GHI CHÚ', lx, ly); g.fillStyle = SOFT; g.font = `400 16px ${FONT}`; ly += 6;
    ['Sàn WC hạ 30 mm so với sàn nhà, có gờ chặn nước ở cửa.', 'Mỗi phễu thu có bẫy mùi; ống gom Ø75 chạy dưới khu Lavabo về hố ga HG1.', 'Xí đi ống Ø90 riêng vào bể phốt, không chung với ống thoát sàn.',
      'Van V1 / V2 đặt ngay sau cửa thăm gác (phía Lavabo, trên cửa WC1) để thao tác.', 'Thử kín nước chống thấm 24 h trước khi lát gạch.'].forEach(l2 => { ly += 25; g.fillText('• ' + l2, lx, ly, lw); });
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
        const T = THO_SCREEN, wood = w[0] === 0 && w[1] === 4.95 && w[2] === 11.45 && !S2.alongX && S2.xc > map.mx(T.x0) && S2.xc < map.mx(T.x1);
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
