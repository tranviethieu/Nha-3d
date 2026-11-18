import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildHouse, toWorld, type Bed, type Door, type House, type Leaf, type Win } from './house';
import { makeCharacter, poseCharacter, type Character } from './character';
import { blocked, floorTop, leafSegment, STEP } from './collision';
import { Minimap } from './minimap';
import { roomAt } from './rooms';
import { buildDimensions, faceCamera, type Dimensions } from './dimensions';

export type Mode = 'overview' | 'tour';
export type RoofMode = 'auto' | 'on' | 'off';
export interface HudState {
  mode: Mode;
  // overview
  roofOn: boolean;
  rackDown: boolean;
  anyDoorClosed: boolean;
  anyWindowClosed: boolean;
  /** Dimension overlay (room sizes, m², wall and window lengths) is shown. */
  dimsOn: boolean;
  // tour
  room: string;
  /** Text of the action E would perform, or null when nothing is in reach. */
  prompt: string | null;
  firstPerson: boolean;
  roofMode: RoofMode;
  lying: boolean;
}

const WALK = 1.7, RUN = 3.6, GRAVITY = 9.8, JUMP = 3.6;
const HEIGHT = 1.7, EYE = 1.58;
const [SX, SZ] = toWorld(-3.4, 2.6); // in the yard, facing the front porch
const START = { x: SX, z: SZ, face: Math.PI / 2, yaw: -Math.PI / 2 };
const RACK = toWorld(9.78, 1.63);
const BOUNDS = { x0: -14.5, x1: 12.5, z0: -10, z1: 10 };
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
type V3 = [number, number, number];

type Interactable = { door: Door } | { win: Win } | { rack: true } | { bed: Bed };

/** Distance from a point to a rectangle (0 inside). */
const rectDist = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) =>
  Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

export class Game {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private controls: OrbitControls;
  private house: House;
  private hero: Character;
  private minimap: Minimap;
  private raycaster = new THREE.Raycaster();
  private mode: Mode = 'overview';
  private dims: Dimensions;
  private dimsOn = false;

  // overview state
  private roofOn = false;
  private savedOverview: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

  // player (tour)
  private p = { x: START.x, z: START.z, y: -0.3, vy: 0, face: START.face, speed: 0, phase: 0, onGround: true };
  private lying: { bed: Bed; back: { x: number; z: number; y: number } } | null = null;
  private yaw = START.yaw; private pitch = 0.38; private fpPitch = 0; private dist = 4.2;
  private camTarget = new THREE.Vector3(START.x, 1.2, START.z);
  private firstPerson = false;
  private roofMode: RoofMode = 'auto';

  // kitchen dish rack
  private rackDown = false; private rackT = 0;
  // input
  private keys: Record<string, boolean> = {};
  private stick = { x: 0, y: 0 };
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();

  private raf = 0; private last = performance.now(); private hudKey = '';
  private cleanups: (() => void)[] = [];

  constructor(private container: HTMLElement, mapCanvas: HTMLCanvasElement, private onHud: (s: HudState) => void,
    private onToast: (t: string) => void) {
    this.scene.background = new THREE.Color(0xcfe0ea);
    this.scene.fog = new THREE.Fog(0xcfe0ea, 35, 80);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);
    this.house = buildHouse(this.scene);
    this.hero = makeCharacter(this.scene);
    this.hero.root.visible = this.hero.shadow.visible = false;
    this.minimap = new Minimap(mapCanvas, this.house);
    this.dims = buildDimensions(this.scene);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.resize();
    this.bindInput();
    this.viewWC(); // same initial view as the original model
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.cleanups.forEach(f => f());
    this.controls.dispose();
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach(mt => mt.dispose());
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ======================= overview actions (the original model's buttons) =======================
  private setView(p: V3, tg: V3 = [-1, 1.5, -1]) {
    this.camera.position.set(...p); this.controls.target.set(...tg); this.controls.update();
  }
  setRoof = (on: boolean) => { this.roofOn = on; };
  toggleRoof = () => this.setRoof(!this.roofOn);
  viewWC = () => {
    this.setRoof(false); this.house.wcDoors.forEach(d => this.setDoor(d, true));
    this.setView([5.4, 6.2, 0.2], [5.4, 0.6, 2.7]);
  };
  viewLavabo = () => this.setView([6.3, 1.6, 1.1], [3.95, 1.25, 1.1]);
  viewKitchen = () => this.setView([0.6, 1.7, -1.4], [2.75, 1.45, -2.9]);
  viewTV = () => this.setView([-5.2, 1.55, -2.2], [-1.0, 1.45, -2.2]);
  viewPerspective = () => { this.setRoof(true); this.setView([-12, 14, -16], [0, 0, 0]); };
  toggleRack = () => { this.rackDown = !this.rackDown; };
  toggleAllDoors = () => { const open = this.house.doors.some(d => !d.open); this.house.doors.forEach(d => this.setDoor(d, open)); };
  toggleDims = () => {
    this.dimsOn = !this.dimsOn;
    // the overlay is a floor plan: hide the roof so it can be read from above
    if (this.dimsOn && this.mode === 'overview') this.roofOn = false;
    this.onToast(this.dimsOn ? 'Đang hiện kích thước (theo bản vẽ thực tế)' : 'Đã ẩn kích thước');
  };
  toggleAllWindows = () => { const open = this.house.windows.some(w => !w.open); this.house.windows.forEach(w => this.setWin(w, open)); };

  // ======================= mode switching =======================
  enterTour = () => {
    if (this.mode === 'tour') return;
    this.savedOverview = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    this.mode = 'tour';
    this.controls.enabled = false;
    this.camera.fov = 60; this.camera.updateProjectionMatrix();
    this.roofMode = 'auto'; this.firstPerson = false;
    this.goHome(false);
    this.onToast('Bắt đầu tham quan — dùng W A S D để đi');
  };
  exitTour = () => {
    if (this.mode === 'overview') return;
    if (this.lying) this.standUp();
    this.mode = 'overview';
    this.keys = {}; this.stick = { x: 0, y: 0 };
    this.hero.root.visible = this.hero.shadow.visible = false;
    this.camera.fov = 50; this.camera.updateProjectionMatrix();
    this.controls.enabled = true;
    if (this.savedOverview) { this.camera.position.copy(this.savedOverview.pos); this.controls.target.copy(this.savedOverview.target); }
    this.controls.update();
  };

  // ======================= tour actions =======================
  toggleView = () => { this.firstPerson = !this.firstPerson; this.fpPitch = this.lying ? 1.2 : 0; };
  cycleRoof = () => { this.roofMode = ({ auto: 'on', on: 'off', off: 'auto' } as const)[this.roofMode]; };
  jump = () => { if (this.lying) { this.standUp(); return; } if (this.p.onGround) { this.p.vy = JUMP; this.p.onGround = false; } };
  setStick = (x: number, y: number) => { this.stick.x = x; this.stick.y = y; };
  goHome = (toast = true) => {
    if (this.lying) this.standUp();
    Object.assign(this.p, { x: START.x, z: START.z, y: -0.3, vy: 0, face: START.face, speed: 0 });
    this.yaw = START.yaw; this.pitch = 0.38; this.camTarget.set(START.x, 1.2, START.z);
    if (toast) this.onToast('Đã về trước cửa chính');
  };
  interact = () => {
    if (this.mode !== 'tour') return;
    if (this.lying) { this.standUp(); return; }
    const n = this.nearest();
    if (!n) return;
    if ('rack' in n) { this.rackDown = !this.rackDown; this.onToast(this.rackDown ? 'Đã hạ giá bát' : 'Đã nâng giá bát'); }
    else if ('door' in n) this.setDoor(n.door, !n.door.open);
    else if ('win' in n) this.setWin(n.win, !n.win.open);
    else this.lieDown(n.bed);
  };

  // ======================= internals =======================
  private setDoor(d: Door, open: boolean) { d.open = open; d.t = open ? d.o : d.c; }
  private setWin(w: Win, open: boolean) { w.open = open; w.leaves.forEach(l => { l.t = open ? l.o : l.c; }); }

  private lieDown(bed: Bed) {
    this.lying = { bed, back: { x: this.p.x, z: this.p.z, y: this.p.y } };
    this.p.speed = 0; this.p.vy = 0;
    const cx = (bed.x0 + bed.x1) / 2;
    // head 15 cm from the headboard; body extends 1.70 m toward the foot of the bed
    const feetZ = bed.head === 'N' ? bed.z0 + 0.15 + HEIGHT : bed.z1 - 0.15 - HEIGHT;
    const r = this.hero.root;
    r.position.set(cx, bed.top + 0.11, feetZ);
    // face up, head toward the headboard (-z for 'N', +z for 'S')
    r.rotation.set(-Math.PI / 2, bed.head === 'N' ? 0 : Math.PI, 0, 'YXZ');
    for (const l of [this.hero.legL, this.hero.legR, this.hero.armL, this.hero.armR]) l.rotation.set(0, 0, 0);
    this.hero.body.position.set(0, 0, 0); this.hero.body.rotation.set(0, 0, 0);
    this.hero.shadow.visible = false;
    this.camTarget.set(cx, bed.top + 0.4, (bed.z0 + bed.z1) / 2);
    if (this.firstPerson) this.fpPitch = 1.2;
    this.onToast('Đang nằm trên giường — nhấn E hoặc phím di chuyển để dậy');
  }

  private standUp() {
    if (!this.lying) return;
    Object.assign(this.p, this.lying.back);
    this.lying = null;
    this.hero.root.rotation.set(0, this.p.face, 0, 'XYZ');
    this.hero.shadow.visible = true;
    this.fpPitch = 0;
  }

  private nearest(): Interactable | null {
    const p = this.p;
    let best: Interactable | null = null, bd = 1.5;
    const consider = (d: number, it: Interactable) => { if (d < bd) { bd = d; best = it; } };
    for (const d of this.house.doors) {
      const s = leafSegment(d, d.g.rotation.y);
      consider(Math.hypot(p.x - (s[0] + s[2]) / 2, p.z - (s[1] + s[3]) / 2), { door: d });
    }
    for (const w of this.house.windows) { const d = Math.hypot(p.x - w.x, p.z - w.z); if (d < 1.3) consider(d, { win: w }); }
    const dr = Math.hypot(p.x - RACK[0], p.z - RACK[1]);
    if (dr < 1.3) consider(dr, { rack: true });
    // beds win when you are right next to them
    for (const b of this.house.beds) { const d = rectDist(p.x, p.z, b); if (d < 0.6) consider(d * 0.5, { bed: b }); }
    return best;
  }

  private promptFor(n: Interactable | null): string | null {
    if (this.lying) return 'Đứng dậy';
    if (!n) return null;
    if ('rack' in n) return this.rackDown ? 'Nâng giá bát' : 'Hạ giá bát';
    if ('door' in n) return n.door.open ? 'Đóng cửa' : 'Mở cửa';
    if ('win' in n) return n.win.open ? 'Đóng cửa sổ' : 'Mở cửa sổ';
    return 'Nằm lên giường';
  }

  /** Axis-separated move so the player slides along walls. Bumping a closed door opens it. */
  private tryMove(dx: number, dz: number) {
    const p = this.p, h = this.house;
    const stuck = blocked(h, p.x, p.z, p.y) !== null;
    for (const [mx, mz] of [[dx, 0], [0, dz]]) {
      if (!mx && !mz) continue;
      const hit = stuck ? null : blocked(h, p.x + mx, p.z + mz, p.y);
      if (!hit) { p.x += mx; p.z += mz; }
      else if ('door' in hit) this.setDoor(hit.door, true);
    }
    p.x = Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, p.x));
    p.z = Math.min(BOUNDS.z1, Math.max(BOUNDS.z0, p.z));
  }

  private resize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private look(dx: number, dy: number) {
    this.yaw -= dx * 0.005;
    if (this.firstPerson) this.fpPitch = THREE.MathUtils.clamp(this.fpPitch - dy * 0.004, -1.3, 1.45);
    else this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, -0.15, 1.4);
  }

  /** Click on a door, window sash or the dish rack toggles it (both modes, as in the original). */
  private pick(cx: number, cy: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera); this.raycaster.far = Infinity;
    const hit = this.raycaster.intersectObjects(this.house.clickables, false)[0];
    if (!hit) return;
    const u = hit.object.userData;
    if (u.rack) this.toggleRack();
    if (u.door) this.setDoor(u.door as Door, !(u.door as Door).open);
    if (u.win) this.setWin(u.win as Win, !(u.win as Win).open);
  }

  private bindInput() {
    const on = (t: EventTarget, ev: string, fn: (e: never) => void, opt?: AddEventListenerOptions) => {
      t.addEventListener(ev, fn as EventListener, opt); this.cleanups.push(() => t.removeEventListener(ev, fn as EventListener, opt));
    };
    on(window, 'resize', this.resize);
    on(window, 'blur', () => { this.keys = {}; });
    on(window, 'keyup', (e: KeyboardEvent) => { this.keys[e.code] = false; });
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (this.mode !== 'tour') return;
      this.keys[e.code] = true;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (e.repeat && !MOVE_KEYS.includes(e.code)) return;
      if (this.lying && MOVE_KEYS.includes(e.code)) { this.standUp(); return; }
      const act: Record<string, () => void> = {
        KeyE: this.interact, KeyV: this.toggleView, KeyR: this.cycleRoof, KeyO: this.toggleAllDoors,
        KeyH: () => this.goHome(), KeyK: this.toggleDims, Space: this.jump, Escape: this.exitTour,
      };
      act[e.code]?.();
    });
    const cv = this.renderer.domElement;
    on(cv, 'pointerdown', (e: PointerEvent) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      if (this.mode === 'tour') cv.setPointerCapture(e.pointerId);
    });
    on(cv, 'pointermove', (e: PointerEvent) => {
      const q = this.pointers.get(e.pointerId); if (!q) return;
      if (this.mode === 'tour') { const k = e.pointerType === 'touch' ? 1.4 : 1; this.look((e.clientX - q.x) * k, (e.clientY - q.y) * k); }
      q.x = e.clientX; q.y = e.clientY;
    });
    const up = (e: PointerEvent) => {
      const q = this.pointers.get(e.pointerId); if (!q) return;
      this.pointers.delete(e.pointerId);
      if (e.type === 'pointerup' && Math.hypot(e.clientX - q.sx, e.clientY - q.sy) < 6) this.pick(e.clientX, e.clientY);
    };
    on(cv, 'pointerup', up); on(cv, 'pointercancel', up);
    on(cv, 'wheel', (e: WheelEvent) => {
      if (this.mode !== 'tour') return; // OrbitControls zooms in overview
      e.preventDefault(); this.dist = THREE.MathUtils.clamp(this.dist * (1 + Math.sign(e.deltaY) * 0.1), 1.6, 14);
    }, { passive: false });
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = THREE.MathUtils.clamp((now - this.last) / 1000, 0, 0.05); this.last = now;
    const h = this.house;

    // doors, windows and the dish rack animate in both modes (same easing as the original)
    const ease = (l: Leaf) => { l.g.rotation.y += (l.t - l.g.rotation.y) * Math.min(1, dt * 7); if (Math.abs(l.t - l.g.rotation.y) < 0.002) l.g.rotation.y = l.t; };
    h.doors.forEach(ease); h.windows.forEach(w => w.leaves.forEach(ease));
    const r = this.rackT += ((this.rackDown ? 1 : 0) - this.rackT) * Math.min(1, dt * 6);
    h.rack.group.position.set(-0.24 * r, -0.5 * r, 0);
    h.rack.armL.position.set(9.725 - 7 - 0.12 * r, 1.8 - 0.25 * r, 1.1 - 4.5); h.rack.armL.rotation.z = 0.45 * r;
    h.rack.armR.position.set(9.725 - 7 - 0.12 * r, 1.8 - 0.25 * r, 2.15 - 4.5); h.rack.armR.rotation.z = 0.45 * r;

    let room: string | null = null, n: Interactable | null = null;
    if (this.mode === 'overview') {
      h.roof.visible = this.roofOn;
      h.labels.forEach(s => { s.visible = !this.roofOn && !this.dimsOn; });
      this.dims.group.visible = this.dimsOn && !this.roofOn;
      this.dims.rooms.forEach(g => { g.visible = true; }); this.dims.exterior.visible = true;
      this.controls.update();
    } else {
      this.updatePlayer(dt, now);
      room = roomAt(this.p.x, this.p.z);
      h.roof.visible = this.roofMode === 'on' || (this.roofMode === 'auto' && !room && !this.firstPerson);
      h.labels.forEach(s => { s.visible = false; });
      // while touring, only annotate the room you are in (or the outside dimensions in the yard)
      this.dims.group.visible = this.dimsOn;
      this.dims.rooms.forEach((g, k) => { g.visible = k === room; }); this.dims.exterior.visible = !room;
      this.updateCamera(dt);
      n = this.lying ? null : this.nearest();
      this.minimap.draw(this.p.x, this.p.z, this.p.face, this.yaw);
    }

    const hud: HudState = {
      mode: this.mode, roofOn: this.roofOn, rackDown: this.rackDown,
      anyDoorClosed: h.doors.some(d => !d.open), anyWindowClosed: h.windows.some(w => !w.open), dimsOn: this.dimsOn,
      room: room ?? 'Sân vườn', prompt: this.mode === 'tour' ? this.promptFor(n) : null,
      firstPerson: this.firstPerson, roofMode: this.roofMode, lying: !!this.lying,
    };
    if (this.dims.group.visible) faceCamera(this.camera.getWorldDirection(new THREE.Vector3()));
    const key = JSON.stringify(hud);
    if (key !== this.hudKey) { this.hudKey = key; this.onHud(hud); }
    this.renderer.render(this.scene, this.camera);
  };

  private updatePlayer(dt: number, now: number) {
    const p = this.p, h = this.house, k = this.keys, hero = this.hero;
    if (this.lying) {
      if (Math.hypot(this.stick.x, this.stick.y) > 0.5) this.standUp();
      else { hero.root.visible = !this.firstPerson; return; }
    }

    // movement, relative to camera yaw
    let ix = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + this.stick.x;
    let iz = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0) + this.stick.y;
    let il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; il = 1; }
    const run = k.ShiftLeft || k.ShiftRight || Math.hypot(this.stick.x, this.stick.y) > 0.95;
    p.speed += ((il > 0.05 ? (run ? RUN : WALK) * il : 0) - p.speed) * Math.min(1, dt * 10);
    if (il > 0.05) {
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      const wx = ix * c + iz * s, wz = -ix * s + iz * c, wl = Math.hypot(wx, wz);
      let d = Math.atan2(wx, wz) - p.face;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      p.face += d * Math.min(1, dt * (this.firstPerson ? 30 : 12));
      const mv = p.speed * dt, steps = Math.ceil(mv / 0.08);
      for (let i = 0; i < steps; i++) this.tryMove((wx / wl) * mv / steps, (wz / wl) * mv / steps);
    }

    // vertical: step up, fall, jump
    const g = floorTop(h, p.x, p.z, p.y + STEP);
    if (p.onGround && g >= p.y - 0.02) { p.y += (g - p.y) * Math.min(1, dt * 18); p.vy = 0; }
    else {
      p.vy -= GRAVITY * dt; p.y += p.vy * dt;
      if (p.y <= g) { p.y = g; p.vy = 0; p.onGround = true; } else p.onGround = false;
    }

    hero.root.position.set(p.x, p.y, p.z); hero.root.rotation.y = p.face;
    p.phase += dt * (2 + p.speed * 3.2);
    poseCharacter(hero, p.speed, p.phase, p.onGround, now);
    hero.shadow.visible = true;
    hero.shadow.position.set(p.x, floorTop(h, p.x, p.z) + 0.004, p.z);
    hero.shadow.scale.setScalar(Math.max(0.4, 1 - (p.y - g) * 0.6));
  }

  private updateCamera(dt: number) {
    const p = this.p, cam = this.camera, hero = this.hero;
    if (this.firstPerson) {
      if (this.lying) cam.position.copy(hero.root.localToWorld(new THREE.Vector3(0, 1.6, 0.05)));
      else cam.position.set(p.x + Math.sin(p.face) * 0.08, p.y + EYE, p.z + Math.cos(p.face) * 0.08);
      const c = Math.cos(this.fpPitch);
      cam.lookAt(cam.position.x - Math.sin(this.yaw) * c, cam.position.y + Math.sin(this.fpPitch), cam.position.z - Math.cos(this.yaw) * c);
      hero.root.visible = false;
      return;
    }
    if (!this.lying) this.camTarget.lerp(new THREE.Vector3(p.x, p.y + 1.35, p.z), Math.min(1, dt * 10));
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // pull the camera in front of walls between it and the player
    this.raycaster.set(this.camTarget, off); this.raycaster.far = this.dist;
    const obs: THREE.Object3D[] = this.house.roof.visible
      ? [...this.house.occluders, ...this.house.roof.children.filter(c => (c as THREE.Mesh).isMesh)]
      : this.house.occluders;
    const hit = this.raycaster.intersectObjects(obs, false)[0];
    const d = hit ? Math.max(0.35, hit.distance - 0.2) : this.dist;
    cam.position.copy(this.camTarget).addScaledVector(off, d);
    const gy = floorTop(this.house, cam.position.x, cam.position.z) + 0.15;
    if (cam.position.y < gy) cam.position.y = gy;
    cam.lookAt(this.camTarget);
    hero.root.visible = d > 0.6;
  }
}
