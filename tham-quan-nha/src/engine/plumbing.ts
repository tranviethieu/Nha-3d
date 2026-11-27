// Water supply and drainage (cấp thoát nước), in DEFAULT plan coords + height y (mapped with mx / mz like the
// electrical layout). house.ts builds the pipes in 3D (shown with the "Ống nước" button, house ghosted) and
// exportPdf.ts draws them on the plumbing sheets (KT-10 whole house, KT-10B WC block + floor-drain detail).
//
// Supply: the 1500 L tank on its 1.55 m stand on the flat WC roof feeds by gravity a cold main laid on the WC slab
// (storage loft, +2.62) and in the ceiling void (+3.45) to the kitchen, plus the solar water heater (bình năng
// lượng mặt trời) beside it, facing south. Hot water comes from either the solar heater or the 50 L electric heater
// in WC2: each line has a ball valve (V1 solar, V2 electric) and they meet at one manifold just behind the loft
// hatch (reachable from the Lavabo side), which feeds both showers, both lavabos and the kitchen sink.
// Drainage: toilets (soil, Ø90) to the septic tank behind the house; floor drains (each with an odour trap),
// lavabo and washing machine (waste, Ø60) along a collector under the Lavabo to manhole HG1; the kitchen sink to
// manhole HG2 by the facade and on to the ditch. The vent stack rises in the technical shaft in WC2's back corner.

export type PipeKind = 'cold' | 'hot' | 'soil' | 'waste' | 'vent';
export interface Pipe { kind: PipeKind; d: number; pts: [number, number, number][]; note?: string }

const LOFT = 2.62, H1 = 2.78, H2 = 2.95, VOID = 3.45, VOIDH = 3.37, FL = -0.3;
/** Roof equipment heights (flat roof +4.1; kept at the levels they had, owner's choice): tank bottom, solar-heater tank axis. */
export const TANK = { x0: 11.43, x1: 13.19, z: 8.2, bottom: 5.45, label: 'Téc inox 1500 L (chân cao 1.55 m)' };
export const SOLAR = { x0: 11.36, x1: 13.26, z0: 6.4, z1: 7.55, tankZ: 7.3, tankY: 5.1, label: 'Bình năng lượng mặt trời ~180 L (hướng Nam)' };

export const PIPES: Pipe[] = [
  // ---- cold supply (PPR PN10) ----
  { kind: 'cold', d: 32, note: 'ống đứng từ téc', pts: [[12.91, TANK.bottom, TANK.z], [12.91, LOFT, TANK.z], [12.91, LOFT, 7.55]] },
  { kind: 'cold', d: 25, note: 'cấp lạnh vào bình NLMT', pts: [[11.55, TANK.bottom, TANK.z], [11.55, 4.75, TANK.z], [11.55, 4.75, SOLAR.tankZ], [11.55, 4.87, SOLAR.tankZ]] },
  { kind: 'cold', d: 25, note: 'trục chính trên sàn gác WC', pts: [[12.91, LOFT, 7.55], [12.91, LOFT, 6.4], [10.9, LOFT, 6.4]] },
  { kind: 'cold', d: 25, note: 'trục đi trần ra bếp', pts: [[11.0, LOFT, 6.4], [11.0, VOID, 6.4], [11.0, VOID, 4.5], [9.85, VOID, 4.5], [9.85, VOID, 1.62], [9.92, VOID, 1.62], [9.92, 0.55, 1.62]] },
  { kind: 'cold', d: 20, note: 'bồn cầu WC1', pts: [[10.9, LOFT, 6.4], [10.9, LOFT, 7.32], [10.9, 0.25, 7.32]] },
  { kind: 'cold', d: 20, note: 'sen WC1', pts: [[10.9, LOFT, 7.32], [10.9, LOFT, 8.1], [10.9, 1.0, 8.1]] },
  { kind: 'cold', d: 20, note: 'lavabo WC1', pts: [[10.9, LOFT, 6.4], [10.9, LOFT, 6.5], [10.9, 0.6, 6.5]] },
  { kind: 'cold', d: 20, note: 'lavabo', pts: [[11.0, VOID, 5.6], [10.86, VOID, 5.6], [10.86, 0.6, 5.6]] },
  { kind: 'cold', d: 20, note: 'bồn cầu WC2', pts: [[12.91, LOFT, TANK.z], [12.91, LOFT, 8.7], [13.18, LOFT, 8.7], [13.18, 0.25, 8.7]] },
  { kind: 'cold', d: 20, note: 'sen WC2', pts: [[12.91, LOFT, 6.4], [12.62, LOFT, 6.4], [12.62, LOFT, 6.97], [12.62, 1.0, 6.97]] },
  { kind: 'cold', d: 20, note: 'trục ra máy giặt', pts: [[12.91, LOFT, 6.4], [13.72, LOFT, 6.4]] },
  { kind: 'cold', d: 20, note: 'máy giặt', pts: [[13.72, LOFT, 6.4], [13.72, VOID, 6.4], [13.72, VOID, 5.5], [13.72, 1.1, 5.5]] },
  { kind: 'cold', d: 20, note: 'bình nóng lạnh WC2', pts: [[13.72, LOFT, 6.4], [13.72, LOFT, 7.25], [13.72, 1.65, 7.25]] },
  { kind: 'cold', d: 20, note: 'vòi tưới cây (tường hồi tây, ngoài WC2)', pts: [[13.72, LOFT, 7.25], [13.72, LOFT, 8.3], [13.72, 0.6, 8.3], [14.06, 0.6, 8.3]] },
  // ---- hot water (PPR PN20, insulated): two sources, one valve each, one manifold behind the loft hatch ----
  { kind: 'hot', d: 25, note: 'nóng từ bình NLMT (qua van V1)', pts: [[13.15, 4.87, SOLAR.tankZ], [13.15, H1, SOLAR.tankZ], [13.15, H1, 6.6], [11.9, H1, 6.6]] },
  { kind: 'hot', d: 25, note: 'nóng từ bình điện WC2 (qua van V2)', pts: [[13.72, 1.65, 7.57], [13.72, H1, 7.57], [13.72, H1, 6.75], [11.9, H1, 6.75], [11.9, H1, 6.6]] },
  { kind: 'hot', d: 25, note: 'cụm chia nóng', pts: [[11.9, H1, 6.6], [11.9, H2, 6.6]] },
  { kind: 'hot', d: 20, note: 'nóng → sen WC2', pts: [[11.9, H2, 6.6], [12.66, H2, 6.6], [12.66, H2, 6.83], [12.66, 1.0, 6.83]] },
  { kind: 'hot', d: 20, note: 'nóng → sen WC1', pts: [[11.9, H2, 6.6], [11.25, H2, 6.6], [11.25, H2, 8.0], [10.98, H2, 8.0], [10.98, 1.0, 8.0]] },
  { kind: 'hot', d: 20, note: 'nóng → lavabo, chậu rửa bát', pts: [[11.25, H2, 6.6], [11.15, H2, 6.6], [11.15, VOIDH, 6.6], [11.15, VOIDH, 4.6], [9.78, VOIDH, 4.6], [9.78, VOIDH, 1.75], [9.92, VOIDH, 1.75], [9.92, 0.55, 1.75]] },
  { kind: 'hot', d: 20, note: 'nóng → lavabo WC1', pts: [[11.25, H2, 6.6], [10.95, H2, 6.6], [10.95, H2, 6.68], [10.95, 0.6, 6.68]] },
  { kind: 'hot', d: 20, note: 'nóng → lavabo', pts: [[11.15, VOIDH, 5.72], [10.86, VOIDH, 5.72], [10.86, 0.6, 5.72]] },
  // ---- soil: toilets → septic tank (uPVC Ø90, slope 2 %) ----
  { kind: 'soil', d: 90, note: 'bồn cầu WC1', pts: [[11.26, 0.0, 7.32], [11.26, FL, 7.32], [11.26, FL - 0.06, 9.6]] },
  { kind: 'soil', d: 90, note: 'bồn cầu WC2', pts: [[13.18, 0.0, 8.36], [13.18, FL, 8.36], [13.18, FL - 0.03, 9.6]] },
  // ---- waste: floor drains (with traps), lavabo, washing machine → collector under the Lavabo → HG1 ----
  { kind: 'waste', d: 75, note: 'ống gom thoát sàn (dưới khu Lavabo)', pts: [[13.6, FL + 0.06, 5.95], [10.77, FL, 5.95], [10.77, FL - 0.08, 9.6]] },
  { kind: 'waste', d: 60, note: 'phễu thu WC1 khu tắm', pts: [[11.6, -0.12, 8.3], [11.6, FL + 0.03, 8.3], [11.6, FL + 0.02, 5.95]] },
  { kind: 'waste', d: 60, note: 'phễu thu WC1 khu khô', pts: [[11.95, -0.12, 6.95], [11.95, FL + 0.04, 6.95], [11.6, FL + 0.03, 6.95]] },
  { kind: 'waste', d: 42, note: 'lavabo WC1', pts: [[11.0, 0.6, 6.59], [11.0, FL + 0.03, 6.59], [11.0, FL + 0.02, 5.95]] },
  { kind: 'waste', d: 60, note: 'phễu thu WC2', pts: [[12.95, -0.12, 6.75], [12.95, FL + 0.05, 6.75], [12.95, FL + 0.05, 5.95]] },
  { kind: 'waste', d: 60, note: 'phễu thu khu Lavabo', pts: [[12.2, -0.12, 5.62], [12.2, FL + 0.05, 5.62], [12.2, FL + 0.04, 5.95]] },
  { kind: 'waste', d: 42, note: 'lavabo', pts: [[11.05, 0.55, 5.6], [11.05, FL + 0.03, 5.6], [11.05, FL + 0.02, 5.95]] },
  { kind: 'waste', d: 60, note: 'máy giặt', pts: [[13.6, 0.6, 5.46], [13.6, FL + 0.06, 5.46], [13.6, FL + 0.06, 5.95]] },
  { kind: 'waste', d: 60, note: 'chậu rửa bếp → hố ga HG2 → mương', pts: [[9.65, 0.55, 1.62], [9.65, FL, 1.62], [9.65, FL - 0.04, -0.7], [9.65, FL - 0.1, -2.3]] },
  // ---- vent stack: under the floor to the technical shaft in WC2's back corner, then straight up past the roof ----
  { kind: 'vent', d: 60, note: 'thông hơi, ống đứng trong hộp kỹ thuật', pts: [[11.26, FL - 0.03, 8.66], [13.655, FL - 0.03, 8.66], [13.655, 4.55, 8.66]] },
];

/** Technical shaft: small tiled box in WC2's back corner by the outer wall, floor to the WC slab (vent continues up). */
export const SHAFT = { x0: 13.53, z0: 8.53, x1: 13.78, z1: 8.78, y1: 2.4, label: 'Hộp kỹ thuật 250 × 250' };
/** Floor drains (phễu thu sàn inox chống mùi, Ø90 mặt, ống ra Ø60) with their room / zone. */
export const FLOOR_DRAINS: { x: number; z: number; label: string }[] = [
  { x: 11.6, z: 8.3, label: 'WC1 khu tắm' }, { x: 11.95, z: 6.95, label: 'WC1 khu khô' }, { x: 12.95, z: 6.75, label: 'WC2' }, { x: 12.2, z: 5.62, label: 'Lavabo' },
];
/** Ball valves (van khoá) and the garden tap. */
export const VALVES: { x: number; y: number; z: number; label: string }[] = [
  { x: 12.5, y: H1, z: 6.6, label: 'V1 — van nóng NLMT' }, { x: 12.3, y: H1, z: 6.75, label: 'V2 — van nóng bình điện' },
];
/** n: the wall face the tap stands out from (+z back wall, +x west gable wall). */
export const TAPS: { x: number; y: number; z: number; n: '+x' | '+z'; label: string }[] = [{ x: 14.0, y: 0.6, z: 8.3, n: '+x', label: 'Vòi tưới cây' }];
/** Below-ground: septic tank (3 chambers) and manholes. */
export const SEPTIC = { x0: 11.0, z0: 9.45, x1: 13.5, z1: 10.75, depth: 1.6, label: 'Bể phốt 3 ngăn ~3 m³' };
export const MANHOLES: { x: number; z: number; label: string }[] = [{ x: 10.77, z: 9.75, label: 'HG1' }, { x: 9.65, z: -0.7, label: 'HG2' }];

export const PIPE_STYLE: Record<PipeKind, { color: number; css: string; name: string; spec: string }> = {
  cold: { color: 0x2f7fd8, css: '#2f7fd8', name: 'Cấp nước lạnh', spec: 'PPR PN10 Ø32 / Ø25 / Ø20' },
  hot: { color: 0xd8432f, css: '#d8432f', name: 'Cấp nước nóng (NLMT / bình điện)', spec: 'PPR PN20 Ø25 / Ø20, bọc cách nhiệt' },
  soil: { color: 0x6b4f3a, css: '#6b4f3a', name: 'Thoát xí (vào bể phốt)', spec: 'uPVC Ø90, dốc 2 %' },
  waste: { color: 0x7d8790, css: '#7d8790', name: 'Thoát sàn, lavabo, máy giặt, bếp', spec: 'uPVC Ø75 / Ø60 / Ø42, dốc 1–2 %' },
  vent: { color: 0x2aa876, css: '#2aa876', name: 'Ống thông hơi', spec: 'uPVC Ø60, cao hơn mái 0.6 m' },
};
