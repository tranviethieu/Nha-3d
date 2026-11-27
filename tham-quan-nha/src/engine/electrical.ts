// Electrical layout (sơ đồ điện): switches, sockets, air conditioners, TVs, water heaters, the camera and the main
// panel, in DEFAULT plan coords on a wall face (n = the face's normal, pointing into the room). house.ts builds them in
// 3D (mapped with mx / mz like the structure), exportPdf.ts draws them on the electrical plan. Most rooms have two
// switches wired as a 2-way pair (công tắc 2 chiều): either one toggles that room's lights. PN1 / PN2 instead have
// two 1-way switches (switch1): by the door for the 4 corner downlights, beside the bedside-table socket for the downlight
// at the foot of the bed (its own light group, `bedLamp(room)`). The ancestor room has a single 1-way switch by its entrance.
import { THO_X, type Dir } from './layout';

export type ElecKind = 'switch2' | 'switch1' | 'socket' | 'data' | 'ac' | 'tv' | 'heater' | 'heaterSw' | 'camera' | 'panel' | 'acOut' | 'wifi' | 'fanCtl';
export interface ElecItem { kind: ElecKind; room: string; x: number; z: number; y: number; n: Dir; circuit: string; note?: string;
  /** light group a switch toggles (default: the room) */ lamp?: string;
  /** wifi: stands on a surface at height y (the main router) instead of hanging on the wall */ onTop?: boolean;
  /** camera on wifi: only a power socket beside it, no LAN run */ wireless?: boolean }
/** Light group of a bedroom's single downlight (Φ75), switched from the bedside table. */
export const bedLamp = (room: string) => `${room} (downlight)`;
/** Bedrooms (owner's choice): 4 corner spotlights Φ90 0.6 m from both walls (the room's group: PN1 / PN2 on a 1-way
 *  switch by the door, PN3 on its 2-way pair door + bedside) and one downlight Φ75 (its own group, 1-way switch at the
 *  bedside table): PN1 / PN2 in front of the window 0.5 m off the back wall, PN3 in the middle of the room's width, 0.5 m off the wardrobe wall (owner's choice). */
export const BED_LIGHTS: Record<string, { x: number; z: number; own: boolean }> = {
  'Phòng ngủ 1': { x: 4.525, z: 8.3, own: true }, 'Phòng ngủ 2': { x: 8.61, z: 8.3, own: true }, 'Phòng ngủ 3': { x: 11.925, z: 3.45, own: true },
};
/** Where the power cable and the fibre come into the house (owner's choice): the ancestor room's outer corner by the
 *  porch (default plan coords); power runs to the panel by the main door, the fibre to the modem on the wine cabinet. */
export const SERVICE_IN = { x: -0.06, z: 5.07, note: 'Điểm vào điện + cáp quang (góc phòng thờ, giáp hiên)' };
/** Outdoor light groups, each on its own 1-way switch in the gang by the main door (owner's choice). */
export const OUT_PORCH = 'Đèn trần hiên', OUT_WASH = 'Đèn hắt tường', OUT_EAVE = 'Đèn âm trần mái đua';

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
  { id: 'C11', name: 'Bình nóng lạnh 50 L (WC2, dùng chung 2 WC + lavabo)', breaker: 'RCBO 2P 20A 30mA', cable: '2 × 2.5 mm²', kw: 2.5 },
  { id: 'C12', name: 'Camera, wifi, mạng', breaker: 'MCB 1P 6A', cable: '2 × 1.5 mm²', kw: 0.1 },
];

const S = (room: string, x: number, z: number, y: number, n: Dir, circuit: string, note?: string): ElecItem => ({ kind: 'socket', room, x, z, y, n, circuit, note });
const SW = (room: string, x: number, z: number, y: number, n: Dir, circuit: string, note?: string): ElecItem => ({ kind: 'switch2', room, x, z, y, n, circuit, note });
const SW1 = (room: string, x: number, z: number, y: number, n: Dir, circuit: string, note: string, lamp?: string): ElecItem => ({ kind: 'switch1', room, x, z, y, n, circuit, note, lamp });

export const ELEC: ElecItem[] = [
  // ---- Phòng khách ----
  { kind: 'panel', room: 'Phòng khách', x: 1.2, z: 4.62, y: 1.6, n: '+x', circuit: 'MAIN', note: 'Tủ điện tổng + aptomat tổng' },
  SW('Phòng khách', 1.2, 4.3, 1.25, '+x', 'C1', 'cạnh cửa chính'),
  // three 1-way switches beside it for the outdoor lights
  SW1('Sảnh', 1.2, 4.44, 1.25, '+x', 'C1', 'đèn trần hiên (bóng to giữa hiên)', OUT_PORCH), SW1('Sảnh', 1.2, 4.55, 1.25, '+x', 'C1', '4 đèn hắt tường mặt tiền', OUT_WASH),
  SW1('Sảnh', 1.2, 4.66, 1.25, '+x', 'C1', 'đèn âm trần mái đua quanh nhà', OUT_EAVE),
  { kind: 'fanCtl', room: 'Phòng khách', x: 1.2, z: 4.15, y: 1.25, n: '+x', circuit: 'C1', note: 'hộp số quạt trần phòng khách' },
  SW('Phòng khách', 6.25, 4.95, 1.25, '-z', 'C1', 'tường giữa, cạnh cụm công tắc bếp'),
  S('Phòng khách', 1.2, 0.6, 0.4, '+x', 'C3'),
  S('Phòng khách', 2.25, 0.2, 0.4, '+z', 'C3', 'đầu sofa'),
  S('Phòng khách', 4.65, 0.2, 0.4, '+z', 'C3', 'cuối sofa'),
  S('Phòng khách', 3.68, 4.95, 0.4, '-z', 'C3', 'bàn góc'),
  S('Phòng khách', 5.9, 1.9, 0.75, '-x', 'C3', 'tivi'), S('Phòng khách', 5.9, 2.7, 0.75, '-x', 'C3', 'đầu thu, loa'),
  { kind: 'data', room: 'Phòng khách', x: 5.9, z: 2.3, y: 0.75, n: '-x', circuit: '', note: 'mạng + truyền hình' },
  { kind: 'camera', room: 'Phòng khách', x: 5.75, z: 0.2, y: 2.95, n: '+z', circuit: 'C12', note: 'nhìn ra cửa chính' },
  // main wifi router (củ wifi tổng) on top of the wine cabinet (top +2.8), its socket + incoming line on the facade wall above
  { kind: 'wifi', room: 'Phòng khách', x: 5.7, z: 0.62, y: 2.8, n: '-x', circuit: 'C12', note: 'củ wifi tổng, trên nóc tủ rượu', onTop: true },
  S('Phòng khách', 5.6, 0.2, 2.9, '+z', 'C12', 'nguồn củ wifi tổng'),
  { kind: 'data', room: 'Phòng khách', x: 5.5, z: 0.2, y: 2.9, n: '+z', circuit: '', note: 'cáp quang / mạng vào' },
  // ---- Bếp + ăn ----
  SW('Bếp + ăn', 7.3, 0.2, 1.25, '+z', 'C1', 'cạnh cửa ngách bếp'),
  SW('Bếp + ăn', 6.75, 4.95, 1.25, '-z', 'C1', 'phía phòng ăn'),
  { kind: 'fanCtl', room: 'Bếp + ăn', x: 6.9, z: 4.95, y: 1.25, n: '-z', circuit: 'C1', note: 'hộp số quạt trần bàn ăn' },
  S('Bếp + ăn', 9.95, 2.4, 1.1, '-x', 'C4', 'mặt bếp (cạnh chậu rửa)'),
  S('Bếp + ăn', 9.95, 3.1, 0.4, '-x', 'C4', 'tủ lạnh'),
  S('Bếp + ăn', 9.6, 0.2, 0.4, '+z', 'C5', 'bếp từ'),
  S('Bếp + ăn', 8.55, 0.2, 2.2, '+z', 'C4', 'máy hút mùi'),
  S('Bếp + ăn', 7.66, 0.2, 1.25, '+z', 'C4', 'nồi cơm, lò vi sóng'),
  S('Bếp + ăn', 6.55, 4.95, 0.4, '-z', 'C4', 'bàn ăn'),
  // ---- Phòng ngủ 1 ----
  SW1('Phòng ngủ 1', 4.82, 5.05, 1.25, '+z', 'C2', 'cạnh cửa: 4 spotlight góc'),
  SW1('Phòng ngủ 1', 4.77, 5.05, 0.6, '+z', 'C2', 'tab đầu giường: downlight cạnh cửa sổ', bedLamp('Phòng ngủ 1')),
  S('Phòng ngủ 1', 4.67, 5.05, 0.6, '+z', 'C6', 'tab đầu giường'),
  S('Phòng ngủ 1', 5.7, 8.8, 0.4, '-z', 'C6', 'bàn học (dưới điều hoà)'), S('Phòng ngủ 1', 6.25, 8.8, 0.95, '-z', 'C6', 'trên mặt bàn học'),
  { kind: 'data', room: 'Phòng ngủ 1', x: 6.35, z: 8.8, y: 0.95, n: '-z', circuit: '', note: 'mạng LAN, cạnh ổ bàn học' },
  S('Phòng ngủ 1', 5.41, 8.8, 0.4, '-z', 'C6', 'tường hậu, giữa cửa sổ và bàn học'),
  { kind: 'tv', room: 'Phòng ngủ 1', x: 3.21, z: 8.8, y: 1.35, n: '-z', circuit: 'C6', note: 'tivi 43"' },
  S('Phòng ngủ 1', 2.96, 8.8, 0.95, '-z', 'C6', 'tivi'),
  { kind: 'ac', room: 'Phòng ngủ 1', x: 5.95, z: 8.8, y: 2.85, n: '-z', circuit: 'C8', note: '9000 BTU, trên tủ áo' },
  { kind: 'acOut', room: 'Phòng ngủ 1', x: 5.95, z: 9.0, y: 2.3, n: '+z', circuit: 'C8', note: 'cục nóng, tường hậu sau tủ áo' },
  // ---- Phòng ngủ 2 ----
  SW1('Phòng ngủ 2', 9.07, 5.05, 1.25, '+z', 'C2', 'cạnh cửa: 4 spotlight góc'),
  SW1('Phòng ngủ 2', 8.78, 5.05, 0.6, '+z', 'C2', 'tab đầu giường: downlight cạnh cửa sổ', bedLamp('Phòng ngủ 2')),
  S('Phòng ngủ 2', 8.68, 5.05, 0.6, '+z', 'C6', 'tab đầu giường'),
  S('Phòng ngủ 2', 9.97, 8.8, 0.4, '-z', 'C6', 'bàn học (dưới điều hoà)'), S('Phòng ngủ 2', 10.52, 8.8, 0.95, '-z', 'C6', 'trên mặt bàn học'),
  { kind: 'data', room: 'Phòng ngủ 2', x: 10.62, z: 8.8, y: 0.95, n: '-z', circuit: '', note: 'mạng LAN, cạnh ổ bàn học' },
  S('Phòng ngủ 2', 9.6, 8.8, 0.4, '-z', 'C6', 'tường hậu, giữa cửa sổ và bàn học'),
  { kind: 'tv', room: 'Phòng ngủ 2', x: 7.16, z: 8.8, y: 1.35, n: '-z', circuit: 'C6', note: 'tivi 43"' },
  S('Phòng ngủ 2', 6.91, 8.8, 0.95, '-z', 'C6', 'tivi'),
  { kind: 'ac', room: 'Phòng ngủ 2', x: 10.27, z: 8.8, y: 2.85, n: '-z', circuit: 'C9', note: '9000 BTU, trên tủ áo' },
  { kind: 'acOut', room: 'Phòng ngủ 2', x: 10.27, z: 9.0, y: 2.3, n: '+z', circuit: 'C9', note: 'cục nóng, tường hậu sau tủ áo' },
  // ---- Phòng ngủ 3 ----
  SW('Phòng ngủ 3', 11.25, 3.95, 1.25, '-z', 'C2', 'cạnh cửa'),
  // bed against the west wall, one bedside table (11.55–12.0): the 2-way switch and the downlight switch on it
  SW('Phòng ngủ 3', 11.78, 0.2, 0.6, '+z', 'C2', 'tab đầu giường: 4 spotlight góc'),
  SW1('Phòng ngủ 3', 11.92, 0.2, 0.6, '+z', 'C2', 'tab đầu giường: downlight giữa phòng', bedLamp('Phòng ngủ 3')),
  S('Phòng ngủ 3', 11.63, 0.2, 0.6, '+z', 'C7', 'tab đầu giường'),
  S('Phòng ngủ 3', 10.3, 0.2, 0.4, '+z', 'C7', 'bàn học'),
  { kind: 'data', room: 'Phòng ngủ 3', x: 10.4, z: 0.2, y: 0.4, n: '+z', circuit: '', note: 'mạng LAN, cạnh ổ bàn học' },
  { kind: 'tv', room: 'Phòng ngủ 3', x: 10.05, z: 2.45, y: 1.35, n: '+x', circuit: 'C7', note: 'tivi 43"' },
  S('Phòng ngủ 3', 10.05, 2.2, 0.95, '+x', 'C7', 'tivi'),
  { kind: 'ac', room: 'Phòng ngủ 3', x: 13.8, z: 2.7, y: 2.85, n: '-x', circuit: 'C10', note: '9000 BTU, cuối giường' },
  { kind: 'acOut', room: 'Phòng ngủ 3', x: 14.0, z: 2.7, y: 2.3, n: '+x', circuit: 'C10', note: 'cục nóng, tường hồi tây' },
  // ---- Phòng thờ ----
  SW1('Phòng thờ', 2.45, 5.05, 1.25, '+z', 'C2', 'cạnh lối vào, trên trụ vách gỗ (1 chiều)'),
  S('Phòng thờ', 2.55, 7.98, 1.3, '-x', 'C3', 'đèn thờ'), S('Phòng thờ', 0.14, 8.4, 0.4, '+x', 'C3'),
  // ---- Hành lang ----
  SW('Hành lang', 10.3, 4.95, 1.25, '-z', 'C2', 'từ bếp'),
  // secondary wifi access point on the corridor wall beside the WC / Lavabo entrance (owner's choice), its socket beside it
  { kind: 'wifi', room: 'Hành lang', x: 11.25, z: 4.95, y: 2.4, n: '-z', circuit: 'C12', note: 'wifi phụ, hành lang cạnh WC' },
  S('Hành lang', 11.0, 4.95, 2.4, '-z', 'C12', 'nguồn wifi phụ'), SW('Hành lang', 13.5, 4.95, 1.25, '-z', 'C2', 'cạnh cửa hông'),
  SW1('Lavabo', 13.36, 4.95, 1.25, '-z', 'C2', 'cạnh công tắc hành lang: 1 đèn khu giặt + rửa'),
  S('Hành lang', 11.6, 4.05, 0.4, '+z', 'C7', 'máy hút bụi'),
  // ---- Giặt + rửa ----
  S('Lavabo', 10.82, 6.0, 1.2, '+x', 'C7', 'máy sấy tóc'), S('Lavabo', 13.8, 5.9, 1.25, '-x', 'C7', 'máy giặt'),
  // ---- WC1, WC2: one 1-way switch outside each door; ONE water heater (in WC2) shared by both WCs + the lavabos ----
  SW1('WC1', 11.35, 6.05, 1.25, '-z', 'C2', 'ngoài cửa (1 chiều)'), SW1('WC2', 12.72, 6.05, 1.25, '-z', 'C2', 'ngoài cửa (1 chiều)'),
  { kind: 'heaterSw', room: 'WC2', x: 12.5, z: 6.05, y: 1.25, n: '-z', circuit: 'C11', note: 'công tắc 2 cực có đèn báo' },
  { kind: 'heater', room: 'WC2', x: 13.78, z: 7.41, y: 2.05, n: '-x', circuit: 'C11', note: '50 L, dùng chung 2 WC' },
  // ---- ngoài nhà ----
  S('Sảnh', 1.0, 0.6, 0.4, '-x', 'C3', 'ổ ngoài trời có nắp IP44'),
  // two outdoor wifi cameras under the eaves (owner's choice), each with only an outdoor socket beside it
  { kind: 'camera', room: 'Ngoài nhà', x: THO_X, z: 8.75, y: 2.9, n: '-x', circuit: 'C12', note: 'camera ngoài trời wifi, góc phòng thờ', wireless: true },
  S('Ngoài nhà', THO_X, 8.55, 2.9, '-x', 'C12', 'nguồn camera góc phòng thờ (IP65)'),
  { kind: 'camera', room: 'Ngoài nhà', x: 14.0, z: 0.35, y: 2.9, n: '+x', circuit: 'C12', note: 'camera ngoài trời wifi, sau nhà cạnh P. ngủ 3', wireless: true },
  S('Ngoài nhà', 14.0, 0.55, 2.9, '+x', 'C12', 'nguồn camera sau nhà (IP65)'),
];

export const ELEC_NAMES: Record<ElecKind, string> = {
  switch2: 'Công tắc 2 chiều', switch1: 'Công tắc 1 chiều', socket: 'Ổ cắm đôi 3 chấu', data: 'Ổ mạng + truyền hình', ac: 'Điều hoà (cục lạnh)', tv: 'Tivi treo tường',
  heater: 'Bình nóng lạnh', heaterSw: 'Công tắc nóng lạnh 2 cực', camera: 'Camera an ninh', panel: 'Tủ điện tổng', acOut: 'Cục nóng điều hoà', wifi: 'Bộ phát wifi', fanCtl: 'Hộp số quạt trần',
};
