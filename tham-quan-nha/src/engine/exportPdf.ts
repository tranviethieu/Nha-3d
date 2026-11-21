// "Xuất PDF": a set of A3 drawing sheets built from the live model (cover, floor plan with dimensions, four
// elevations, roof plan, preliminary structure, door / window and furniture schedules). Each sheet is drawn on a
// canvas (so Vietnamese text renders with the system fonts) around off-screen renders from Game.snapshot, and the
// sheets are packed as JPEG pages into a small hand-written PDF (no PDF library needed).
import type { Game } from './Game';
import { COLOR_SPECS, MAIN_SIDE, fmtM, type Dir } from './layout';

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
  const TOTAL = 10;

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
  for (const v of views3d) await snap(v.k, { pos: v.pos, target: v.target, fov: v.fov }, { w: GW, h: GH, roof: v.roof });

  onProgress('Đang dàn trang…');
  const pages: HTMLCanvasElement[] = [];

  // ---------------- KT-00 cover ----------------
  {
    const { c, g, top: t } = page('TRANG BÌA & TỔNG QUAN', 'KT-00', 1, TOTAL, date, size);
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
      ['Cao độ đỉnh mái chính', `${level(ridge)} m`],
      ['Cốt nền / sân', '±0.000 / −0.300'],
      ['Mái chính (dài × rộng, dốc)', `${fmtM(F.L)} × ${fmtM(F.W)} m, ${Math.round(Math.atan(F.t) * 180 / Math.PI)}°`],
      ['Hướng', 'Mặt tiền Nam, sảnh Đông'],
      ['Đảo ngược bố cục', MZ === null ? 'Không' : 'Có (sảnh ở phía bên kia)'],
    ]) + 50;
    heading(g, 'DANH MỤC BẢN VẼ', x, y += 10);
    table(g, x, y + 30, [{ t: 'Ký hiệu', w: 150 }, { t: 'Tên bản vẽ', w: 680 }], [
      ['KT-00', 'Trang bìa & tổng quan'], ['KT-01', 'Mặt bằng bố trí & kích thước'], ['KT-02', 'Mặt đứng chính (Nam) & mặt đứng sau (Bắc)'],
      ['KT-03', 'Mặt đứng bên (Đông, Tây)'], ['KT-04', 'Mặt bằng mái'], ['KT-05', 'Kết cấu sơ bộ'], ['KT-06', 'Thống kê cửa đi, cửa sổ & phòng'], ['KT-07', 'Thống kê nội thất'], ['KT-08', 'Phối cảnh ngoại thất 3D'], ['KT-09', 'Phối cảnh nội thất 3D'],
    ], 38, 20);
    pages.push(c);
  }

  // ---------------- KT-01 floor plan ----------------
  const codes = { doors: new Map<string, string>(), wins: new Map<string, string>() };
  d.openings.doors.filter(o => !o.hidden).forEach((o, i) => codes.doors.set(o.id, `D${i + 1}`));
  d.openings.wins.filter(o => !o.hidden).forEach((o, i) => codes.wins.set(o.id, `S${i + 1}`));
  {
    const { c, g } = page('MẶT BẰNG BỐ TRÍ & KÍCH THƯỚC', 'KT-01', 2, TOTAL, date, size);
    heading(g, 'MẶT BẰNG TẦNG 1', planBox.X, M + 70, 'Cắt ngang ở cao độ +1.300 · kích thước tính bằng m');
    g.drawImage(renders.plan, pf.X, pf.Y, pf.W, pf.H);
    const P = (x: number, z: number) => { const w = W(x, z); return topXY(pf, w[0], w[1]); };
    const poly = (pts: [number, number][], fill: string) => { g.fillStyle = fill; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.closePath(); g.fill(); };
    const rectE = (x0: number, z0: number, x1: number, z1: number, fill: string) => poly([P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)], fill);
    // walls (cut) in dark grey, then openings cleared and drawn
    for (const w of d.walls) rectE(map.mx(w[0]), map.mz(w[1]), map.mx(w[2]), map.mz(w[3]), '#2b3038');
    g.lineWidth = 2;
    for (const w of map.windows) {
      if (w.hidden) continue; const r = w.rect, alongX = (r[2] - r[0]) > (r[3] - r[1]);
      const x0 = map.mx(r[0]), x1 = map.mx(r[2]), z0 = map.mz(r[1] + 0.02), z1 = map.mz(r[3] - 0.02);
      rectE(x0, z0, x1, z1, '#ffffff');
      g.strokeStyle = ACC;
      for (const f of [0.35, 0.65]) { const [a, b] = alongX ? [P(x0, z0 + (z1 - z0) * f), P(x1, z0 + (z1 - z0) * f)] : [P(x0 + (x1 - x0) * f, z0), P(x0 + (x1 - x0) * f, z1)]; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
      g.strokeStyle = INK; g.strokeRect(Math.min(P(x0, z0)[0], P(x1, z1)[0]), Math.min(P(x0, z0)[1], P(x1, z1)[1]), Math.abs(P(x1, z1)[0] - P(x0, z0)[0]), Math.abs(P(x1, z1)[1] - P(x0, z0)[1]));
      // tag outside the wall
      const out = alongX ? (r[1] < 4.5 ? -0.75 : 0.75) : (r[0] < 7 ? -0.75 : 0.75);
      const [tx, ty] = alongX ? P((x0 + x1) / 2, map.mz((r[1] + r[3]) / 2) + out) : P(map.mx((r[0] + r[2]) / 2) + out, (z0 + z1) / 2);
      g.fillStyle = '#fff'; g.strokeStyle = ACC; g.lineWidth = 2; g.beginPath(); g.ellipse(tx, ty, 26, 18, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = ACC; g.font = `700 18px ${FONT}`; g.textAlign = 'center'; g.fillText(codes.wins.get(w.spec.id)!, tx, ty + 6); g.textAlign = 'left';
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
      const mid = (a0 + a1) / 2, [tx, ty] = along === 'x' ? P(map.mx(mid), map.mz(sp.at) + (sp.od === '+z' ? -0.45 : 0.45)) : P(map.mx(sp.at) + (sp.od === '-x' ? 0.55 : -0.55), map.mz(mid));
      g.fillStyle = '#fff'; g.strokeStyle = '#b4532a'; g.lineWidth = 2; g.fillRect(tx - 24, ty - 16, 48, 30); g.strokeRect(tx - 24, ty - 16, 48, 30);
      g.fillStyle = '#b4532a'; g.font = `700 18px ${FONT}`; g.textAlign = 'center'; g.fillText(codes.doors.get(sp.id)!, tx, ty + 6); g.textAlign = 'left';
    }
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
  for (const [k, pair, code, n] of [['KT-02', ['S', 'N'], 'MẶT ĐỨNG CHÍNH & SAU', 3], ['KT-03', ['E', 'W'], 'MẶT ĐỨNG BÊN', 4]] as const) {
    const { c, g, top: t, bottom } = page(code, k, n, TOTAL, date, size);
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
    const { c, g } = page('MẶT BẰNG MÁI', 'KT-04', 5, TOTAL, date, size);
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
    const { c, g, top: t } = page('KẾT CẤU SƠ BỘ', 'KT-05', 6, TOTAL, date, size);
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

  // ---------------- KT-06 schedules: doors, windows ----------------
  {
    const { c, g, top: t } = page('THỐNG KÊ CỬA ĐI, CỬA SỔ & PHÒNG', 'KT-06', 7, TOTAL, date, size);
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
    const { c, g, top: t } = page('THỐNG KÊ NỘI THẤT', 'KT-07', 8, TOTAL, date, size);
    heading(g, 'THỐNG KÊ NỘI THẤT & THIẾT BỊ', M + 60, t + 40, 'Kích thước bao: rộng (theo trục Đông–Tây) × sâu × cao, mm');
    const rows = [...d.objects].sort((a, b) => a.room.localeCompare(b.room, 'vi')).map((o, i) => [String(i + 1), o.label, o.room, `${mm(o.size[0])} × ${mm(o.size[1])} × ${mm(o.size[2])}`]);
    const half = Math.ceil(rows.length / 2), cols = [{ t: 'TT', w: 70 }, { t: 'Tên', w: 470 }, { t: 'Phòng', w: 250 }, { t: 'Kích thước (mm)', w: 330 }];
    table(g, M + 60, t + 110, cols, rows.slice(0, half), 38, 19);
    table(g, M + 60 + 1150, t + 110, cols, rows.slice(half), 38, 19);
    pages.push(c);
  }

  // ---------------- KT-08 / KT-09 3D views (3 x 2 grid) ----------------
  for (const [code, title, prefix, n] of [['KT-08', 'PHỐI CẢNH NGOẠI THẤT 3D', 'x', 9], ['KT-09', 'PHỐI CẢNH NỘI THẤT 3D', 'i', 10]] as const) {
    const { c, g, top: t, bottom } = page(title, code, n, TOTAL, date, size);
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
