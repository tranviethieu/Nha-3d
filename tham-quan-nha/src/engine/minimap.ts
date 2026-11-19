import type { House } from './house';
import { leafSegment } from './collision';

// Plan-space window drawn on the minimap (house + porch, with margin)
const X0 = -1.6, Z0 = -0.7;

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private s: number;

  /** size: house width / depth in meters (default 14 x 9). */
  constructor(canvas: HTMLCanvasElement, private house: House, size: [number, number] = [14, 9]) {
    this.ctx = canvas.getContext('2d')!;
    this.s = Math.min(canvas.width / (size[0] + 2.2), canvas.height / (size[1] + 1.7));
    this.base = document.createElement('canvas');
    this.base.width = canvas.width; this.base.height = canvas.height;
    this.drawBase();
  }

  /** World coords -> minimap pixels. */
  private p(x: number, z: number): [number, number] {
    return [(x + 7 - X0) * this.s, (z + 4.5 - Z0) * this.s];
  }

  private drawBase() {
    const g = this.base.getContext('2d')!, h = this.house;
    g.fillStyle = '#b7cc9c'; g.fillRect(0, 0, this.base.width, this.base.height);
    const rect = (r: { x0: number; z0: number; x1: number; z1: number }, c: string) => {
      const [a, b] = this.p(r.x0, r.z0), [c2, d] = this.p(r.x1, r.z1);
      g.fillStyle = c; g.fillRect(a, b, c2 - a, d - b);
    };
    h.floors.filter(f => f.y1 >= -0.16 && f.x1 - f.x0 < 20).forEach(f => rect(f, '#e2ddd4'));
    h.tiles.forEach(t => rect(t, t.color));
    h.solids.filter(s => s.y1 < 2).forEach(s => rect(s, 'rgba(90,70,50,.45)'));
    h.solids.filter(s => s.y1 >= 2).forEach(s => rect(s, '#3c3f44'));
  }

  draw(x: number, z: number, face: number, viewYaw: number) {
    const g = this.ctx;
    g.drawImage(this.base, 0, 0);
    g.strokeStyle = '#7a3a22'; g.lineWidth = 2;
    for (const d of this.house.doors) {
      const s = leafSegment(d, d.g.rotation.y);
      g.beginPath(); g.moveTo(...this.p(s[0], s[1])); g.lineTo(...this.p(s[2], s[3])); g.stroke();
    }
    const [px, py] = this.p(x, z);
    const look = Math.atan2(-Math.cos(viewYaw), -Math.sin(viewYaw));
    g.fillStyle = 'rgba(47,111,179,.22)';
    g.beginPath(); g.moveTo(px, py); g.arc(px, py, 26, look - 0.6, look + 0.6); g.fill();
    const fx = Math.sin(face), fz = Math.cos(face);
    g.fillStyle = '#2f6fb3'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(px, py, 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(px + fx * 8, py + fz * 8); g.lineTo(px + fz * 3, py - fx * 3); g.lineTo(px - fz * 3, py + fx * 3);
    g.closePath(); g.fill();
  }
}
