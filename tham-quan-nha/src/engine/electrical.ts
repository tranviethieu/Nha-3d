// Electrical layout (sơ đồ điện): switches, sockets, air conditioners, TVs, water heaters, the camera and the main
// panel, in DEFAULT plan coords on a wall face (n = the face's normal, pointing into the room). house.ts builds them in
// 3D (mapped with mx / mz like the structure), exportPdf.ts draws them on the electrical plan. Every room has two
// switches wired as a 2-way pair (công tắc 2 chiều): either one toggles that room's lights.
import type { Dir } from './layout';

export type ElecKind = 'switch2' | 'socket' | 'data' | 'ac' | 'tv' | 'heater' | 'heaterSw' | 'camera' | 'panel' | 'acOut';
export interface ElecItem { kind: ElecKind; room: string; x: number; z: number; y: number; n: Dir; circuit: string; note?: string }

export interface Circuit { id: string; name: string; breaker: string; cable: string; kw: number }
/** Distribution board: main breaker, then the branch circuits (sockets, wet areas behind 30 mA RCBOs). */
export const MAIN_BREAKER = { name: 'Aptomat tổng', breaker: 'MCB 2P 63A (6 kA)', cable: 'Cu/PVC 2 × 16 mm² từ công tơ', note: 'Kèm cắt sét lan truyền (SPD) 1P+N' };
export const CIRCUITS: Circuit[] = [
  { id: 'C1', name: 'Chiếu sáng khách, bếp, hiên, ngoài nhà', breaker: 'MCB 1P 10A', cable: '2 × 1.5 mm²', kw: 0.6 },
  { id: 'C2', name: 'Chiếu sáng phòng ngủ, thờ, hành lang, giặt, WC', breaker: 'MCB 1P 10A', cable: '2 × 1.5 mm²', kw: 0.6 },
  { id: 'C3', name: 'Ổ cắm phòng khách, phòng thờ, hiên', breaker: 'RCBO 1P+N 20A 30mA', cable: '2 × 2.5 mm²', kw: 2.0 },
  { id: 'C4', name: 'Ổ cắm bếp (tủ lạnh, hút mùi, đồ bếp)', breaker: 'RCBO 1P+N 20A 30mA', cable: '2 × 2.5 mm²', kw: 2.5 },
  { id: 'C5', name: 'Bếp từ đôi (ổ riêng)', breaker: 'MCB 2P 32A', cable: '2 × 4.0 mm²', kw: 4.0 },
  { id: 'C6', name: 'Ổ cắm phòng ngủ 1, phòng ngủ 2', breaker: 'RCBO 1P+N 20A 30mA', cable: '2 × 2.5 mm²', kw: 1.5 },
  { id: 'C7', name: 'Ổ cắm phòng ngủ 3, hành lang, giặt + rửa', breaker: 'RCBO 1P+N 20A 30mA', cable: '2 × 2.5 mm²', kw: 2.5 },
  { id: 'C8', name: 'Điều hoà phòng ngủ 1 9000 BTU', breaker: 'MCB 2P 16A', cable: '2 × 2.5 mm²', kw: 0.8 },
  { id: 'C9', name: 'Điều hoà phòng ngủ 2 9000 BTU', breaker: 'MCB 2P 16A', cable: '2 × 2.5 mm²', kw: 0.8 },
  { id: 'C10', name: 'Điều hoà phòng ngủ 3 9000 BTU', breaker: 'MCB 2P 16A', cable: '2 × 2.5 mm²', kw: 0.8 },
  { id: 'C11', name: 'Bình nóng lạnh 50 L (WC1, dùng chung 2 WC + lavabo)', breaker: 'RCBO 2P 20A 30mA', cable: '2 × 2.5 mm²', kw: 2.5 },
  { id: 'C12', name: 'Camera, wifi, mạng', breaker: 'MCB 1P 6A', cable: '2 × 1.5 mm²', kw: 0.1 },
];

const S = (room: string, x: number, z: number, y: number, n: Dir, circuit: string, note?: string): ElecItem => ({ kind: 'socket', room, x, z, y, n, circuit, note });
const SW = (room: string, x: number, z: number, y: number, n: Dir, circuit: string, note?: string): ElecItem => ({ kind: 'switch2', room, x, z, y, n, circuit, note });

export const ELEC: ElecItem[] = [
  // ---- Phòng khách ----
  { kind: 'panel', room: 'Phòng khách', x: 1.2, z: 4.62, y: 1.6, n: '+x', circuit: 'MAIN', note: 'Tủ điện tổng + aptomat tổng' },
  SW('Phòng khách', 1.2, 4.3, 1.25, '+x', 'C1', 'cạnh cửa chính (kèm đèn hiên, sân)'),
  SW('Phòng khách', 4.85, 4.95, 1.25, '-z', 'C1', 'phía phòng ngủ'),
  S('Phòng khách', 1.2, 0.6, 0.4, '+x', 'C3'),
  S('Phòng khách', 2.25, 0.2, 0.4, '+z', 'C3', 'đầu sofa'),
  S('Phòng khách', 4.65, 0.2, 0.4, '+z', 'C3', 'cuối sofa'),
  S('Phòng khách', 3.68, 4.95, 0.4, '-z', 'C3', 'bàn góc'),
  S('Phòng khách', 5.9, 1.9, 0.75, '-x', 'C3', 'tivi'), S('Phòng khách', 5.9, 2.7, 0.75, '-x', 'C3', 'đầu thu, loa'),
  { kind: 'data', room: 'Phòng khách', x: 5.9, z: 2.3, y: 0.75, n: '-x', circuit: '', note: 'mạng + truyền hình' },
  { kind: 'camera', room: 'Phòng khách', x: 5.75, z: 0.2, y: 2.95, n: '+z', circuit: 'C12', note: 'nhìn ra cửa chính' },
  // ---- Bếp + ăn ----
  SW('Bếp + ăn', 9.95, 3.75, 1.25, '-x', 'C1', 'lối vào hành lang'),
  SW('Bếp + ăn', 6.75, 4.95, 1.25, '-z', 'C1', 'phía phòng ăn'),
  S('Bếp + ăn', 9.95, 2.4, 1.1, '-x', 'C4', 'mặt bếp (cạnh chậu rửa)'),
  S('Bếp + ăn', 9.95, 3.1, 0.4, '-x', 'C4', 'tủ lạnh'),
  S('Bếp + ăn', 9.6, 0.2, 0.4, '+z', 'C5', 'bếp từ'),
  S('Bếp + ăn', 8.55, 0.2, 2.2, '+z', 'C4', 'máy hút mùi'),
  S('Bếp + ăn', 7.66, 0.2, 1.25, '+z', 'C4', 'nồi cơm, lò vi sóng'),
  S('Bếp + ăn', 6.55, 4.95, 0.4, '-z', 'C4', 'bàn ăn'),
  // ---- Phòng ngủ 1 ----
  SW('Phòng ngủ 1', 5.15, 5.16, 1.25, '+z', 'C2', 'cạnh cửa'),
  SW('Phòng ngủ 1', 2.65, 5.35, 0.9, '+x', 'C2', 'đầu giường'),
  S('Phòng ngủ 1', 4.67, 5.05, 0.6, '+z', 'C6', 'tab đầu giường'),
  S('Phòng ngủ 1', 2.9, 8.8, 0.4, '-z', 'C6', 'bàn học'), S('Phòng ngủ 1', 3.45, 8.8, 0.95, '-z', 'C6', 'trên mặt bàn học'),
  { kind: 'tv', room: 'Phòng ngủ 1', x: 6.4, z: 6.3, y: 1.35, n: '-x', circuit: 'C6', note: 'tivi 43"' },
  S('Phòng ngủ 1', 6.4, 6.05, 0.95, '-x', 'C6', 'tivi'),
  { kind: 'data', room: 'Phòng ngủ 1', x: 6.4, z: 6.55, y: 0.95, n: '-x', circuit: '' },
  { kind: 'ac', room: 'Phòng ngủ 1', x: 5.8, z: 8.8, y: 2.85, n: '-z', circuit: 'C8', note: '9000 BTU, trên tủ áo' },
  { kind: 'acOut', room: 'Phòng ngủ 1', x: 5.8, z: 9.0, y: 2.3, n: '+z', circuit: 'C8', note: 'cục nóng, tường hậu sau tủ áo' },
  // ---- Phòng ngủ 2 ----
  SW('Phòng ngủ 2', 8.75, 5.05, 1.25, '+z', 'C2', 'cạnh cửa'),
  SW('Phòng ngủ 2', 6.5, 8.6, 0.95, '+x', 'C2', 'đầu giường'),
  S('Phòng ngủ 2', 6.5, 8.6, 0.6, '+x', 'C6', 'tab đầu giường'), S('Phòng ngủ 2', 6.5, 6.3, 0.4, '+x', 'C6', 'cạnh giường'),
  S('Phòng ngủ 2', 9.6, 8.8, 0.4, '-z', 'C6', 'bàn học'),
  { kind: 'tv', room: 'Phòng ngủ 2', x: 10.72, z: 7.45, y: 1.35, n: '-x', circuit: 'C6', note: 'tivi 43"' },
  S('Phòng ngủ 2', 10.72, 7.2, 0.95, '-x', 'C6', 'tivi'),
  { kind: 'data', room: 'Phòng ngủ 2', x: 10.72, z: 7.7, y: 0.95, n: '-x', circuit: '' },
  { kind: 'ac', room: 'Phòng ngủ 2', x: 9.95, z: 8.8, y: 2.85, n: '-z', circuit: 'C9', note: '9000 BTU, trên bàn học' },
  { kind: 'acOut', room: 'Phòng ngủ 2', x: 9.95, z: 9.0, y: 2.3, n: '+z', circuit: 'C9', note: 'cục nóng, tường hậu' },
  // ---- Phòng ngủ 3 ----
  SW('Phòng ngủ 3', 11.25, 3.95, 1.25, '-z', 'C2', 'cạnh cửa'),
  SW('Phòng ngủ 3', 13.8, 0.85, 0.9, '-x', 'C2', 'đầu giường'),
  S('Phòng ngủ 3', 13.8, 0.45, 0.6, '-x', 'C7', 'tab đầu giường'), S('Phòng ngủ 3', 11.33, 0.2, 0.6, '+z', 'C7', 'tab đầu giường'),
  S('Phòng ngủ 3', 10.3, 0.2, 0.4, '+z', 'C7', 'bàn học'),
  { kind: 'tv', room: 'Phòng ngủ 3', x: 10.05, z: 2.45, y: 1.35, n: '+x', circuit: 'C7', note: 'tivi 43"' },
  S('Phòng ngủ 3', 10.05, 2.2, 0.95, '+x', 'C7', 'tivi'),
  { kind: 'data', room: 'Phòng ngủ 3', x: 10.05, z: 2.7, y: 0.95, n: '+x', circuit: '' },
  { kind: 'ac', room: 'Phòng ngủ 3', x: 13.8, z: 2.7, y: 2.85, n: '-x', circuit: 'C10', note: '9000 BTU, cuối giường' },
  { kind: 'acOut', room: 'Phòng ngủ 3', x: 14.0, z: 2.7, y: 2.3, n: '+x', circuit: 'C10', note: 'cục nóng, tường hồi tây' },
  // ---- Phòng thờ ----
  SW('Phòng thờ', 2.4, 5.05, 1.25, '+z', 'C2', 'cạnh cửa'),
  SW('Phòng thờ', 0.2, 5.35, 1.25, '+x', 'C2', 'đầu phòng'),
  S('Phòng thờ', 2.55, 7.98, 1.3, '-x', 'C3', 'đèn thờ'), S('Phòng thờ', 0.2, 8.4, 0.4, '+x', 'C3'),
  // ---- Hành lang ----
  SW('Hành lang', 10.3, 4.95, 1.25, '-z', 'C2', 'từ bếp'), SW('Hành lang', 13.5, 4.95, 1.25, '-z', 'C2', 'cạnh cửa hông'),
  S('Hành lang', 11.6, 4.05, 0.4, '+z', 'C7', 'máy hút bụi'),
  // ---- Giặt + rửa ----
  SW('Lavabo', 11.35, 5.05, 1.25, '+z', 'C2', 'lối vào'), SW('Lavabo', 13.35, 5.05, 1.25, '+z', 'C2', 'lối vào'),
  S('Lavabo', 10.82, 6.15, 1.2, '+x', 'C7', 'máy sấy tóc'), S('Lavabo', 13.8, 6.1, 1.25, '-x', 'C7', 'máy giặt'),
  // ---- WC1, WC2: one switch outside, one inside; ONE water heater (in WC1) shared by both WCs + the lavabo ----
  SW('WC1', 11.35, 6.2, 1.25, '-z', 'C2', 'ngoài cửa'), SW('WC1', 11.35, 6.32, 1.25, '+z', 'C2', 'trong WC'),
  { kind: 'heaterSw', room: 'WC1', x: 11.12, z: 6.2, y: 1.25, n: '-z', circuit: 'C11', note: 'công tắc 2 cực có đèn báo' },
  { kind: 'heater', room: 'WC1', x: 10.84, z: 8.32, y: 2.05, n: '+x', circuit: 'C11', note: '50 L, dùng chung 2 WC' },
  SW('WC2', 12.72, 6.2, 1.25, '-z', 'C2', 'ngoài cửa'), SW('WC2', 13.65, 6.32, 1.25, '+z', 'C2', 'trong WC'),
  // ---- ngoài nhà ----
  S('Sảnh', 1.0, 0.6, 0.4, '-x', 'C3', 'ổ ngoài trời có nắp IP44'),
];

export const ELEC_NAMES: Record<ElecKind, string> = {
  switch2: 'Công tắc 2 chiều', socket: 'Ổ cắm đôi 3 chấu', data: 'Ổ mạng + truyền hình', ac: 'Điều hoà (cục lạnh)', tv: 'Tivi treo tường',
  heater: 'Bình nóng lạnh', heaterSw: 'Công tắc nóng lạnh 2 cực', camera: 'Camera an ninh', panel: 'Tủ điện tổng', acOut: 'Cục nóng điều hoà',
};
