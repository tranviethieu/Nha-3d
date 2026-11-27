import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { buildHouse, toWorld, type Bed, type Door, type House, type Leaf, type ObjInfo, type Seat, type Win } from './house';
import { PlanMap, emptyLayout, fmtM, normalizeLayout, parseYouTube, DOOR_SPECS, GROUND, ROOM_DIMS, TV_DEFAULT_URL, type Layout } from './layout';
import { HIP, makeCharacter, poseCharacter, restPose, type Character } from './character';
import { blocked, floorTop, leafSegment, STEP } from './collision';
import { Minimap } from './minimap';
import { roomAt, setRoomMap } from './rooms';
import { buildDimensions, faceCamera, type Dimensions } from './dimensions';

export type Mode = 'overview' | 'tour';
export type RoofMode = 'auto' | 'on' | 'off';
export interface HudState {
  mode: Mode;
  // overview
  roofOn: boolean;
  /** the WC slab / storage-loft floor ("mái kho") shown */
  loftOn: boolean;
  rackDown: boolean;
  anyDoorClosed: boolean;
  anyWindowClosed: boolean;
  anyWardrobeClosed: boolean;
  /** Dimension overlay (room sizes, m², wall and window lengths) is shown. */
  dimsOn: boolean;
  // tour
  room: string;
  /** Text of the action E would perform, or null when nothing is in reach. */
  prompt: string | null;
  firstPerson: boolean;
  /** Bird's-eye camera that follows the character (whole house in view). */
  aerial: boolean;
  roofMode: RoofMode;
  lying: boolean;
  sitting: boolean;
  /** Overall size of the (possibly edited) house, e.g. '9 × 14 m'. */
  houseSize: string;
  /** Outdoor lights on (evening ambience). */
  lightsOn: boolean;
  /** The living-room TV is playing. */
  tvOn: boolean;
  /** Structural frame shown (house ghosted): counts for the legend, or null when hidden. */
  structure: { columns: number; footings: number; groundBeam: number; tieBeam: number } | null;
  /** Water pipes shown (house ghosted). */
  pipes: boolean;
}

const WALK = 1.7, RUN = 3.6, GRAVITY = 9.8, JUMP = 3.6;
const HEIGHT = 1.7, EYE = 1.58;
const roomTitle = (r: string) => ROOM_DIMS.find(d => d.room === r)?.title ?? r;
const [SX, SZ] = toWorld(-4.0, 2.6); // in the yard, facing the front porch
const START = { x: SX, z: SZ, face: Math.PI / 2, yaw: -Math.PI / 2 };
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
type V3 = [number, number, number];

type Interactable = { door: Door } | { win: Win } | { wardrobe: Win } | { rack: true } | { bed: Bed } | { seat: Seat } | { tv: true } | { lamp: string };

/** Distance from a point to a rectangle (0 inside). */
const rectDist = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) =>
  Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

export class Game {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  // alpha: the TV screen punches a transparent hole through which the YouTube iframe (CSS3D layer below) shows
  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private css = new CSS3DRenderer();
  private cssScene = new THREE.Scene();
  private controls: OrbitControls;
  private house: House;
  private hero: Character;
  private minimap: Minimap;
  private raycaster = new THREE.Raycaster();
  private mode: Mode = 'overview';
  private dims: Dimensions;
  private map = new PlanMap();
  private bounds = { x0: -14.5, x1: 12.5, z0: -10, z1: 10 };
  private dimsOn = false;

  // overview state
  private roofOn = false;
  /** WC slab at +2.4 ("mái kho"): shown unless hidden to look down into the WCs (overview only) */
  private loftOn = true;
  private savedOverview: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

  // player (tour)
  private p = { x: START.x, z: START.z, y: GROUND, vy: 0, face: START.face, speed: 0, phase: 0, onGround: true };
  /** Lying on a bed or sitting on a seat; `back` is where to stand up again. */
  private lying: { kind: 'lie' | 'sit'; top: number; back: { x: number; z: number; y: number } } | null = null;
  private yaw = START.yaw; private pitch = 0.38; private fpPitch = 0; private dist = 4.2;
  private camTarget = new THREE.Vector3(START.x, 1.2, START.z);
  private firstPerson = false;
  private aerial = false; private aerialDist = 16; private aerialPitch = 1.2;
  private marker: THREE.Mesh;
  private pinchD = 0;
  private roofMode: RoofMode = 'auto';

  // kitchen dish rack
  private rackDown = false; private rackT = 0;
  // input
  private keys: Record<string, boolean> = {};
  private stick = { x: 0, y: 0 };
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();

  private raf = 0; private last = performance.now(); private hudKey = '';
  private cleanups: (() => void)[] = [];

  constructor(private container: HTMLElement, private mapCanvas: HTMLCanvasElement, private onHud: (s: HudState) => void,
    private onToast: (t: string) => void) {
    this.scene.background = new THREE.Color(0xcfe0ea);
    this.scene.fog = new THREE.Fog(0xcfe0ea, 35, 80);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    // CSS3D layer (the TV's YouTube iframe) under the WebGL canvas; the canvas keeps all pointer input
    this.css.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0';
    container.appendChild(this.css.domElement);
    container.appendChild(this.renderer.domElement);
    this.house = buildHouse(this.scene);
    this.hero = makeCharacter(this.scene);
    this.hero.root.visible = this.hero.shadow.visible = false;
    this.minimap = new Minimap(mapCanvas, this.house);
    this.dims = buildDimensions(this.scene);
    // ring around the player's feet, drawn through walls, so the character is easy to find from above
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.46, 40),
      new THREE.MeshBasicMaterial({ color: 0x2f6fb3, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, fog: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.renderOrder = 30; this.marker.visible = false;
    this.scene.add(this.marker);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.resize();
    this.bindInput();
    this.viewPerspective(); // start on the whole-house perspective (roof on)
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ======================= editable layout =======================
  get layout(): Layout { return this.map.layout; }
  /** Furniture currently in the house (default and current sizes) for the settings panel. */
  get objects(): ObjInfo[] { return this.house.objects; }
  /** Room sizes as shown on the plan (figures + edits). */
  roomSizes() { return ROOM_DIMS.map(r => ({ room: r.room, title: r.title, base: r, ...this.map.roomSize(r) })); }
  /** Doors and windows with their current sizes, for the settings panel. */
  openings() {
    const doors = this.map.doors.map(d => ({ id: d.spec.id, label: d.spec.label, room: d.spec.room, kind: 'door' as const, w: d.w, h: d.h, sill: 0, hidden: d.hidden, base: DOOR_SPECS.find(s => s.id === d.spec.id)! }));
    const wins = this.map.windows.map(w => ({ id: w.spec.id, label: w.spec.label, room: w.spec.room, kind: 'window' as const, w: w.w, h: w.h, sill: w.sill, hidden: w.hidden, base: w.spec }));
    return { doors, wins };
  }
  /** Main roof size (length, width, rise) and the default for the current house. */
  roofInfo() { return this.map.roofs; }
  /** Rebuild the house for a new layout (room stretches + furniture overrides). */
  setLayout(input: Layout) {
    const layout = normalizeLayout(input);
    const tvWas = !!this.tv; this.tvOff(); // detach before the old screen is disposed
    if (this.lying) this.standUp();
    const keepDoors = this.house.doors.map(d => d.open), keepWins = this.house.windows.map(w => w.open);
    this.disposeTree(this.house.root); this.house.root.removeFromParent();
    this.disposeTree(this.dims.group); this.dims.group.removeFromParent();
    this.map = new PlanMap(layout);
    this.house = buildHouse(this.scene, this.map, layout); setRoomMap(this.map, this.house.mirrorZ);
    this.house.doors.forEach((d, i) => { if (keepDoors[i]) { d.open = true; d.t = d.o; d.g.rotation.y = d.o; } });
    this.house.windows.forEach((w, i) => { if (keepWins[i]) this.setWin(w, true); });
    this.dims = buildDimensions(this.scene, this.map, this.house.mirrorZ);
    this.minimap = new Minimap(this.mapCanvas, this.house, [this.map.houseW, this.map.houseD]);
    this.bounds = { x0: -14.5, x1: this.map.mx(19.5) - 7, z0: -10, z1: this.map.mz(14.5) - 4.5 };
    this.applyLights(); this.ghost.clear(); this.applyStructure();
    if (tvWas) this.tvOnWith(layout.tvUrl || TV_DEFAULT_URL); // re-attach to the rebuilt screen (maybe a new link)
    this.hudKey = '';
  }
  resetLayout() { this.setLayout(emptyLayout()); }

  // ======================= outdoor lights =======================
  private lightsOn = false;
  /** Indoor lights per room (2-way switches); 'Bật đèn' switches them all with the evening ambience. */
  private roomOn: Record<string, boolean> = {};
  toggleRoom = (room: string) => {
    this.roomOn[room] = !this.roomOn[room]; this.applyLights();
    this.onToast(`${this.roomOn[room] ? 'Đã bật' : 'Đã tắt'} đèn ${roomTitle(room)}`);
  };
  toggleLights = () => { this.lightsOn = !this.lightsOn; for (const r of Object.keys(this.house.lights.rooms)) this.roomOn[r] = this.lightsOn; this.applyLights(); this.onToast(this.lightsOn ? 'Đã bật đèn (chiều tối)' : 'Đã tắt đèn'); };
  /** Lights on = evening: dim sky and sun, bulbs bright, washes and sconce / porch lights on. */
  private applyLights() {
    const L = this.house.lights, on = this.lightsOn;
    L.glows.forEach(g => { g.visible = on; });
    L.bulbs.forEach(m => m.color.set(on ? 0xfff1c8 : (m.userData.off ?? 0x9a9a9a)));
    L.points.forEach(p => { p.light.intensity = on ? p.on : 0; });
    for (const [room, R] of Object.entries(L.rooms)) {
      const r = !!this.roomOn[room];
      R.bulb.color.set(r ? 0xfff1c8 : (R.bulb.userData.off ?? 0x9a9a9a)); R.glows.forEach(g => { g.visible = r; }); R.points.forEach(p => { p.light.intensity = r ? p.on : 0; });
    }
    L.hemi.intensity = (on ? 0.2 : 0.8) * Math.PI; L.sun.intensity = (on ? 0.08 : 0.7) * Math.PI;
    const sky = on ? 0x1d2838 : 0xcfe0ea;
    (this.scene.background as THREE.Color).set(sky); (this.scene.fog as THREE.Fog).color.set(sky);
  }
  // ======================= structural frame (móng, dầm móng, cột, dầm giằng) =======================
  private structOn = false;
  /** Materials made see-through while the frame is shown, with what to restore. */
  private ghost = new Map<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean }>();
  private pipesOn = false;
  togglePipes = () => {
    this.pipesOn = !this.pipesOn; if (this.pipesOn) this.structOn = false; this.applyStructure();
    this.onToast(this.pipesOn ? 'Cấp thoát nước: xanh lạnh, đỏ nóng, nâu thoát xí, xám thoát sàn, xanh lá thông hơi' : 'Đã ẩn đường ống');
  };
  toggleStructure = () => {
    this.structOn = !this.structOn; if (this.structOn) this.pipesOn = false; this.applyStructure();
    this.onToast(this.structOn ? 'Kết cấu sơ bộ theo tường hiện tại — cần kỹ sư kết cấu tính toán lại' : 'Đã ẩn kết cấu');
  };
  /** Show the frame and ghost everything else in the house (walls, ground, furniture) so the buried parts show. */
  private applyStructure() {
    const S = this.house.structure, PG = this.house.pipes, on = this.structOn || this.pipesOn;
    S.group.visible = this.structOn; PG.visible = this.pipesOn;
    if (on) {
      this.ghost.forEach((v, mt) => { Object.assign(mt, v); mt.needsUpdate = true; }); this.ghost.clear();
      this.house.root.traverse(o => {
        if (!(o as THREE.Mesh).material) return;
        let p: THREE.Object3D | null = o; while (p && p !== S.group && p !== PG) p = p.parent; if (p) return;
        for (const mt of [(o as THREE.Mesh).material].flat() as THREE.Material[]) {
          if (this.ghost.has(mt) || mt.blending === THREE.NoBlending) continue;
          this.ghost.set(mt, { transparent: mt.transparent, opacity: mt.opacity, depthWrite: mt.depthWrite });
          mt.transparent = true; mt.opacity = Math.min(mt.opacity, 0.13); mt.depthWrite = false; mt.needsUpdate = true;
        }
      });
    } else {
      this.ghost.forEach((v, mt) => { Object.assign(mt, v); mt.needsUpdate = true; }); this.ghost.clear();
    }
  }

  // ======================= drawings for the PDF export =======================
  /** Everything the PDF needs besides pictures: the plan map, mirror, structure counts, openings, furniture. */
  designData() {
    const S = this.house.structure;
    return { map: this.map, mirrorZ: this.house.mirrorZ, walls: this.house.walls, structure: { columns: S.columns, footings: S.footings, groundBeam: S.groundBeam, tieBeam: S.tieBeam, cols: S.cols, beams: S.beams },
      openings: this.openings(), objects: this.house.objects, fixtures: this.house.lights.fixtures, rooms: this.roomSizes(), roofs: this.map.roofs, roofFrame: this.house.roofFrame };
  }
  /** Render one view off-screen and return it as a PNG data URL. Orthographic views take the half extents of the
   *  frame in world metres; `clipY` cuts everything above that height (floor plans); `structure` shows the frame
   *  with the house ghosted. Labels, dimension overlays, the character and fog are hidden while rendering. */
  snapshot(v: { pos: V3; target: V3; up?: V3; half?: [number, number]; fov?: number }, o: { w: number; h: number; roof: boolean; structure?: boolean; pipes?: boolean; clipY?: number; clip?: [number, number, number, number]; labels?: boolean }): string {
    const h = this.house, keep = { roof: h.roof.visible, labels: h.labels.map(s => s.visible), dims: this.dims.group.visible, hero: this.hero.root.visible,
      shadow: this.hero.shadow.visible, marker: this.marker.visible, fog: this.scene.fog, bg: (this.scene.background as THREE.Color).clone(), struct: this.structOn, pipes: this.pipesOn, ratio: this.renderer.getPixelRatio() };
    h.roof.visible = o.roof; h.labels.forEach(s => { s.visible = !!o.labels; }); this.dims.group.visible = false;
    this.hero.root.visible = this.hero.shadow.visible = this.marker.visible = false;
    this.scene.fog = null; (this.scene.background as THREE.Color).set(0xffffff);
    if (!!o.structure !== this.structOn || !!o.pipes !== this.pipesOn) { this.structOn = !!o.structure; this.pipesOn = !!o.pipes; this.applyStructure(); }
    const planes: THREE.Plane[] = [];
    if (o.clipY !== undefined) planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), o.clipY));
    if (o.clip) planes.push(new THREE.Plane(new THREE.Vector3(o.clip[0], o.clip[1], o.clip[2]), o.clip[3]));
    this.renderer.clippingPlanes = planes;
    const cam = v.half ? new THREE.OrthographicCamera(-v.half[0], v.half[0], v.half[1], -v.half[1], 0.05, 80) : new THREE.PerspectiveCamera(v.fov ?? 35, o.w / o.h, 0.1, 200);
    cam.position.set(...v.pos); cam.up.set(...(v.up ?? [0, 1, 0])); cam.lookAt(...v.target); cam.updateProjectionMatrix();
    this.renderer.setPixelRatio(1); this.renderer.setSize(o.w, o.h, false);
    this.renderer.render(this.scene, cam);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.renderer.clippingPlanes = [];
    h.roof.visible = keep.roof; h.labels.forEach((s, i) => { s.visible = keep.labels[i]; }); this.dims.group.visible = keep.dims;
    this.hero.root.visible = keep.hero; this.hero.shadow.visible = keep.shadow; this.marker.visible = keep.marker;
    this.scene.fog = keep.fog; (this.scene.background as THREE.Color).copy(keep.bg);
    if (keep.struct !== this.structOn || keep.pipes !== this.pipesOn) { this.structOn = keep.struct; this.pipesOn = keep.pipes; this.applyStructure(); }
    this.renderer.setPixelRatio(keep.ratio); this.resize();
    return url;
  }

  // ======================= living-room TV (YouTube) =======================
  /** The playing TV: the iframe as a CSS3D object behind the screen, whose material is swapped for a hole. */
  private tv: { obj: CSS3DObject; iframe: HTMLIFrameElement; screenMat: THREE.Material | THREE.Material[]; url: string } | null = null;
  private holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, fog: false, toneMapped: false });
  toggleTv = () => {
    if (this.tv) { this.tvOff(); this.onToast('Đã tắt tivi'); return; }
    const url = this.map.layout.tvUrl || TV_DEFAULT_URL;
    if (!parseYouTube(url)) { this.onToast('Link YouTube của tivi không hợp lệ (Cài đặt → Vật thể)'); return; }
    this.tvOnWith(url); this.onToast('Đang phát YouTube trên tivi — bấm vào tivi hoặc E để tắt');
  };
  private tvOnWith(url: string) {
    const yt = parseYouTube(url); if (!yt) return;
    const W = 1280, H = 720, screen = this.house.tvScreen;
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${yt.id}?autoplay=1&start=${yt.start}&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.style.cssText = `width:${W}px;height:${H}px;border:0;background:#000`;
    // play with sound once the player is ready (the click that switched the TV on counts as the user gesture)
    iframe.addEventListener('load', () => {
      for (const func of ['playVideo', 'unMute']) iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
    });
    const obj = new CSS3DObject(iframe);
    // fit the screen in world space (the TV may have been moved / scaled / mirrored); it always faces -x
    screen.updateWorldMatrix(true, false);
    const bb = new THREE.Box3().setFromObject(screen), c = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
    obj.position.set(bb.min.x - 0.002, c.y, c.z);
    obj.rotation.y = -Math.PI / 2;
    obj.scale.set(size.z / W, size.y / H, 1);
    this.cssScene.add(obj);
    this.tv = { obj, iframe, screenMat: screen.material, url };
    screen.material = this.holeMat;
  }
  private tvOff() {
    if (!this.tv) return;
    this.cssScene.remove(this.tv.obj); this.tv.obj.element.remove();
    this.house.tvScreen.material = this.tv.screenMat;
    this.tv = null;
  }

  /** Number of eave downlights and wall sconces in the current build. */
  lightCounts() { return { downlights: this.house.lights.downlights, sconces: this.house.lights.sconces, indoor: this.house.lights.indoor }; }

  private disposeTree(o: THREE.Object3D) {
    o.traverse(c => {
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach(mt => { (mt as THREE.MeshBasicMaterial).map?.dispose(); mt.dispose(); });
    });
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
    const M = this.house.mirrorZ; // presets follow a mirrored house
    if (M !== null) { p = [p[0], p[1], M - p[2]]; tg = [tg[0], tg[1], M - tg[2]]; }
    this.camera.position.set(...p); this.controls.target.set(...tg); this.controls.update();
  }
  setRoof = (on: boolean) => { this.roofOn = on; };
  toggleLoft = () => { this.loftOn = !this.loftOn; this.onToast(this.loftOn ? 'Đã hiện mái kho (trần WC)' : 'Đã ẩn mái kho (trần WC)'); };
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
    if (this.dimsOn && this.mode === 'overview') this.setRoof(false);
    this.onToast(this.dimsOn ? 'Đang hiện kích thước (theo bản vẽ thực tế)' : 'Đã ẩn kích thước');
  };
  toggleAllWardrobes = () => { const open = this.house.wardrobes.some(w => !w.open); this.house.wardrobes.forEach(w => this.setWin(w, open)); };
  toggleAllWindows = () => { const open = this.house.windows.some(w => !w.open); this.house.windows.forEach(w => this.setWin(w, open)); };

  // ======================= mode switching =======================
  enterTour = () => {
    if (this.mode === 'tour') return;
    this.savedOverview = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    this.mode = 'tour';
    this.controls.enabled = false;
    this.camera.fov = 60; this.camera.updateProjectionMatrix();
    this.roofMode = 'auto'; this.firstPerson = false; this.aerial = false;
    this.goHome(false);
    this.onToast('Bắt đầu tham quan — dùng W A S D để đi');
  };
  exitTour = () => {
    if (this.mode === 'overview') return;
    if (this.lying) this.standUp();
    this.mode = 'overview';
    this.keys = {}; this.stick = { x: 0, y: 0 };
    this.hero.root.visible = this.hero.shadow.visible = this.marker.visible = false;
    this.camera.fov = 50; this.camera.updateProjectionMatrix();
    this.controls.enabled = true;
    if (this.savedOverview) { this.camera.position.copy(this.savedOverview.pos); this.controls.target.copy(this.savedOverview.target); }
    this.controls.update();
  };

  // ======================= tour actions =======================
  /** Cycle camera: third person → aerial → first person → third person. */
  toggleView = () => {
    if (this.firstPerson) this.firstPerson = false;
    else if (this.aerial) { this.aerial = false; this.firstPerson = true; }
    else { this.aerial = true; this.fitAerial(); }
    this.fpPitch = this.lying?.kind === 'lie' ? 1.2 : 0;
  };
  toggleAerial = () => { this.aerial = !this.aerial; if (this.aerial) { this.firstPerson = false; this.fitAerial(); } };
  /** Start the aerial view far enough out that the whole house fits (portrait phones need more distance). */
  private fitAerial() { this.aerialDist = this.camera.aspect < 1 ? 26 : 16; this.aerialPitch = 1.2; }
  cycleRoof = () => { this.roofMode = ({ auto: 'on', on: 'off', off: 'auto' } as const)[this.roofMode]; };
  jump = () => { if (this.lying) { this.standUp(); return; } if (this.p.onGround) { this.p.vy = JUMP; this.p.onGround = false; } };
  setStick = (x: number, y: number) => { this.stick.x = x; this.stick.y = y; };
  goHome = (toast = true) => {
    if (this.lying) this.standUp();
    const sz = this.house.mirrorZ === null ? START.z : this.house.mirrorZ - START.z; // in front of the porch
    Object.assign(this.p, { x: START.x, z: sz, y: GROUND, vy: 0, face: START.face, speed: 0 });
    this.yaw = START.yaw; this.pitch = 0.38; this.camTarget.set(START.x, 1.2, sz);
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
    else if ('wardrobe' in n) this.setWin(n.wardrobe, !n.wardrobe.open);
    else if ('seat' in n) this.sitDown(n.seat);
    else if ('tv' in n) this.toggleTv();
    else if ('lamp' in n) this.toggleRoom(n.lamp);
    else this.lieDown(n.bed);
  };

  // ======================= internals =======================
  private setDoor(d: Door, open: boolean) { d.open = open; d.t = open ? d.o : d.c; }
  private setWin(w: Win, open: boolean) { w.open = open; w.leaves.forEach(l => { l.t = open ? l.o : l.c; }); }

  private lieDown(bed: Bed) {
    this.lying = { kind: 'lie', top: bed.top, back: { x: this.p.x, z: this.p.z, y: this.p.y } };
    this.p.speed = 0; this.p.vy = 0;
    const cx = (bed.x0 + bed.x1) / 2, cz = (bed.z0 + bed.z1) / 2;
    // head 15 cm from the headboard; body extends 1.70 m toward the foot of the bed; face up, head toward the headboard
    const r = this.hero.root;
    if (bed.head === 'N' || bed.head === 'S') {
      r.position.set(cx, bed.top + 0.11, bed.head === 'N' ? bed.z0 + 0.15 + HEIGHT : bed.z1 - 0.15 - HEIGHT);
      r.rotation.set(-Math.PI / 2, bed.head === 'N' ? 0 : Math.PI, 0, 'YXZ');
    } else {
      r.position.set(bed.head === 'E' ? bed.x0 + 0.15 + HEIGHT : bed.x1 - 0.15 - HEIGHT, bed.top + 0.11, cz);
      r.rotation.set(-Math.PI / 2, bed.head === 'E' ? Math.PI / 2 : -Math.PI / 2, 0, 'YXZ');
    }
    restPose(this.hero, false);
    this.hero.shadow.visible = false;
    this.camTarget.set(cx, bed.top + 0.4, cz);
    if (this.firstPerson) this.fpPitch = 1.2;
    this.onToast('Đang nằm trên giường — nhấn E hoặc phím di chuyển để dậy');
  }

  private sitDown(seat: Seat) {
    this.lying = { kind: 'sit', top: seat.top, back: { x: this.p.x, z: this.p.z, y: this.p.y } };
    this.p.speed = 0; this.p.vy = 0; this.p.face = seat.face;
    const r = this.hero.root;
    // hips (thigh centre ~7 cm above the seat) at the seat, facing away from the backrest
    r.position.set(seat.x, seat.top + 0.07 - HIP, seat.z);
    r.rotation.set(0, seat.face, 0, 'XYZ');
    restPose(this.hero, true);
    this.hero.shadow.visible = false;
    this.yaw = seat.face + Math.PI; this.pitch = 0.3; this.fpPitch = 0;
    this.camTarget.set(seat.x, seat.top + 0.75, seat.z);
    this.onToast(`Đang ngồi ${seat.kind === 'sofa' ? 'sofa' : seat.kind === 'desk' ? 'bàn học' : 'ghế'} — nhấn E hoặc phím di chuyển để đứng dậy`);
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
    // things in front of the character are preferred over things beside or behind it
    const fx = Math.sin(p.face), fz = Math.cos(p.face);
    const consider = (d: number, it: Interactable, tx?: number, tz?: number) => {
      if (tx !== undefined && tz !== undefined) {
        const l = Math.hypot(tx - p.x, tz - p.z);
        if (l > 1e-3) d *= 1.25 - 0.55 * Math.max(0, ((tx - p.x) * fx + (tz - p.z) * fz) / l);
      }
      if (d < bd) { bd = d; best = it; }
    };
    for (const d of this.house.doors) {
      const s = leafSegment(d, d.g.rotation.y);
      consider(Math.hypot(p.x - (s[0] + s[2]) / 2, p.z - (s[1] + s[3]) / 2), { door: d });
    }
    for (const w of this.house.windows) { const d = Math.hypot(p.x - w.x, p.z - w.z); if (d < 1.3) consider(d, { win: w }); }
    for (const w of this.house.wardrobes) {
      // distance to the 2 m front, not its centre
      const hw = w.half ?? 1, alongZ = w.along === 'z';
      const cx = alongZ ? w.x : THREE.MathUtils.clamp(p.x, w.x - hw, w.x + hw), cz = alongZ ? THREE.MathUtils.clamp(p.z, w.z - hw, w.z + hw) : w.z;
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d < 1.1) consider(d * 0.6, { wardrobe: w }, cx, cz);
    }
    for (const s of this.house.seats) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < 0.8) consider(d * 0.6, { seat: s }, s.x, s.z); }
    { // TV: within reach in front of the screen
      const c = new THREE.Box3().setFromObject(this.house.tvScreen).getCenter(new THREE.Vector3()), d = Math.hypot(p.x - c.x, p.z - c.z);
      // the TV unit is deep, so standing at it you are ~1.5 m from the screen; reach up to 2.4 m
      if (d < 2.4 && p.x < c.x) consider(Math.min(1.4, d * 0.6), { tv: true });
    }
    for (const sw of this.house.switches) { const d = Math.hypot(p.x - sw.x, p.z - sw.z); if (d < 0.9) consider(d * 0.8, { lamp: sw.room }, sw.x, sw.z); }
    const dr = Math.hypot(p.x - this.house.rackPos[0], p.z - this.house.rackPos[1]);
    if (dr < 1.3) consider(dr, { rack: true });
    // beds win when you are right next to them
    for (const b of this.house.beds) { const d = rectDist(p.x, p.z, b); if (d < 0.6) consider(d * 0.5, { bed: b }, THREE.MathUtils.clamp(p.x, b.x0, b.x1), THREE.MathUtils.clamp(p.z, b.z0, b.z1)); }
    return best;
  }

  private promptFor(n: Interactable | null): string | null {
    if (this.lying) return this.lying.kind === 'sit' ? 'Đứng dậy' : 'Ngồi dậy';
    if (!n) return null;
    if ('rack' in n) return this.rackDown ? 'Nâng giá bát' : 'Hạ giá bát';
    if ('door' in n) return n.door.open ? 'Đóng cửa' : 'Mở cửa';
    if ('win' in n) return n.win.open ? 'Đóng cửa sổ' : 'Mở cửa sổ';
    if ('wardrobe' in n) return `${n.wardrobe.open ? 'Đóng' : 'Mở'} ${n.wardrobe.name ?? 'tủ'}`;
    if ('tv' in n) return this.tv ? 'Tắt tivi' : 'Bật tivi (YouTube)';
    if ('lamp' in n) return `${this.roomOn[n.lamp] ? 'Tắt' : 'Bật'} đèn ${roomTitle(n.lamp)}`;
    if ('seat' in n) return n.seat.kind === 'sofa' ? 'Ngồi sofa' : n.seat.kind === 'desk' ? 'Ngồi vào bàn học' : 'Ngồi ghế';
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
    const B = this.bounds;
    p.x = Math.min(B.x1, Math.max(B.x0, p.x));
    p.z = Math.min(B.z1, Math.max(B.z0, p.z));
  }

  private resize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h); this.css.setSize(w, h);
  };

  /** factor > 1 moves the camera away. */
  private zoom(f: number) {
    if (this.aerial) this.aerialDist = THREE.MathUtils.clamp(this.aerialDist * f, 8, 40);
    else this.dist = THREE.MathUtils.clamp(this.dist * f, 1.6, 14);
  }

  private look(dx: number, dy: number) {
    this.yaw -= dx * 0.005;
    if (this.aerial) this.aerialPitch = THREE.MathUtils.clamp(this.aerialPitch + dy * 0.004, 0.45, 1.5);
    else if (this.firstPerson) this.fpPitch = THREE.MathUtils.clamp(this.fpPitch - dy * 0.004, -1.3, 1.45);
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
    if (u.tv) this.toggleTv();
    if (u.lamp) this.toggleRoom(u.lamp as string);
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
      const t = e.target as HTMLElement | null; // typing in the settings panel
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      this.keys[e.code] = true;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (e.repeat && !MOVE_KEYS.includes(e.code)) return;
      if (this.lying && MOVE_KEYS.includes(e.code)) { this.standUp(); return; }
      const act: Record<string, () => void> = {
        KeyE: this.interact, KeyV: this.toggleView, KeyR: this.cycleRoof, KeyO: this.toggleAllDoors, KeyT: this.toggleAerial,
        KeyH: () => this.goHome(), KeyK: this.toggleDims, KeyL: this.toggleLights, Space: this.jump, Escape: this.exitTour,
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
      if (this.mode === 'tour' && this.pointers.size >= 2) {
        // two-finger pinch zooms the tour camera
        q.x = e.clientX; q.y = e.clientY;
        const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchD > 0 && d > 0) this.zoom(this.pinchD / d);
        this.pinchD = d; return;
      }
      if (this.mode === 'tour') { const k = e.pointerType === 'touch' ? 1.4 : 1; this.look((e.clientX - q.x) * k, (e.clientY - q.y) * k); }
      q.x = e.clientX; q.y = e.clientY;
    });
    const up = (e: PointerEvent) => {
      const q = this.pointers.get(e.pointerId); if (!q) return;
      const wasPinch = this.pinchD > 0 || this.pointers.size > 1;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchD = 0;
      if (!wasPinch && e.type === 'pointerup' && Math.hypot(e.clientX - q.sx, e.clientY - q.sy) < 6) this.pick(e.clientX, e.clientY);
    };
    on(cv, 'pointerup', up); on(cv, 'pointercancel', up);
    on(cv, 'wheel', (e: WheelEvent) => {
      if (this.mode !== 'tour') return; // OrbitControls zooms in overview
      e.preventDefault(); this.zoom(1 + Math.sign(e.deltaY) * 0.1);
    }, { passive: false });
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = THREE.MathUtils.clamp((now - this.last) / 1000, 0, 0.05); this.last = now;
    const h = this.house;

    // doors, windows and the dish rack animate in both modes (same easing as the original)
    const ease = (l: Leaf) => { const r = l.g.rotation, a = l.axis ?? 'y'; r[a] += (l.t - r[a]) * Math.min(1, dt * 7); if (Math.abs(l.t - r[a]) < 0.002) r[a] = l.t; };
    h.doors.forEach(ease); h.windows.forEach(w => w.leaves.forEach(ease)); h.wardrobes.forEach(w => w.leaves.forEach(ease));
    const r = this.rackT += ((this.rackDown ? 1 : 0) - this.rackT) * Math.min(1, dt * 6);
    h.rack.group.position.set(-0.24 * r, -0.5 * r, 0);
    h.rack.armL.position.set(9.725 - 7 - 0.12 * r, 1.8 - 0.25 * r, 1.1 - 4.5); h.rack.armL.rotation.z = 0.45 * r;
    h.rack.armR.position.set(9.725 - 7 - 0.12 * r, 1.8 - 0.25 * r, 2.15 - 4.5); h.rack.armR.rotation.z = 0.45 * r;

    let room: string | null = null, n: Interactable | null = null;
    if (this.mode === 'overview') {
      h.roof.visible = this.roofOn && !this.structOn && !this.pipesOn;
      h.loft.visible = this.loftOn;
      h.labels.forEach(s => { s.visible = !this.roofOn && !this.dimsOn; });
      this.dims.group.visible = this.dimsOn && !this.roofOn;
      this.dims.rooms.forEach(g => { g.visible = true; }); this.dims.exterior.visible = true;
      this.controls.update();
    } else {
      this.updatePlayer(dt, now);
      room = roomAt(this.p.x, this.p.z);
      h.roof.visible = this.roofMode === 'on' || (this.roofMode === 'auto' && !room && !this.firstPerson && !this.aerial);
      h.loft.visible = true;
      h.labels.forEach(s => { s.visible = false; });
      // while touring, only annotate the room you are in (or the outside dimensions in the yard)
      this.dims.group.visible = this.dimsOn;
      this.dims.rooms.forEach((g, k) => { g.visible = k === room; }); this.dims.exterior.visible = !room;
      this.updateCamera(dt);
      n = this.lying ? null : this.nearest();
      this.minimap.draw(this.p.x, this.p.z, this.p.face, this.yaw);
    }

    const hud: HudState = {
      mode: this.mode, roofOn: this.roofOn, loftOn: this.loftOn, rackDown: this.rackDown,
      anyDoorClosed: h.doors.some(d => !d.open), anyWindowClosed: h.windows.some(w => !w.open), anyWardrobeClosed: h.wardrobes.some(w => !w.open), dimsOn: this.dimsOn,
      room: room ?? (this.mode === 'tour' && this.p.z < -4.5 && this.p.z > -6.1 && this.p.x > -8.3 && this.p.x < this.map.mx(14.6) - 7 ? 'Lối đi bên hông' : 'Sân vườn'), prompt: this.mode === 'tour' ? this.promptFor(n) : null,
      firstPerson: this.firstPerson, aerial: this.aerial, roofMode: this.roofMode, lying: this.lying?.kind === 'lie', sitting: this.lying?.kind === 'sit',
      houseSize: `${fmtM(this.map.houseD)} × ${fmtM(this.map.houseW)} m`, lightsOn: this.lightsOn, tvOn: !!this.tv,
      pipes: this.pipesOn,
      structure: this.structOn ? (({ columns, footings, groundBeam, tieBeam }) => ({ columns, footings, groundBeam: Math.round(groundBeam), tieBeam: Math.round(tieBeam) }))(h.structure) : null,
    };
    if (this.dims.group.visible) faceCamera(this.camera.getWorldDirection(new THREE.Vector3()));
    const key = JSON.stringify(hud);
    if (key !== this.hudKey) { this.hudKey = key; this.onHud(hud); }
    this.renderer.render(this.scene, this.camera);
    if (this.tv) this.css.render(this.cssScene, this.camera);
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
      hero.root.visible = false; this.marker.visible = false;
      return;
    }
    // player marker for the aerial view
    this.marker.visible = this.aerial;
    if (this.aerial) {
      const at = this.lying ? hero.root.position : new THREE.Vector3(p.x, p.y, p.z);
      this.marker.position.set(at.x, (this.lying ? this.lying.top : floorTop(this.house, p.x, p.z)) + 0.03, at.z);
      this.marker.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.08);
    }
    if (this.aerial) {
      // bird's-eye: no wall avoidance, the roof is hidden so the whole floor plan is visible
      if (!this.lying) this.camTarget.lerp(new THREE.Vector3(p.x, p.y + 0.8, p.z), Math.min(1, dt * 6));
      const ap = this.aerialPitch;
      cam.position.copy(this.camTarget).add(new THREE.Vector3(Math.sin(this.yaw) * Math.cos(ap), Math.sin(ap), Math.cos(this.yaw) * Math.cos(ap)).multiplyScalar(this.aerialDist));
      cam.lookAt(this.camTarget);
      hero.root.visible = true;
      return;
    }
    if (!this.lying) this.camTarget.lerp(new THREE.Vector3(p.x, p.y + 1.35, p.z), Math.min(1, dt * 10));
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // pull the camera in front of walls between it and the player
    this.raycaster.set(this.camTarget, off); this.raycaster.far = this.dist;
    // door, wardrobe and window leaves block too (when open they have swung out of the way)
    const leaves = [...this.house.doors, ...this.house.wardrobes.flatMap(w => w.leaves), ...this.house.windows.flatMap(w => w.leaves)].map(l => l.g.children[0]);
    const roofMeshes = (g: THREE.Group) => g.visible ? g.children.filter(c => (c as THREE.Mesh).isMesh) : [];
    const obs: THREE.Object3D[] = [...this.house.occluders, ...leaves, ...roofMeshes(this.house.roof)];
    const hit = this.raycaster.intersectObjects(obs, false)[0];
    const d = hit ? Math.max(0.35, hit.distance - 0.2) : this.dist;
    cam.position.copy(this.camTarget).addScaledVector(off, d);
    const gy = floorTop(this.house, cam.position.x, cam.position.z) + 0.15;
    if (cam.position.y < gy) cam.position.y = gy;
    cam.lookAt(this.camTarget);
    hero.root.visible = d > 0.6;
  }
}
