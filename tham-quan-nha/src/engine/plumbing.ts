// Water supply and drainage (cấp thoát nước), in DEFAULT plan coords + height y (mapped with mx / mz like the
// electrical layout). house.ts builds the pipes in 3D (shown with the "Ống nước" button, house ghosted) and
// exportPdf.ts draws them on the plumbing sheet.
//
// Supply: the 1500 L tank on the flat WC roof feeds by gravity a cold main laid on the WC slab (the storage loft,
// +2.62) and in the ceiling void (+3.45, above the +3.2 gypsum) to the kitchen. Drops to the fixtures run in wall
// chases. One 50 L heater in WC1 feeds both showers (WC2's hot line crosses the open loft) and the lavabo.
// Drainage: toilets (soil, Ø90) to the septic tank behind the house; floor drains, lavabo and washing machine
// (waste, Ø60) to a manhole beside it; the kitchen sink to a manhole by the facade and on to the ditch. The vent
// stack rises in the technical shaft (hộp kỹ thuật) in WC1's back corner through both slabs above the roof.

export type PipeKind = 'cold' | 'hot' | 'soil' | 'waste' | 'vent';
export interface Pipe { kind: PipeKind; d: number; pts: [number, number, number][]; note?: string }

const LOFT = 2.62, VOID = 3.45, FL = -0.3;

export const PIPES: Pipe[] = [
  // ---- cold supply (PPR PN10) ----
  { kind: 'cold', d: 32, note: 'ống đứng từ téc', pts: [[12.91, 4.1, 7.55], [12.91, LOFT, 7.55]] },
  { kind: 'cold', d: 25, note: 'trục chính trên sàn gác WC', pts: [[12.91, LOFT, 7.55], [12.91, LOFT, 6.4], [10.9, LOFT, 6.4]] },
  { kind: 'cold', d: 25, note: 'trục đi trần ra bếp', pts: [[11.0, LOFT, 6.4], [11.0, VOID, 6.4], [11.0, VOID, 4.5], [9.85, VOID, 4.5], [9.85, VOID, 1.62], [9.92, VOID, 1.62], [9.92, 0.55, 1.62]] },
  { kind: 'cold', d: 20, note: 'bồn cầu WC1', pts: [[10.9, LOFT, 6.4], [10.9, LOFT, 6.85], [10.9, 0.25, 6.85]] },
  { kind: 'cold', d: 20, note: 'sen WC1', pts: [[10.9, LOFT, 6.85], [10.9, LOFT, 8.1], [10.9, 1.0, 8.1]] },
  { kind: 'cold', d: 20, note: 'bình nóng lạnh WC1', pts: [[10.9, LOFT, 8.1], [10.9, LOFT, 8.44], [10.9, 1.65, 8.44]] },
  { kind: 'cold', d: 20, note: 'lavabo', pts: [[11.0, VOID, 5.6], [10.86, VOID, 5.6], [10.86, 0.6, 5.6]] },
  { kind: 'cold', d: 20, note: 'bồn cầu WC2', pts: [[12.91, LOFT, 7.55], [12.91, LOFT, 8.7], [13.18, LOFT, 8.7], [13.18, 0.25, 8.7]] },
  { kind: 'cold', d: 20, note: 'sen WC2', pts: [[12.91, LOFT, 6.4], [12.62, LOFT, 6.4], [12.62, LOFT, 6.97], [12.62, 1.0, 6.97]] },
  { kind: 'cold', d: 20, note: 'trục ra máy giặt', pts: [[12.91, LOFT, 6.4], [13.72, LOFT, 6.4]] },
  { kind: 'cold', d: 20, note: 'máy giặt', pts: [[13.72, LOFT, 6.4], [13.72, VOID, 6.4], [13.72, VOID, 5.5], [13.72, 1.1, 5.5]] },
  // ---- hot water from the shared WC1 heater (PPR PN20) ----
  { kind: 'hot', d: 20, note: 'nóng → sen WC1', pts: [[10.9, 1.65, 8.2], [10.95, 1.65, 8.2], [10.95, 1.0, 8.2]] },
  { kind: 'hot', d: 25, note: 'trục nóng lên gác', pts: [[10.95, 1.65, 8.2], [10.95, 2.56, 8.2], [10.95, 2.56, 6.6]] },
  { kind: 'hot', d: 20, note: 'nóng → lavabo', pts: [[10.95, 2.56, 6.6], [10.95, 2.56, 6.45], [10.95, 3.38, 6.45], [10.95, 3.38, 5.72], [10.86, 3.38, 5.72], [10.86, 0.6, 5.72]] },
  { kind: 'hot', d: 20, note: 'nóng → sen WC2 (qua gác)', pts: [[10.95, 2.56, 6.6], [12.66, 2.56, 6.6], [12.66, 2.56, 6.83], [12.66, 1.0, 6.83]] },
  // ---- soil: toilets → septic tank (uPVC Ø90, slope 2 %) ----
  { kind: 'soil', d: 90, note: 'bồn cầu WC1', pts: [[11.26, 0.0, 6.85], [11.26, FL, 6.85], [11.26, FL - 0.06, 9.6]] },
  { kind: 'soil', d: 90, note: 'bồn cầu WC2', pts: [[13.18, 0.0, 8.36], [13.18, FL, 8.36], [13.18, FL - 0.03, 9.6]] },
  // ---- waste: floor drains, lavabo, washing machine → manhole HG1 (uPVC Ø60) ----
  { kind: 'waste', d: 60, note: 'trục thoát sàn', pts: [[13.5, FL + 0.05, 5.5], [10.77, FL, 5.5], [10.77, FL - 0.08, 9.6]] },
  { kind: 'waste', d: 60, note: 'phễu thu WC1', pts: [[11.6, 0.0, 8.3], [11.6, FL + 0.03, 8.3], [11.6, FL + 0.02, 5.5]] },
  { kind: 'waste', d: 60, note: 'phễu thu WC2', pts: [[12.95, 0.0, 6.75], [12.95, FL + 0.04, 6.75], [12.95, FL + 0.04, 5.5]] },
  { kind: 'waste', d: 42, note: 'lavabo', pts: [[11.05, 0.55, 5.6], [11.05, FL + 0.03, 5.6], [11.05, FL + 0.03, 5.5]] },
  { kind: 'waste', d: 60, note: 'máy giặt', pts: [[13.6, 0.6, 5.46], [13.6, FL + 0.05, 5.46], [13.6, FL + 0.05, 5.5]] },
  { kind: 'waste', d: 60, note: 'chậu rửa bếp → hố ga HG2 → mương', pts: [[9.65, 0.55, 1.62], [9.65, FL, 1.62], [9.65, FL - 0.04, -0.7], [9.65, FL - 0.1, -2.3]] },
  // ---- vent stack in the technical shaft ----
  { kind: 'vent', d: 60, note: 'thông hơi bể phốt, ống đứng trong hộp kỹ thuật', pts: [[11.26, FL - 0.03, 8.58], [12.24, FL - 0.03, 8.58], [12.24, 4.55, 8.58]] },
];

/** Technical shaft: tiled box in WC1's back corner from the floor to the WC slab (pipes continue up in the loft). */
export const SHAFT = { x0: 12.04, z0: 8.38, x1: 12.44, z1: 8.78, y1: 2.4, label: 'Hộp kỹ thuật 400 × 400' };
/** Floor drains (phễu thu sàn). */
export const FLOOR_DRAINS: [number, number][] = [[11.6, 8.3], [12.95, 6.75], [13.0, 5.75]];
/** Below-ground: septic tank (3 chambers) and manholes, [x0, z0, x1, z1, depth]. */
export const SEPTIC = { x0: 11.0, z0: 9.45, x1: 13.5, z1: 10.75, depth: 1.6, label: 'Bể phốt 3 ngăn ~3 m³' };
export const MANHOLES: { x: number; z: number; label: string }[] = [{ x: 10.77, z: 9.75, label: 'HG1' }, { x: 9.65, z: -0.7, label: 'HG2' }];

export const PIPE_STYLE: Record<PipeKind, { color: number; css: string; name: string; spec: string }> = {
  cold: { color: 0x2f7fd8, css: '#2f7fd8', name: 'Cấp nước lạnh', spec: 'PPR PN10 Ø32 / Ø25 / Ø20' },
  hot: { color: 0xd8432f, css: '#d8432f', name: 'Cấp nước nóng', spec: 'PPR PN20 Ø20' },
  soil: { color: 0x6b4f3a, css: '#6b4f3a', name: 'Thoát xí (vào bể phốt)', spec: 'uPVC Ø90, dốc 2 %' },
  waste: { color: 0x7d8790, css: '#7d8790', name: 'Thoát nước sàn, lavabo, bếp', spec: 'uPVC Ø60 / Ø42, dốc 1–2 %' },
  vent: { color: 0x2aa876, css: '#2aa876', name: 'Ống thông hơi', spec: 'uPVC Ø60, cao hơn mái 0.6 m' },
};
