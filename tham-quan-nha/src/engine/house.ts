// Geometry of the 9 x 14 m house, ported from ../mo_hinh_3d_nha_ve_sinh_sen_lavabo.html.
// All helpers take PLAN coordinates in meters (house spans x 0..14, z 0..9);
// they subtract (7, 4.5) so the house is centered on the world origin.
import * as THREE from 'three';
import { BED_LIGHTS, ELEC, OUT_EAVE, OUT_PORCH, OUT_WASH, bedLamp } from './electrical';
import { PIPES, PIPE_STYLE, ROOF_DRAIN, RAIN_PITS, SHAFT, FLOOR_DRAINS, SEPTIC, MANHOLES, VALVES, TAPS, TANK, SOLAR } from './plumbing';
import { LIGHT_SPACING, MAIN_SIDE, MAIN_TRANSOM, PlanMap, ROOM_DIMS, THO_SCREEN, THO_X, GROUND, PORCH_OUT, PORCH_NZ, PORCH_COL, PORCH_FLOOR, PORCH_EAVE, RISERS, RISE, emptyLayout, type Layout } from './layout';

export type Dir = '+x' | '-x' | '+z' | '-z';
/** Axis-aligned box in WORLD coordinates. */
export interface Rect { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }
/** Something that swings on a vertical hinge: g.rotation.y eases from c (closed) to o (open); t is the target. */
export interface Leaf { g: THREE.Group; c: number; o: number; t: number; /** hinge axis, default 'y' (vertical) */ axis?: 'x' | 'y' }
export interface Door extends Leaf { open: boolean; len: number; /** set when the house is mirrored: world z = mirror - local z */ mirror?: number }
/** Something with hinged leaves that open together: a casement/awning window or a wardrobe. x,z = its front centre. */
export interface Win { leaves: Leaf[]; open: boolean; x: number; z: number; /** cabinets: half-width of the front and display name */ half?: number; name?: string; /** axis the front runs along (default 'x') */ along?: 'x' | 'z' }
/** Where the character sits: hip position (WORLD), facing yaw, seat height. */
export interface Seat { x: number; z: number; face: number; top: number; kind: 'chair' | 'sofa' | 'desk' }
/** Bed in WORLD coords; the headboard is on the z0 side ('N'), z1 side ('S'), x0 side ('E') or x1 side ('W'). */
export interface Bed { x0: number; z0: number; x1: number; z1: number; head: 'N' | 'S' | 'E' | 'W'; top: number }
export interface House {
  /** Obstacles spanning walking height (walls, furniture, closed glass). */
  solids: Rect[];
  /** Walkable top surfaces (ground, floor slab, porch, steps, tiles). */
  floors: Rect[];
  /** Floor tiles with colour, for the minimap. */
  tiles: (Rect & { color: string })[];
  /** Tall opaque meshes the 3rd-person camera must not pass through. */
  occluders: THREE.Mesh[];
  doors: Door[];
  /** The two WC doors (opened by the "Xem nhà vệ sinh" overview preset). */
  /** The WC doors (opened by the "Xem nhà vệ sinh" preset); fewer if hidden in the settings. */
  wcDoors: Door[];
  windows: Win[];
  /** Bedroom wardrobes with opening doors. */
  wardrobes: Win[];
  beds: Bed[];
  seats: Seat[];
  /** Room name sprites, shown in the overview when the roof is hidden. */
  labels: THREE.Sprite[];
  clickables: THREE.Object3D[];
  roof: THREE.Group;
  /** The WC slab at +2.4 (WC ceiling / storage-loft floor) and the boxes on it, hidden on its own ("mái kho"). */
  loft: THREE.Group;
  rack: { group: THREE.Group; armL: THREE.Mesh; armR: THREE.Mesh };
  /** Centre of the dish rack, WORLD (for the E prompt). */
  rackPos: [number, number];
  /** The living-room TV screen (faces -x, the living room). */
  tvScreen: THREE.Mesh;
  /** Outdoor lighting, switched by Game.setLights (all off / daylight after a build). */
  lights: HouseLights;
  /** World z the house is mirrored about times 2 (z -> mirrorZ - z), or null when not mirrored. */
  mirrorZ: number | null;
  /** Everything the house added to the scene (removed and disposed on rebuild). */
  root: THREE.Group;
  /** Furniture / fixtures that can be resized and moved in the settings panel. */
  objects: ObjInfo[];
  /** Preliminary structural frame (footings, ground beams, columns, tie beams), hidden until shown; beam lengths in m. */
  pipes: THREE.Group;
  roofFrame: RoofFrame;
  structure: { group: THREE.Group; columns: number; footings: number; groundBeam: number; tieBeam: number;
    /** Column centres and tie-beam centre lines in EDITED plan coords (for the labelled C / D plan in the PDF). */
    cols: { x: number; z: number; porch: boolean; /** footing type MĐ1…MĐ4 and size (m); '' / 0 on the porch */ foot: string; B: number; /** C1 / C2 / C3 */ ct: string; trib: number }[]; beams: { x0: number; z0: number; x1: number; z1: number; porch: boolean }[] };
  /** Wall boxes [x0, z0, x1, z1] in DEFAULT plan coords (map them with mx / mz), for drawn floor plans. */
  walls: number[][];
  /** Light switches (WORLD x, z) and the light group they toggle (a room, or `bedLamp(room)`). */
  switches: { room: string; x: number; z: number }[];
}
/** Roof slab + steel roof frame (sàn mái BTCT, khung thép mái ngói), all in EDITED plan coords (x, z) + height y. */
export type RoofKey = 'main' | 'tho' | 'sanh';
export interface RoofMember { kind: 'rafter' | 'batten' | 'ridge' | 'hip' | 'purlin'; roof: RoofKey; a: [number, number, number]; b: [number, number, number] }
export interface RoofProp { x: number; z: number; y0: number; y1: number; roof: RoofKey; type: 'ridge' | 'ring' }
export interface RoofFrame {
  members: RoofMember[]; props: RoofProp[]; slabs: { x0: number; z0: number; x1: number; z1: number; y: number }[];
  /** plan area of tiles each roof shows (m²), visible ridge / hip / valley lengths along the slope (m) */
  area: Record<RoofKey, number>; ridge: number; hips: number; valley: number; ridgeEnds: number; hipFeet: number;
  /** valley (máng xối) points and the downpipes where the valleys reach the eaves, plan coords */
  valleyPts: [number, number][]; downpipes: [number, number][];
  /** each roof's outline / ridge / hips for the plan sheets */
  roofs: { k: RoofKey; X0: number; X1: number; Z0: number; Z1: number; E: number; t: number; hl: boolean; hr: boolean }[];
  /** visible roof outline (eave / gable edges) as grid edge midpoints, and the grid owner sampler */
  edgePts: [number, number][]; t: number;
}
export interface HouseLights {
  /** Light washes on the walls (additive planes), shown only when the lights are on. */
  glows: THREE.Object3D[];
  /** Bulb faces: bright when on, grey when off. */
  bulbs: THREE.MeshBasicMaterial[];
  /** Real lights (wall sconces, the big porch light); intensity 0 when off. */
  points: { light: THREE.PointLight; on: number }[];
  hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight;
  /** Number of eave downlights / wall sconces / indoor ceiling lights. */
  downlights: number; sconces: number; indoor: number;
  /** Indoor lights per group (a ROOM_DIMS key, or `bedLamp(room)` for a bed-foot light), switched by its switches. */
  rooms: Record<string, { points: { light: THREE.PointLight; on: number }[]; glows: THREE.Object3D[]; bulb: THREE.MeshBasicMaterial }>;
  /** Ceiling fixtures in EDITED plan coords, for the electrical plan. */
  fixtures: { x: number; z: number; kind: 'down' | 'spot' | 'ceiling' | 'pendant' | 'fan' | 'porch' | 'sconce' | 'eave'; room: string }[];
}
/** An editable piece of furniture. Sizes are in meters: w along x, d along z, h height. */
export interface ObjInfo {
  id: string; label: string; room: string; scalable: boolean; base: [number, number, number]; size: [number, number, number];
  /** Default footprint in plan coords [x0, z0, x1, z1] (before the layout moved it). */
  box: [number, number, number, number];
}

export const toWorld = (x: number, z: number): [number, number] => [x - 7, z - 4.5];

export function buildHouse(world: THREE.Scene, map: PlanMap = new PlanMap(), layout: Layout = emptyLayout()): House {
  // Everything goes into one root group so the house can be rebuilt when the layout changes.
  // root holds everything (disposed on rebuild); scene is the house itself, which may be mirrored front-to-back
  const root = new THREE.Group(); world.add(root);
  const scene = new THREE.Group(); root.add(scene);
  const { mx, mz } = map;
  const solids: Rect[] = [], floors: Rect[] = [], tiles: House['tiles'] = [], occluders: THREE.Mesh[] = [];
  const seats: Seat[] = [], beds: Bed[] = [], wardrobes: Win[] = [], objects: ObjInfo[] = [];
  /** Inner group of the object being built (see obj()); null while building structure. */
  let cur: THREE.Group | null = null;
  /** true while building with coordinates that are already edited (no mapping in box()). */
  let noMap = false;
  const add = (o: THREE.Object3D) => (cur || scene).add(o);
  const H = 4.2; // walls run up under the roof; the eave line (wall height outside) is E1
  // eave heights: main roof, ancestor-room roof, porch roof. All equal (as in the client's reference photo) so the
  // white fascia and the mouldings run in one straight line from the front of the porch to the back.
  // eaves, as in the owner's reference section 1-1: main roof on the 4.1 m walls / roof slab (+4.100). The
  // ancestor-room roof joins it as an L at the same eave; only the porch roof steps down: porch +3.420
  const E1=4.1,E2=E1,E3=3.42;
  const PC=E3-0.5; // porch column top / underside of the porch beam (2.92: the reference column is 2.90)
  // Roof surface height over an EDITED plan point (the highest roof covering it, as rendered: the porch roof is
  // clipped over the house, the ancestor-room roof east of where it runs under the main roof); -Infinity if none.
  const RS=map.roofs,RF=RS.main,RT=RS.tho,RP=RS.sanh;
  const thoR=E2+(RT.W/2)*RT.t,thoCut=RF.X0+Math.max(0,thoR+0.12-E1)/RF.t;
  // Along the main roof's east edge, where the sub roofs run into it, the valleys between the roofs are open from
  // the side, so there stay under the LOWEST roof covering the point. Further in, the main roof hides everything:
  // stay under the highest (the porch roof's thin strip over the facade wall must not pull that wall down).
  // Flat concrete roof (mái bằng) over the WC block, for the 1500 L water tank: the main hip roof is cut away for
  // x > FX, z > FZ (edited plan coords) out to its eaves, and a slab sits there at the eave height.
  const FX=mx(10.72),FZ=mz(6.05),inFlat=(x:number,z:number)=>x>FX&&z>FZ;
  const roofAt=(x:number,z:number)=>{let hi=-Infinity,lo=Infinity;
    for(const [r,E,k] of [[RF,E1,'main'],[RT,E2,'tho'],[RP,E3,'sanh']] as const){
      if(x<r.X0||x>r.X1||z<r.Z0||z>r.Z1)continue;
      if(k==='tho'&&x>thoCut)continue;
      if(k==='sanh'&&x>mx(1.0)&&z>mz(0.2))continue;
      const h=k==='main'&&inFlat(x,z)?E:E+Math.min(x-r.X0,z-r.Z0,r.Z1-z,k==='main'?r.X1-x:Infinity)*r.t;hi=Math.max(hi,h);lo=Math.min(lo,h);}
    // the ancestor-room front wall rises to its own roof even where the lower porch roof meets it
    return x<RF.X0+0.6&&x>mx(THO_X+0.25)&&lo<Infinity?lo:hi;};
  /** A box (default plan coords) whose top is kept 3 cm under the roofs: where a roof is lower than y1 it is cut
   *  into short pieces, each as tall as the roof above it allows (east-end walls under the low sub roofs). */
  function underRoof(x0:number,z0:number,x1:number,z1:number,y0:number,y1:number,mat:THREE.MeshStandardMaterial,edges:boolean){
    const alongX=Math.abs(x1-x0)>=Math.abs(z1-z0),a0=alongX?x0:z0,a1=alongX?x1:z1;
    const cap=(p:number,q:number)=>{let c=Infinity;
      for(const a of [p,(p+q)/2,q])for(const b of alongX?[z0,z1]:[x0,x1]){const h=alongX?roofAt(mx(a),mz(b)):roofAt(mx(b),mz(a));if(h>-Infinity)c=Math.min(c,h-0.03);}
      return c;};
    if(cap(a0,a1)>=y1){box(x0,z0,x1,z1,y0,y1,mat,edges);return;}
    const n=Math.max(1,Math.ceil(Math.abs(a1-a0)/0.25));
    for(let i=0;i<n;i++){const p=a0+(a1-a0)*i/n,q=a0+(a1-a0)*(i+1)/n,top=Math.min(y1,cap(p,q));if(top<=y0+1e-3)continue;
      if(alongX)box(p,z0,q,z1,y0,top,mat,false);else box(x0,p,x1,q,y0,top,mat,false);}}
  function box(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial,
    edges = true, em?: THREE.LineBasicMaterial | null, parent?: THREE.Object3D): THREE.Mesh {
    // structure is mapped point by point; furniture is built in default coords and moved as a whole by obj()
    if (!cur && !noMap) { x0 = mx(x0); x1 = mx(x1); z0 = mz(z0); z1 = mz(z1); }
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0));
    const m = new THREE.Mesh(g, mat);
    m.position.set((x0 + x1) / 2 - 7, (y0 + y1) / 2, (z0 + z1) / 2 - 4.5);
    (parent || cur || scene).add(m);
    if (edges) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), em || edgeMat); e.position.copy(m.position); (parent || cur || scene).add(e); }
    if (!parent) {
      const r: Rect = { x0: Math.min(x0, x1) - 7, x1: Math.max(x0, x1) - 7, z0: Math.min(z0, z1) - 4.5, z1: Math.max(z0, z1) - 4.5, y0, y1 };
      if (y1 <= 0.05 && y1 >= GROUND - 0.05) { floors.push(r); if (y0 >= 0 && y1 <= 0.03) tiles.push({ ...r, color: '#' + mat.color.getHexString() }); }
      else if (y0 < 1.3 && y1 > 0.25) solids.push(r);
      // walls, wardrobes and the wall above door openings block the 3rd-person camera
      if (!mat.transparent && y1 - y0 > 1.2 && y1 > 2) occluders.push(m);
    }
    return m;
  }
  const hemi=new THREE.HemisphereLight(0xffffff,0x8a8070,0.8*Math.PI);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffffff,0.7*Math.PI);sun.position.set(-14,20,-10);scene.add(sun);
  [[-3.5,3.0,-2.2],[1.6,3.0,-2.6],[5.4,3.0,2.5],[5.0,3.0,1.0]].forEach(p=>{const l=new THREE.PointLight(0xfff1dc,0.5*Math.PI,7,1);l.position.set(p[0],p[1],p[2]);scene.add(l);});
  const M=(c:number)=>new THREE.MeshStandardMaterial({color:c,roughness:0.85});
  const edgeMat=new THREE.LineBasicMaterial({color:0x444444,transparent:true,opacity:0.35});
  
  function cyl(x:number,y:number,z:number,r1:number,r2:number,h:number,mat:THREE.Material,rx?:number,rz?:number){if(!cur){x=mx(x);z=mz(z);}const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,20),mat);m.position.set(x-7,y,z-4.5);if(rx)m.rotation.x=rx;if(rz)m.rotation.z=rz;add(m);return m;}
  /** Build one piece of furniture in default plan coords, then move it with the wall it is closest to (the
   *  room may have been resized) and apply the size / offset override from the layout. Rects, seats, beds and
   *  wardrobes recorded while building are transformed the same way. */
  function obj(id:string,label:string,room:string,scalable:boolean,build:()=>void){
    const outer=new THREE.Group(),inner=new THREE.Group();outer.add(inner);scene.add(outer);
    const n0=[solids.length,floors.length,tiles.length,seats.length,beds.length,wardrobes.length];
    cur=inner;try{build();}finally{cur=null;}
    inner.updateMatrixWorld(true);
    const bb=new THREE.Box3().setFromObject(inner);
    const x0=bb.min.x+7,x1=bb.max.x+7,z0=bb.min.z+4.5,z1=bb.max.z+4.5,h=bb.max.y;
    const o=layout.objects[id]??{};
    const sx=scalable&&o.w?o.w/(x1-x0):1,sz=scalable&&o.d?o.d/(z1-z0):1,sy=scalable&&o.h?o.h/h:1;
    const ax=map.x.anchor(x0,x1),az=map.z.anchor(z0,z1);
    const px=ax.pivot-7,pz=az.pivot-4.5,tx0=ax.to+(o.dx??0)-7,tz0=az.to+(o.dz??0)-4.5;
    inner.position.set(-px,0,-pz);outer.position.set(tx0,0,tz0);outer.scale.set(sx,sy,sz);
    const tx=(x:number)=>tx0+sx*(x-px),tz=(z:number)=>tz0+sz*(z-pz);
    const tr=(r:{x0:number;x1:number;z0:number;z1:number})=>{const a=tx(r.x0),b=tx(r.x1),c=tz(r.z0),d=tz(r.z1);r.x0=Math.min(a,b);r.x1=Math.max(a,b);r.z0=Math.min(c,d);r.z1=Math.max(c,d);};
    for(const r of [...solids.slice(n0[0]),...floors.slice(n0[1]),...tiles.slice(n0[2])]){tr(r);r.y0*=sy;r.y1*=sy;}
    for(const s of seats.slice(n0[3])){s.x=tx(s.x);s.z=tz(s.z);s.top*=sy;}
    for(const b of beds.slice(n0[4])){tr(b);b.top*=sy;}
    for(const w of wardrobes.slice(n0[5])){w.x=tx(w.x);w.z=tz(w.z);if(w.half)w.half*=sx;}
    objects.push({id,label,room,scalable,base:[x1-x0,z1-z0,h],size:[(x1-x0)*sx,(z1-z0)*sz,h*sy],box:[x0,z0,x1,z1]});
    return outer;}
  // Ground, split around the ditch. South side of the house (facade z = 0, on the left seen from the porch):
  // a 1.5 m paved side path, a 1.8 m boundary wall, and beyond it a ditch (mương) running the whole length.
  const site0=scene.children.length,siteF0=floors.length,siteS0=solids.length;
  const grass=M(0xb7cc9c);
  box(-8,-6,20,-3.4,GROUND-0.02,GROUND,grass,false);box(-8,-1.7,20,15,GROUND-0.02,GROUND,grass,false);
  // Raised concrete apron (sân bê tông đổ cao, owner's reference house) at the floor level (−0.010): along the side
  // path from x 0.6 to the west end and round the west gable, so the kitchen and side doors need no steps; a 1:4
  // ramp (3 m) brings it down to the yard at the front.
  {const AP=-0.01,apMat=M(0xc4c0b8),RX0=-2.4,RX1=0.6;
    box(RX1,-1.5,15.5,0,GROUND,AP,apMat);box(14,0,15.5,9.6,GROUND,AP,apMat);
    const X0=RX0-7,X1=RX1-7,Z0=-1.5-4.5,Z1=0-4.5,y0=GROUND,y1=AP;
    const v=[X0,y0,Z0, X1,y1,Z0, X1,y1,Z1, X0,y0,Z1, X1,y0,Z0, X1,y0,Z1];
    const idx=[0,2,1, 0,3,2, 0,1,4, 3,5,2, 1,2,5, 1,5,4];
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setIndex(idx);geo.computeVertexNormals();
    const ramp=new THREE.Mesh(geo,apMat);scene.add(ramp);scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),edgeMat));
    const N=15;for(let i=0;i<N;i++){const a=X0+(X1-X0)*i/N,b=X0+(X1-X0)*(i+1)/N;floors.push({x0:a,x1:b,z0:Z0,z1:Z1,y0:GROUND,y1:y0+(y1-y0)*(i+0.5)/N});}}
  box(-8,-1.7,20,-1.5,GROUND,GROUND+1.8,M(0xe9e5dc));box(-8,-1.73,20,-1.47,GROUND+1.8,GROUND+1.86,M(0xa9a39a),false); // wall + coping
  const earth=M(0x7d6a4f);
  box(-8,-3.4,20,-3.3,-1.2,GROUND,earth,false);box(-8,-1.8,20,-1.7,-1.2,GROUND,earth,false);box(-8,-3.4,20,-1.7,-1.25,-1.2,M(0x4f4636),false);
  box(-8,-3.3,20,-1.8,-1.2,-0.8,new THREE.MeshStandardMaterial({color:0x5f8f86,transparent:true,opacity:0.85,roughness:0.15}),false);
  const site1=scene.children.length,siteF1=floors.length,siteS1=solids.length; // the site: not mirrored
  box(0,0,14,9,GROUND,0,M(0xcfc9be));box(THO_X,4.95,0,9,GROUND,0,M(0xcfc9be)); // + the ancestor room's front strip
  const PO=PORCH_OUT; // porch pushed out (deeper porch)
  box(1.0-PORCH_FLOOR,0,0,4.95,GROUND,0,M(0xe2ddd4));box(1.0-PORCH_FLOOR,4.95,-0.4,5.45,GROUND,0,M(0xe2ddd4)); // under the north column
  // ---- porch front, after the owner's reference photo but in the house colours ('Phào dưới' stone, 'Cột' caps): steps
  // between two stone pedestals (capstones, a white pot with a dracaena on each) in front of the porch columns, marble column bases, and a low
  // stone-kerbed planting bed along the ancestor room's front wall under its window ----
  /** Stone with light veins, in a house colour (the palette in Settings → Màu sắc drives the porch). */
  const marbleOf=(hex:number)=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d')!;
    const col=new THREE.Color(hex),r0=col.r*255,g0=col.g*255,b0=col.b*255;g.fillStyle=`rgb(${r0},${g0},${b0})`;g.fillRect(0,0,256,256);
    for(let i=0;i<900;i++){const d=(Math.random()-0.5)*28;g.fillStyle=`rgba(${r0+d},${g0+d},${b0+d},.35)`;g.fillRect(Math.random()*256,Math.random()*256,3,3);}
    g.lineCap='round';for(let i=0;i<9;i++){g.strokeStyle=`rgba(235,236,238,${0.18+Math.random()*0.3})`;g.lineWidth=0.6+Math.random()*1.6;g.beginPath();
      let x=Math.random()*256,y=Math.random()*256;g.moveTo(x,y);for(let k=0;k<6;k++){x+=(Math.random()-0.3)*70;y+=(Math.random()-0.5)*60;g.lineTo(x,y);}g.stroke();}
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({map:t,roughness:0.35,metalness:0.05});};
  const marble=marbleOf(map.color('bottomBand'));
  const capWhite=M(map.color('column')),granite=M(map.color('bottomBand')),nosing=M(new THREE.Color(map.color('bottomBand')).lerp(new THREE.Color(0xffffff),0.25).getHex());
  // steps (bậc tam cấp): RISERS (5) risers of ≈152 from the yard at −0.76, 300 treads, between the cheek walls (z 0.51..4.66)
  const S0=0.51,S1=4.66;
  const SE=1.0-PORCH_FLOOR,SX0=SE-RISERS*0.3; // porch edge, foot of the steps (RISERS treads of 300)
  for(let k=0;k<RISERS;k++){const x=SE-(RISERS-k)*0.3,y0=GROUND+k*RISE,y1=GROUND+(k+1)*RISE;
    box(x,S0,SE,S1,y0,y1,granite);box(x-0.005,S0,x+0.03,S1,y1-0.02,y1+0.002,nosing,false);}
  const leaf2=M(0x5c9a4a);
  // stair cheek walls (bờ tường bậc tam cấp) flanking the steps, centred on the porch column lines, top flush with the
  // porch floor (owner's reference): the porch columns stand on them (each wall runs out past its column base); no pots
  for(const [z0,z1] of [[0.11-0.4,S0],[S1,PORCH_NZ+0.4]]){
    const cx0=Math.min(SX0-0.05,PORCH_COL-0.45);
    box(cx0,z0,SE,z1,GROUND,-0.04,marble);box(cx0-0.03,z0-0.03,SE,z1+0.03,-0.04,0,capWhite);}
  // planting bed along the ancestor room's front wall (x THO_X), from the right pedestal to the back corner
  {const bx0=-0.75,bx1=THO_X,bz0=5.49,bz1=8.95,kerb=M(map.color('bottomBand')),kh=GROUND+0.28;
    box(bx0,bz0,bx0+0.08,bz1,GROUND,kh,kerb);box(bx0,bz0,bx1,bz0+0.08,GROUND,kh,kerb);box(bx0,bz1-0.08,bx1,bz1,GROUND,kh,kerb);
    box(bx0+0.08,bz0+0.08,bx1,bz1-0.08,GROUND,kh-0.05,M(0x5a4532),false);
    const bush=[M(0x2f6b34),M(0x3d7d3a),M(0x4f8f45)];
    for(let i=0;i<9;i++){const z=bz0+0.3+i*(bz1-bz0-0.6)/8,r=0.17+((i*37)%5)*0.025;
      const m=new THREE.Mesh(new THREE.SphereGeometry(r,14,10),bush[i%3]);m.scale.set(1,0.8,1);m.position.set((bx0+bx1)/2-7,kh-0.05+r*0.7,z-4.5);scene.add(m);
      if(i%2===0)for(let k=0;k<5;k++){const a=k/5*Math.PI*2,lf=new THREE.Mesh(new THREE.SphereGeometry(0.12,10,6),leaf2);lf.scale.set(1.3,0.12,0.7);
        lf.position.set((bx0+bx1)/2-7+Math.cos(a)*0.16,kh+0.35+k*0.03,z-4.5+Math.sin(a)*0.16);lf.rotation.set(0,-a,0.5);scene.add(lf);}}}
  // Floor and wall tiles (owner's choice): 800 × 800 white cloud marble (trắng vân mây) in every dry room and on the
  // porch; the bathrooms (WC1, WC2, the Lavabo / washing zone) 400 × 400 grey anti-slip on the floor, WC walls 800 × 400
  // grey to the WC ceiling. One canvas tile each (with its 3 mm joint), repeated per surface from its corner.
  const tileCanvas=(kind:'marble'|'wcFloor'|'wcWall')=>{const W=512,H=kind==='wcWall'?256:512,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d')!;
    let seed=kind.length*977;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    if(kind==='marble'){g.fillStyle='#f4f3f0';g.fillRect(0,0,W,H);
      for(let i=0;i<70;i++){const x=rnd()*W,y=rnd()*H,r=30+rnd()*110,gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,`rgba(196,198,204,${0.05+rnd()*0.08})`);gr.addColorStop(1,'rgba(196,198,204,0)');g.fillStyle=gr;g.fillRect(0,0,W,H);}
      for(let v=0;v<7;v++){let x=rnd()*W,y=rnd()*H,a=rnd()*Math.PI*2;g.strokeStyle=`rgba(150,154,162,${0.25+rnd()*0.3})`;g.lineWidth=0.6+rnd()*1.4;g.beginPath();g.moveTo(x,y);
        for(let k=0;k<40;k++){a+=(rnd()-0.5)*0.7;x+=Math.cos(a)*9;y+=Math.sin(a)*9;g.lineTo(x,y);}g.stroke();}}
    else{const base=kind==='wcWall'?[128,133,139]:[150,154,158];g.fillStyle=`rgb(${base})`;g.fillRect(0,0,W,H);
      const img=g.getImageData(0,0,W,H);for(let i=0;i<img.data.length;i+=4){const n=(rnd()-0.5)*(kind==='wcWall'?10:18);img.data[i]+=n;img.data[i+1]+=n;img.data[i+2]+=n;}g.putImageData(img,0,0);
      if(kind==='wcWall')for(let v=0;v<5;v++){let x=rnd()*W,y=rnd()*H,a=rnd()*0.6-0.3;g.strokeStyle='rgba(175,180,186,.35)';g.lineWidth=1;g.beginPath();g.moveTo(x,y);for(let k=0;k<30;k++){a+=(rnd()-0.5)*0.4;x+=Math.cos(a)*10;y+=Math.sin(a)*6;g.lineTo(x,y);}g.stroke();}}
    g.strokeStyle=kind==='marble'?'#cfcac0':'#6d7378';g.lineWidth=3;g.strokeRect(1.5,1.5,W-3,H-3);
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;t.colorSpace=THREE.SRGBColorSpace;return t;};
  const TILE_TEX={marble:tileCanvas('marble'),wcFloor:tileCanvas('wcFloor'),wcWall:tileCanvas('wcWall')};
  /** a material of that tile repeated over a u × v metre face (tile tu × tv metres) */
  const tileMat=(k:keyof typeof TILE_TEX,u:number,v:number,tu:number,tv:number)=>{const t=TILE_TEX[k].clone();t.needsUpdate=true;t.repeat.set(u/tu,v/tv);
    return new THREE.MeshStandardMaterial({map:t,roughness:k==='marble'?0.22:0.6,metalness:0});};
  for(const [x0,z0,x1,z1,k] of [[1.0-PORCH_FLOOR,0,1.0,4.95,'marble'],[1.2,0.2,5.95,4.95,'marble'],[5.95,0.2,9.95,4.95,'marble'],[10.05,4.05,13.8,4.95,'marble'],[10.05,0.2,13.8,3.95,'marble'],[THO_X+0.2,5.05,2.55,8.8,'marble'],[2.71,5.05,6.5,8.8,'marble'],[6.66,5.05,10.72,8.8,'marble'],
    [10.82,5.05,13.8,6.05,'wcFloor'],[10.82,6.15,12.46,8.8,'wcFloor'],[12.56,6.15,13.8,8.8,'wcFloor']] as [number,number,number,number,'marble'|'wcFloor'][]){
    const T=k==='marble'?0.8:0.4;box(x0,z0,x1,z1,0,0.012,tileMat(k,x1-x0,z1-z0,T,T),false);}
  box(2.2,1.3,5.0,3.0,0.012,0.02,M(0xd9d2c4),false);
  // Window openings [x0,z0,x1,z1,y0,y1] (plan). The original drew glass over solid walls;
  // here walls are cut around them so the sashes can swing open.
  // openings hidden in Cài đặt → Cửa are simply not built: no hole, no leaf, the wall stays closed
  const WINS=map.windows.filter(w=>!w.hidden),WIN=WINS.map(w=>w.rect),DOORS=map.doors.filter(d=>!d.hidden);
  // WC wall tiles 800 × 400 grey (owner's choice), floor to the WC ceiling, on the inside faces of both bathrooms,
  // left open at the doors and windows
  {const HT=2.4,o=0.02;
    const skin=(axis:'x'|'z',at:number,a0:number,a1:number,dir:number)=>{
      const holes:[number,number,number,number][]=[];
      for(const d of DOORS)if(d.spec.axis===axis&&Math.abs(d.spec.at-at)<0.12)holes.push([d.span[0],d.span[1],0,d.spec.kind==='main'?d.h+MAIN_TRANSOM:d.h]);
      for(const w of WIN){const [x0,z0,x1,z1,y0,y1]=w;if(axis==='x'&&z0<=at+0.05&&z1>=at-0.05)holes.push([x0,x1,y0,y1]);if(axis==='z'&&x0<=at+0.05&&x1>=at-0.05)holes.push([z0,z1,y0,y1]);}
      const hs=holes.filter(h=>h[1]>a0&&h[0]<a1).sort((p,q)=>p[0]-q[0]);
      const piece=(b0:number,b1:number,y0:number,y1:number)=>{if(b1-b0<0.01||y1-y0<0.01)return;const m=tileMat('wcWall',b1-b0,y1-y0,0.8,0.4);
        const t=m.map!;t.offset.set(((b0-a0)/0.8)%1,(y0/0.4)%1);
        if(axis==='x')box(b0,Math.min(at,at+dir*o),b1,Math.max(at,at+dir*o),y0,y1,m,false);else box(Math.min(at,at+dir*o),b0,Math.max(at,at+dir*o),b1,y0,y1,m,false);};
      let c=a0;for(const h of hs){const h0=Math.max(a0,h[0]),h1=Math.min(a1,h[1]);piece(c,h0,0,HT);piece(h0,h1,0,Math.min(HT,h[2]));piece(h0,h1,Math.min(HT,h[3]),HT);c=h1;}piece(c,a1,0,HT);};
    // WC1 (x 10.82..12.46) and WC2 (x 12.56..13.8), z 6.15..8.8
    for(const [x0,x1] of [[10.82,12.46],[12.56,13.8]]){skin('x',6.15,x0,x1,1);skin('x',8.8,x0,x1,-1);skin('z',x0,6.15,8.8,1);skin('z',x1,6.15,8.8,-1);}}
  // Door openings as wall holes (the lintel above each one is the wall left over). The main entrance hole also
  // takes the transom (MAIN_TRANSOM above the leaves).
  const doorHole=(d:typeof DOORS[number])=>{const top=d.spec.kind==='main'?d.h+MAIN_TRANSOM:d.h,[a0,a1]=d.span,c=d.spec.at;
    return d.spec.axis==='x'?[a0,c-0.13,a1,c+0.13,0,top]:[c-0.13,a0,c+0.13,a1,0,top];};
  const HOLES=[...WIN,...DOORS.map(doorHole)];
  /** A wall box split into pieces around any window opening that passes through it. */
  function wallWithHoles(w:number[],y0:number,y1:number,mat:THREE.MeshStandardMaterial,edges:boolean){
    const alongX=(w[2]-w[0])>=(w[3]-w[1]);const a0=alongX?w[0]:w[1],a1=alongX?w[2]:w[3];
    const holes=HOLES.filter(g=>g[0]<w[2]&&g[2]>w[0]&&g[1]<w[3]&&g[3]>w[1]&&g[4]<y1&&g[5]>y0)
      .map(g=>alongX?[g[0],g[2],g[4],g[5]]:[g[1],g[3],g[4],g[5]]).sort((p,q)=>p[0]-q[0]);
    const seg=(s0:number,s1:number,h0:number,h1:number)=>{if(s1-s0<1e-3||h1-h0<1e-3)return;
      if(alongX)underRoof(s0,w[1],s1,w[3],h0,h1,mat,edges);else underRoof(w[0],s0,w[2],s1,h0,h1,mat,edges);};
    let cur=a0;
    for(const [h0,h1,hy0,hy1] of holes){const s0=Math.max(a0,h0),s1=Math.min(a1,h1);
      seg(cur,s0,y0,y1);seg(s0,s1,y0,Math.max(y0,hy0));seg(s0,s1,Math.min(y1,hy1),y1);cur=s1;}
    seg(cur,a1,y0,y1);}
  const wallMat=M(map.color('wall'));
  // WALLS (keep WALL_RIGID_X / Z in layout.ts in sync): continuous walls; doors and windows are cut out as holes
  const WALLS=[[1.0,0,14,0.2],[1.0,0.2,1.2,4.95],[THO_X,4.95,11.45,5.05],[13.2,4.95,14,5.05],[THO_X,5.05,THO_X+0.2,9],[THO_X+0.2,8.8,13.8,9],[13.8,0,14,9],[9.95,0.2,10.05,3.95],[9.95,3.95,13.8,4.05],[2.55,5.05,2.71,8.8],[6.5,5.05,6.66,8.8],[5.9,5.05,6.5,5.25],[10.72,5.05,10.82,8.8],[10.82,6.05,13.8,6.15],[12.46,6.15,12.56,8.8]];
  // the WC1 / WC2 partition stops at the top of the WC slab (+2.5): the storage loft above runs across both WCs
  // The ancestor room has no door: the middle wall between it and the living room (THO_SCREEN) is a wooden slatted
  // partition (vách gỗ nan) up to the ceiling with an open 0.8 m passage; only the strip above the ceiling is masonry.
  const isSpine=(w:number[])=>w[0]===THO_X&&w[1]===4.95&&w[2]===11.45;
  WALLS.forEach(w=>{
    if(isSpine(w)){const T=THO_SCREEN;wallWithHoles([THO_X,4.95,T.x0,5.05],0,H,wallMat,true);wallWithHoles([T.x0,4.95,T.x1,5.05],T.top,H,wallMat,true);wallWithHoles([T.x1,4.95,11.45,5.05],0,H,wallMat,true);return;}
    wallWithHoles(w,0,w[0]===12.46&&w[2]===12.56?2.5:H,wallMat,true);});
  {const T=THO_SCREEN,wood=M(0x6b4430),z0=4.975,z1=5.025,[o0,o1]=T.open,oh=T.openH;
    box(T.x0,z0,T.x1,z1,T.top-0.08,T.top,wood,false);                                                     // top rail
    box(T.x0,z0,o0,z1,0,0.08,wood,false);box(o1,z0,T.x1,z1,0,0.08,wood,false);                          // bottom rails
    box(T.x0,4.96,T.x0+0.05,5.04,0,T.top,wood,false);box(T.x1-0.05,4.96,T.x1,5.04,0,T.top,wood,false);  // end posts
    box(o0-0.05,4.96,o0,5.04,0,T.top,wood,false);box(o1,4.96,o1+0.05,5.04,0,T.top,wood,false);          // jambs of the passage
    box(o0,z0,o1,z1,oh,oh+0.08,wood,false);                                                               // lintel rail over it
    for(let x=T.x0+0.1;x<T.x1-0.06;x+=0.1){const inOpen=x>o0-0.05&&x<o1+0.05;if(Math.abs(x-o0)<0.07||Math.abs(x-o1)<0.07)continue;
      box(x-0.02,4.985,x+0.02,5.015,inOpen?oh+0.08:0.08,T.top-0.08,wood,false);}}
  // (the WC wall tiles, 20 mm on the inside faces, are built below with the openings: 800 × 400 grey)
  // Mouldings (as in the client's reference photo), 4 cm proud of the outside wall faces and cut around doors /
  // windows like the walls. Phào trên: a 0.5 m band right under the eave soffit (main roof; the ancestor wing sits
  // under its lower roof). Phào dưới: plinth from the foundation to 0.45 m, also on the porch-facing walls.
  const band=M(map.color('topBand')),plinth=M(map.color('bottomBand'));
  [[1.0,-0.04,14.04,0],[14,0,14.04,9.04],[0.2,9,14.04,9.04]].forEach(w=>wallWithHoles(w,E1-0.65,E1-0.15,band,true));
  [[THO_X-0.04,4.95,THO_X,9.04],[THO_X-0.04,9,THO_X+0.2,9.04]].forEach(w=>wallWithHoles(w,E2-0.65,E2-0.15,band,true));
  // phào tường: a white two-step moulding along the bottom edge of the dark top band (owner's reference)
  {const pm=M(map.color('column'));
    // + the 150 frieze under it, round every outside wall at the ancestor-room front's height (owner's choice)
    for(const [d,y0,y1] of [[0.08,-0.69,-0.65],[0.055,-0.73,-0.69],[0.05,-0.88,-0.73]] as [number,number,number][]){
      [[1.0-d+0.04,-d,14+d,0],[14,0,14+d,9+d],[THO_X+0.2,9,14+d,9+d]].forEach(w=>wallWithHoles(w,E1+y0,E1+y1,pm,true));
      [[THO_X-d,4.95,THO_X,9+d],[THO_X-d,9,THO_X+0.2,9+d]].forEach(w=>wallWithHoles(w,E2+y0,E2+y1,pm,true));}}
  // the plinth (phào dưới) stops at the floor level ±0 on every wall, as at the ancestor-room front (owner's choice);
  // where the raised apron covers it, nothing shows
  [[0.96,-0.04,14.04,0],[14,0,14.04,9.04],[THO_X-0.04,9,14.04,9.04],[0.96,0.2,1.0,4.95],[THO_X-0.04,4.91,THO_X,9.04],[THO_X,4.91,1.0,4.95]].forEach(w=>wallWithHoles(w,GROUND,0,plinth,true));
  // ---- phào chỉ cửa: raised surrounds on every outside window and the two side doors (owner's reference house):
  // side strips 100 wide 50 proud, a stepped head cornice, and a sill under the windows ----
  {const tm=M(map.color('column')),gm=M(new THREE.Color(map.color('column')).lerp(new THREE.Color(0x8a8f96),0.25).getHex()),T=0.05;
    const surround=(alongX:boolean,a0:number,a1:number,face:number,s:number,y0:number,y1:number,sill:boolean)=>{
      const B=(u0:number,u1:number,d0:number,d1:number,yy0:number,yy1:number)=>alongX?box(u0,Math.min(face+s*d0,face+s*d1),u1,Math.max(face+s*d0,face+s*d1),yy0,yy1,tm,true):box(Math.min(face+s*d0,face+s*d1),u0,Math.max(face+s*d0,face+s*d1),u1,yy0,yy1,tm,true);
      B(a0-0.1,a0,0,T,sill?y0:0,y1);B(a1,a1+0.1,0,T,sill?y0:0,y1);                    // side strips
      const G=(u0:number,u1:number,yy0:number,yy1:number)=>alongX?box(u0,Math.min(face+s*T,face+s*(T+0.004)),u1,Math.max(face+s*T,face+s*(T+0.004)),yy0,yy1,gm,false):box(Math.min(face+s*T,face+s*(T+0.004)),u0,Math.max(face+s*T,face+s*(T+0.004)),u1,yy0,yy1,gm,false);
      for(const u of [a0-0.07,a0-0.035,a1+0.025,a1+0.06])G(u,u+0.012,(sill?y0:0)+0.1,y1-0.1);   // two grooves per strip
      B(a0-0.12,a1+0.12,0,T+0.02,y1,y1+0.1);B(a0-0.16,a1+0.16,0,T+0.05,y1+0.1,y1+0.16); // head + cornice
      if(sill)B(a0-0.14,a1+0.14,0,T+0.03,y0-0.07,y0);};
    for(const r of WIN){const ax=(r[2]-r[0])>(r[3]-r[1]);
      if(ax){const out=(r[1]+r[3])/2<4.5;surround(true,r[0],r[2],out?Math.min(r[1],0):Math.max(r[3],9),out?-1:1,r[4],r[5],true);}
      else{const out=(r[0]+r[2])/2<7;surround(false,r[1],r[3],out?r[0]+0.02:r[2]-0.02,out?-1:1,r[4],r[5],true);}}
    for(const d of DOORS){if(d.spec.kind!=='outer')continue;const [a0,a1]=d.span;
      if(d.spec.axis==='x')surround(true,a0,a1,d.spec.at<4.5?0:9,d.spec.at<4.5?-1:1,0,d.h,false);else surround(false,a0,a1,d.spec.at>7?14:THO_X,d.spec.at>7?1:-1,0,d.h,false);}}
  const darkWood=new THREE.MeshStandardMaterial({color:0x4a2c1e,roughness:0.5});
  box(1.2,0.2,5.95,0.28,0,0.1,darkWood,false);box(1.2,4.87,5.95,4.95,0,0.1,darkWood,false);
  const colMat=M(map.color('column'));
  // ---- porch columns after the owner's column detail (cột sảnh): base 700 (plinth, die with a sunk panel, moulded
  // cap), shaft 480 with three 50 mm flutes per face, capital 640 (bands + cove); 2.90 m in the drawing, scaled to the
  // porch beam (PC). Matching half-depth pilasters on the house wall behind them, and quarter-round arches (vòm) under
  // the porch beams at every support. ----
  {const cm=M(map.color('column')),dk=M(new THREE.Color(map.color('column')).lerp(new THREE.Color(0x8a8f96),0.22).getHex());
    const CX=PORCH_COL,CB=0,ZS=[0.11,PORCH_NZ],WF=1.0,ZW=4.95,sh0=0.85,sh1=PC-0.28;
    // layers [y0, y1, width]; a pilaster keeps only the part in front of the wall face (x ≤ WF)
    // off: base raised by the cheek-wall cap for the free columns (the shaft gets shorter, the capital stays at PC)
    const Lof=(off:number)=>L.map(([y0,y1,w]):[number,number,number]=>y1<=sh0?[y0+off,y1+off,w]:y0===sh0?[y0+off,y1,w]:[y0,y1,w]);
    const L:[number,number,number][]=[[0,0.07,0.70],[0.07,0.15,0.66],[0.15,0.68,0.58],[0.68,0.73,0.64],[0.73,0.80,0.62],[0.80,sh0,0.54],[sh0,sh1,0.48],
      [sh1,sh1+0.03,0.54],[sh1+0.03,PC-0.15,0.48],[PC-0.15,PC-0.12,0.54],[PC-0.12,PC-0.04,0.58],[PC-0.04,PC,0.64]];
    // zMax: the north wall pilaster stops at the ancestor room's wall face (its column sits in the wall line)
    const column=(cx:number,cz:number,wall:boolean,zMax=Infinity,off=0)=>{
      for(const [y0,y1,w] of Lof(off)){const x0=cx-w/2,x1=wall?Math.min(cx+w/2,WF):cx+w/2;box(x0,cz-w/2,x1,Math.min(cz+w/2,zMax),y0,y1,cm,true);}
      // sunk panel on the die and the flutes on the shaft, on each visible face
      const faces:[number,number,number,number][]=wall?[[-1,0,0,1],[0,-1,1,0],[0,1,1,0]]:[[-1,0,0,1],[1,0,0,1],[0,-1,1,0],[0,1,1,0]];
      for(const [nx,nz,ux,uz] of faces){
        const strip=(half:number,u:number,du:number,y0:number,y1:number)=>{const px=cx+nx*half,pz=cz+nz*half,a=u-du/2,b=u+du/2;
          if(wall&&ux!==0&&(cx+b>WF))return;if(pz>zMax||(uz!==0&&cz+b>zMax))return;
          box(ux?cx+a:px-0.004,uz?cz+a:pz-0.004,ux?cx+b:px+0.004,uz?cz+b:pz+0.004,y0,y1,dk,false);};
        strip(0.29,0,0.32,0.27+off,0.56+off);
        for(const u of [-0.135,0,0.135])strip(0.24,u,0.05,sh0+off+0.1,sh1-0.08);}};
    for(const z of ZS){column(CX,z,false,Infinity,CB);column(WF,z,true,z>ZW?ZW:Infinity);}
    // quarter-round arches under the beams, radius R, at both ends of each beam span
    const R=0.45,fillet=(px:number,pz:number,dx:number,dz:number,w:number)=>{const sh=new THREE.Shape();sh.moveTo(0,0);sh.lineTo(0,-R);sh.absarc(R,-R,R,Math.PI,Math.PI/2,true);sh.lineTo(0,0);
      const g=new THREE.ExtrudeGeometry(sh,{depth:w,bevelEnabled:false,curveSegments:16}),m=new THREE.Mesh(g,cm),a=-Math.atan2(dz,dx);m.rotation.y=a;
      m.position.set(mx(px)-7-Math.sin(a)*w/2,PC,mz(pz)-4.5-Math.cos(a)*w/2);scene.add(m);};
    const cap=0.32;
    fillet(CX,ZS[0]+cap,0,1,0.6);fillet(CX,ZS[1]-cap,0,-1,0.6);                                     // front beam, column to column
    fillet(CX+cap,ZS[0],1,0,0.6);fillet(WF-0.35,ZS[0],-1,0,0.6);fillet(CX+cap,ZS[1],1,0,0.6);
    {const a=ZS[1]-0.3;fillet(WF-0.35,(a+ZW)/2,-1,0,ZW-a);}                         // side beams, column to wall pilaster
    // phào hiên: moulded edges along the porch beams (a fillet at the soffit line and a band under the eave)
    for(const [y0,y1] of [[PC,PC+0.04],[E3-0.25,E3-0.21]] as [number,number][]){
      const bw=0.35;box(CX-bw,ZS[0]-bw,CX+bw,ZS[1]+bw,y0,y1,cm,true);box(CX-bw,ZS[0]-bw,1.0,ZS[0]+bw,y0,y1,cm,true);box(CX-bw,ZS[1]-bw,THO_X,ZS[1]+bw,y0,y1,cm,true);box(THO_X,ZS[1]-bw,1.0,ZW,y0,y1,cm,true);}
    // phào mặt tiền on the ancestor-room front (owner's reference): grooved corner pilasters with base and capital, and
    // a frieze between them under the wall cornice
    const F=THO_X,PT=E1-0.93;
    for(const [z0,z1] of [[4.95,5.45],[8.5,9.04]] as [number,number][]){
      // base level with the porch columns' (from the porch floor ±0 to +0.80: plinth, die with a sunk panel, cap)
      box(F-0.06,z0,F,z1,0.8,PT,cm,true);box(F-0.09,z0-0.03,F,z1+0.03,PT,PT+0.1,cm,true);
      box(F-0.15,z0-0.09,F,z1+0.09,0,0.07,cm,true);box(F-0.13,z0-0.07,F,z1+0.07,0.07,0.15,cm,true);box(F-0.09,z0-0.03,F,z1+0.03,0.15,0.68,cm,true);
      box(F-0.12,z0-0.06,F,z1+0.06,0.68,0.73,cm,true);box(F-0.11,z0-0.05,F,z1+0.05,0.73,0.80,cm,true);
      box(F-0.094,(z0+z1)/2-0.13,F-0.09,(z0+z1)/2+0.13,0.27,0.56,dk,false);                       // sunk panel on the die
      for(const dz of [-0.12,0,0.12]){const zc=(z0+z1)/2+dz;box(F-0.064,zc-0.015,F-0.06,zc+0.015,0.8,PT-0.12,dk,false);}}
  }
  // porch beams: from the column tops up to the soffit, right under the fascia line
  // porch beams (xà) as wide as the column capitals (640), centred on the column lines
  {const bx=PORCH_COL,bw=0.32;box(bx-bw,0.11-bw,bx+bw,PORCH_NZ+bw,PC,E3-0.12,colMat);box(bx-bw,0.11-bw,1.0,0.11+bw,PC,E3-0.12,colMat);
    // north beam on the middle-wall line: full width out to the ancestor room's front, then only the part in the porch (to the wall face 4.95)
    box(bx-bw,PORCH_NZ-bw,THO_X,PORCH_NZ+bw,PC,E3-0.12,colMat);box(THO_X,PORCH_NZ-bw,1.0,4.95,PC,E3-0.12,colMat);}
  // Aluminium windows (like the client's reference photo): dark-grey frame, blue-grey reflective glass, each sash
  // with its own aluminium border, and a fixed transom light across the top of the taller windows.
  const glass=new THREE.MeshStandardMaterial({color:0x6f8fa3,transparent:true,opacity:0.5,roughness:0.05,metalness:0.5});
  const winFrame=new THREE.MeshStandardMaterial({color:map.color('winFrame'),roughness:0.45,metalness:0.35});
  const windows:Win[]=[],winLeaves:THREE.Mesh[]=[];
  const angW:Record<Dir,number>={'+x':0,'-x':Math.PI,'+z':-Math.PI/2,'-z':Math.PI/2};
  /** Aluminium border (bars `sb` wide) around a sash rectangle in its group's local x/y; part of the clickable leaf. */
  const sashFrame=(gr:THREE.Object3D,x0:number,x1:number,y0:number,y1:number,win:Win)=>{const sb=0.04,D=0.045;
    for(const [w,h,x,y] of [[sb,y1-y0,x0+sb/2,(y0+y1)/2],[sb,y1-y0,x1-sb/2,(y0+y1)/2],[x1-x0,sb,(x0+x1)/2,y1-sb/2],[x1-x0,sb,(x0+x1)/2,y0+sb/2]]){
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,D),winFrame);m.position.set(x,y,0);gr.add(m);m.userData.win=win;winLeaves.push(m);}};
  // Window styles (indices into WIN): the kitchen window is one top-hung (awning) sash; the living-room window has
  // four casements (2.44 m); the ancestor-room window has three sashes — two side casements and a top-hung middle
  // one. Others: two casements.
  WIN.forEach((g,wi)=>{
    const alongX=(g[2]-g[0])>(g[3]-g[1]),cx=(g[0]+g[2])/2,cz=(g[1]+g[3])/2,fw=0.05;
    const out:Dir=alongX?(cz<4.5?'-z':'+z'):(cx<7?'-x':'+x');
    // wall faces (the opening box is 2 cm proud on each side of the wall)
    const w0=(alongX?g[1]:g[0])+0.02,w1=(alongX?g[3]:g[2])-0.02,face=out[0]==='-'?w0+0.03:w1-0.03;
    const fr=(a0:number,a1:number,y0:number,y1:number)=>alongX?box(a0,w0,a1,w1,y0,y1,winFrame,false):box(w0,a0,w1,a1,y0,y1,winFrame,false);
    const A0=alongX?g[0]:g[1],A1=alongX?g[2]:g[3];
    fr(A0,A0+fw,g[4],g[5]);fr(A1-fw,A1,g[4],g[5]);fr(A0,A1,g[5]-fw,g[5]);fr(A0,A1,g[4],g[4]+fw);
    box(g[0]-0.05,g[1]-0.03,g[2]+0.05,g[3]+0.03,g[4]-0.05,g[4],colMat,false);
    // fixed transom (ô sáng): 0.45 m on the 1.8 m windows (sash 1.35 m), 0.28 m on windows 1.1–1.6 m tall
    const tH=g[5]-g[4]>=1.6?0.45-2*fw:g[5]-g[4]>=1.1?0.28:0,yb=g[4]+fw,yt=tH?g[5]-fw-tH-fw:g[5]-fw,h=yt-yb;
    if(tH){fr(A0,A1,yt,yt+fw);
      if(alongX)box(A0+fw,face-0.01,A1-fw,face+0.01,yt+fw,g[5]-fw,glass,false);else box(face-0.01,A0+fw,face+0.01,A1-fw,yt+fw,g[5]-fw,glass,false);}
    const win:Win={leaves:[],open:false,x:mx(cx)-7,z:mz(cz)-4.5};
    /** Side-hung sash `len` wide, hinged at `a` (along the wall), closed pointing `cd`, swinging out. */
    const casement=(a:number,cd:Dir,len:number)=>{
      const gr=new THREE.Group();if(alongX)gr.position.set(mx(a)-7,0,mz(face)-4.5);else gr.position.set(mx(face)-7,0,mz(a)-4.5);
      const m=new THREE.Mesh(new THREE.BoxGeometry(len-0.01,h,0.02),glass);m.position.set(len/2,yb+h/2,0);gr.add(m);
      sashFrame(gr,0.005,len-0.005,yb,yt,win);
      const c=angW[cd];let d=angW[out]-c;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
      gr.rotation.y=c;win.leaves.push({g:gr,c,o:c+d*0.85,t:c});m.userData.win=win;winLeaves.push(m);scene.add(gr);};
    /** Top-hung sash covering [a0,a1] along the wall: the bottom swings out and up. An outer group turns the
     *  local x axis along the wall; the inner pivot (the Leaf) rotates about that local x. */
    const awning=(a0:number,a1:number)=>{
      const am=(a0+a1)/2,hw=(a1-a0-0.01)/2,outer=new THREE.Group(),pv=new THREE.Group();outer.add(pv);
      if(alongX)outer.position.set(mx(am)-7,yt,mz(face)-4.5);else{outer.position.set(mx(face)-7,yt,mz(am)-4.5);outer.rotation.y=-Math.PI/2;}
      const outNeg=alongX?out==='-z':out==='+x'; // outside is local -z
      const m=new THREE.Mesh(new THREE.BoxGeometry(hw*2,h,0.02),glass);m.position.set(0,-h/2,0);pv.add(m);
      sashFrame(pv,-hw,hw,-h,0,win);
      const hd=new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.16,hw*0.6),0.025,0.03),winFrame);hd.position.set(0,-h+0.06,outNeg?0.035:-0.035);pv.add(hd);
      win.leaves.push({g:pv,c:0,o:outNeg?1.05:-1.05,t:0,axis:'x'});m.userData.win=win;hd.userData.win=win;winLeaves.push(m,hd);scene.add(outer);};
    const P:Dir=alongX?'+x':'+z',N:Dir=alongX?'-x':'-z';
    const style=WINS[wi].spec.style;
    if(style==='awning')awning(A0+fw,A1-fw);
    else if(style==='triple'){
      const sw=(A1-A0-4*fw)*0.28; // side sashes; the middle one gets the rest
      fr(A0+fw+sw,A0+2*fw+sw,yb,yt);fr(A1-2*fw-sw,A1-fw-sw,yb,yt); // mullions
      casement(A0+fw,P,sw);casement(A1-fw,N,sw);awning(A0+2*fw+sw,A1-2*fw-sw);
    }else if(style==='quad'){
      // four side-hung sashes, two pairs either side of a centre mullion (each pair meets at a quarter point)
      const len=(A1-A0-3*fw)/4,am=(A0+A1)/2;fr(am-fw/2,am+fw/2,yb,yt);
      casement(A0+fw,P,len);casement(am-fw/2,N,len);casement(am+fw/2,P,len);casement(A1-fw,N,len);
    }else{const len=(A1-A0-2*fw)/2;casement(A0+fw,P,len);casement(A1-fw,N,len);}
    windows.push(win);});
  const mainWood=M(0x7a3a22),inWood=M(0x5a3322),wcDoor=M(0xdcdcdc);
  // the kitchen and side doors open onto the raised apron (floor level): no steps
  const vz0=1.05,vz1=3.55,vh=2.8,bay=(vz1-vz0-0.2)/8;
  let tvScreen!:THREE.Mesh; // living-room TV screen (faces -x); Game shows YouTube through it
  obj('vachTivi','Vách tivi + kệ tivi','Phòng khách',true,()=>{
  box(5.9,vz0,6.1,vz0+0.1,0,vh,darkWood);box(5.9,vz1-0.1,6.1,vz1,0,vh,darkWood);box(5.9,vz0,6.1,vz1,vh-0.12,vh,darkWood);
  box(5.92,vz0,6.1,vz1,0,0.65,darkWood);
  const deco=M(0xf2efe9),decoDark=M(0x2a2a2a),decoGlass=new THREE.MeshStandardMaterial({color:0xdfe8ee,transparent:true,opacity:0.6,roughness:0.1});
  for(let i=1;i<8;i++){const z=vz0+0.1+i*bay;box(5.92,z-0.04,6.08,z+0.04,0.65,vh-0.12,darkWood);}
  for(let j=0;j<8;j++){const a=vz0+0.1+j*bay,b=a+bay;const hs=j%2?[1.1,1.65,2.2]:[1.35,1.9,2.45];
  hs.forEach((h,k)=>{box(5.93,a,6.07,b,h,h+0.025,darkWood,false);
  const zc=(a+b)/2-4.5;if((j+k)%2===0){const o=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.045,0.2,12),k===1?decoGlass:deco);o.position.set(6.0-7,h+0.125,zc);add(o);}
  else if((j+k)%3===0){const o=new THREE.Mesh(new THREE.SphereGeometry(0.06,12,10),decoDark);o.position.set(6.0-7,h+0.085,zc);add(o);}});}
  box(5.45,0.95,5.92,3.65,0.25,0.62,darkWood);box(5.55,1.05,5.9,3.55,0,0.25,M(0x2a1a12),false);
  box(5.44,0.95,5.46,3.65,0.42,0.44,M(0x2a1a12),false);
  box(5.85,1.55,5.9,3.05,0.85,1.7,M(0x111111));tvScreen=box(5.845,1.58,5.85,3.02,0.88,1.67,M(0x1f3550),false);});
  const wood=M(0x6b4430),white=M(0xfafafa),blanket=M(0x9fb3c8),counter=M(0xd9bb8c),steel=new THREE.MeshStandardMaterial({color:0xc9ced3,roughness:0.3,metalness:0.6}),chrome=new THREE.MeshStandardMaterial({color:0xe6e9ec,roughness:0.15,metalness:0.9}),chairF=M(0x8e99a6),ceramic=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.25});
  const seat=(x:number,z:number,face:number,top:number,kind:Seat['kind'])=>seats.push({x:x-7,z:z-4.5,face,top,kind});
  // Living-room set in the walnut (gỗ óc chó) style of the client's photo: a walnut frame on a recessed plinth,
  // wide flat wooden arms, a wooden back panel, dark-brown leather seat and back cushions; walnut coffee table with
  // a smoked-glass top. Same footprints, heights (seat 0.42) and seats as before.
  const walnut=new THREE.MeshStandardMaterial({color:0x6e4428,roughness:0.5}),walnutDk=M(0x3d2416),
    leather=new THREE.MeshStandardMaterial({color:0x4b4039,roughness:0.55}),smoke=new THREE.MeshStandardMaterial({color:0x2a2622,roughness:0.08,metalness:0.3,transparent:true,opacity:0.8});
  /** A walnut sofa / armchair filling [x0..x1] x [z0..z1], backrest on the z0 or z1 side, n seat cushions. */
  const walnutSeat=(x0:number,z0:number,x1:number,z1:number,back:'z0'|'z1',n:number)=>{
    const A=0.13,P=0.08,G=0.012,bz=(a:number,b:number):[number,number]=>back==='z0'?[z0+a,z0+b]:[z1-b,z1-a];
    box(x0+0.07,z0+0.07,x1-0.07,z1-0.07,0,P,walnutDk,false);                        // recessed plinth
    box(x0,z0,x1,z1,P,0.2,walnut);                                                   // frame
    for(const [a,b] of [[x0,x0+A],[x1-A,x1]]){box(a,z0,b,z1,0.2,0.6,walnut);            // wooden arms
      box(a-0.015,z0-0.015,b+0.015,z1+0.015,0.6,0.64,walnut);}
    const [p0,p1]=bz(0,0.09);box(x0+A,p0,x1-A,p1,0.2,0.8,walnut);                     // wooden back panel
    const w=(x1-x0-2*A)/n,[c0,c1]=bz(0.09,0.28),[s0,s1]=bz(0.09,z1-z0);
    for(let k=0;k<n;k++){const a=x0+A+k*w+G,b=x0+A+(k+1)*w-G;
      box(a,s0+G,b,s1-G,0.2,0.42,leather);                                           // seat cushion
      box(a,c0,b,c1,0.42,0.82,leather);}};                                            // back cushion
  obj('sofa','Sofa','Phòng khách',true,()=>{walnutSeat(2.47,0.2,4.47,1.0,'z0',3);
    seat(2.85,0.82,0,0.42,'sofa');seat(3.55,0.82,0,0.42,'sofa');seat(4.15,0.52,0,0.42,'sofa');});
  obj('banTra','Bàn trà','Phòng khách',true,()=>{box(3.16,1.66,4.2,2.2,0,0.06,walnutDk,false);
    box(3.08,1.58,4.28,2.28,0.06,0.38,walnut);box(3.2,1.575,4.16,1.585,0.12,0.3,walnutDk,false);box(3.2,2.275,4.16,2.285,0.12,0.3,walnutDk,false);
    box(3.1,1.6,4.26,2.26,0.38,0.42,smoke);});
  obj('gheDon1','Ghế đơn trái','Phòng khách',true,()=>{walnutSeat(2.58,3.29,3.33,4.04,'z1',1);seat(2.955,3.72,Math.PI,0.42,'sofa');});
  obj('gheDon2','Ghế đơn phải','Phòng khách',true,()=>{walnutSeat(4.04,3.29,4.79,4.04,'z1',1);seat(4.415,3.72,Math.PI,0.42,'sofa');});
  obj('banGoc','Bàn góc','Phòng khách',true,()=>{box(3.47,3.46,3.89,3.88,0,0.06,walnutDk,false);box(3.43,3.42,3.93,3.92,0.06,0.51,walnut);box(3.43,3.42,3.93,3.92,0.51,0.55,walnutDk);});
  obj('banAn','Bàn ăn + 6 ghế','Bếp + ăn',true,()=>{box(6.05,2.1,7.65,3.0,0.72,0.77,wood);box(6.15,2.2,7.55,2.9,0,0.72,wood);
  [6.16,6.64,7.13].forEach(x=>{seat(x+0.21,1.78,0,0.45,'chair');seat(x+0.21,3.32,Math.PI,0.45,'chair');box(x,1.6,x+0.42,2.02,0,0.45,chairF);box(x,1.6,x+0.42,1.66,0.45,0.9,chairF);box(x,3.08,x+0.42,3.5,0,0.45,chairF);box(x,3.44,x+0.42,3.5,0.45,0.9,chairF);});});
  obj('ketBep','Kệ bếp (bếp, chậu rửa, hút mùi)','Bếp + ăn',true,()=>{box(7.89,0.2,9.95,0.8,0,0.85,counter);box(9.35,0.8,9.95,2.76,0,0.85,counter);
  box(7.89,0.2,9.95,0.8,0.85,0.88,M(0x2f2f33));box(9.35,0.8,9.95,2.76,0.85,0.88,M(0x2f2f33));
  box(8.0,0.26,8.8,0.72,0.88,0.9,M(0x0d0d0d));
  const ring=new THREE.MeshBasicMaterial({color:0x8a2a1a});
  [[8.2,0.49],[8.6,0.49]].forEach(p=>{const c=new THREE.Mesh(new THREE.RingGeometry(0.08,0.1,24),ring);c.rotation.x=-Math.PI/2;c.position.set(p[0]-7,0.905,p[1]-4.5);add(c);});
  box(9.42,1.15,9.88,1.6,0.86,0.885,steel,false);box(9.42,1.65,9.88,2.1,0.86,0.885,steel,false);
  box(9.47,1.2,9.83,1.55,0.7,0.86,M(0x8d9298),false);box(9.47,1.7,9.83,2.05,0.7,0.86,M(0x8d9298),false);
  cyl(9.86,1.04,1.625,0.015,0.02,0.32,steel);box(9.72,1.6,9.88,1.65,1.17,1.2,steel,false);
  box(7.95,0.2,8.85,0.72,1.7,1.8,steel);box(8.05,0.2,8.75,0.6,1.8,1.95,steel);box(8.25,0.2,8.55,0.45,1.95,3.3,steel);
  box(8.1,0.6,8.7,0.63,1.72,1.74,new THREE.MeshBasicMaterial({color:0xfff6dd}),false);});
  const cabMat=M(0xf3f0ea);
  let rackG!:THREE.Group,armL!:THREE.Mesh,armR!:THREE.Mesh;const rackParts:THREE.Object3D[]=[];
  obj('tuBep','Tủ bếp trên + giá bát','Bếp + ăn',false,()=>{
  box(9.6,1.05,9.95,1.08,1.5,2.25,cabMat);box(9.6,2.17,9.95,2.2,1.5,2.25,cabMat);
  box(9.6,1.05,9.95,2.2,2.22,2.25,cabMat);box(9.6,1.05,9.95,2.2,1.5,1.52,cabMat);box(9.93,1.08,9.95,2.17,1.52,2.22,cabMat);
  box(9.55,2.2,9.95,2.76,1.5,2.25,cabMat);box(9.545,2.25,9.55,2.71,1.55,2.2,M(0xe6e2da),false);
  rackG=new THREE.Group();add(rackG);
  const rackMat=new THREE.MeshStandardMaterial({color:0xdfe3e7,roughness:0.25,metalness:0.7});
  const wireMat=new THREE.LineBasicMaterial({color:0x9aa1a8});
  function rb(x0:number,z0:number,x1:number,z1:number,y0:number,y1:number,mat:THREE.MeshStandardMaterial){const m=box(x0,z0,x1,z1,y0,y1,mat,false,null,rackG);rackParts.push(m);return m;}
  const fl=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.3,0.58,1.0)),wireMat);fl.position.set(9.775-7,1.86,1.625-4.5);rackG.add(fl);
  rb(9.63,1.13,9.92,2.12,1.57,1.59,rackMat);rb(9.63,1.13,9.92,2.12,1.88,1.9,rackMat);
  rb(9.62,1.12,9.64,2.13,1.57,2.15,rackMat);rb(9.62,1.12,9.92,1.14,1.57,2.15,rackMat);rb(9.62,2.11,9.92,2.13,1.57,2.15,rackMat);
  rb(9.6,1.1,9.63,2.15,2.1,2.14,cabMat);
  for(let i=0;i<9;i++){const p=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.012,24),M(0xffffff));p.rotation.x=Math.PI/2;p.position.set(9.78-7,1.73,1.25+i*0.085-4.5);rackG.add(p);rackParts.push(p);}
  for(let i=0;i<5;i++){const b=new THREE.Mesh(new THREE.SphereGeometry(0.07,16,10,0,Math.PI*2,0,Math.PI/2),M(0xe9edf2));b.position.set(9.78-7,1.92,1.3+i*0.17-4.5);rackG.add(b);rackParts.push(b);}
  armL=box(9.7,1.09,9.75,1.11,1.6,2.0,rackMat,false);armR=box(9.7,2.14,9.75,2.16,1.6,2.0,rackMat,false);});
  obj('tuLanh','Tủ lạnh','Bếp + ăn',true,()=>box(9.25,2.76,9.95,3.46,0,1.8,steel));
  // Lavabo zone (1.0 m deep since the WCs were lengthened): one single basin on the PN2-side wall, mirror above
  obj('lavabo','Bàn lavabo đơn + gương','Lavabo',true,()=>{box(10.82,5.15,11.32,5.95,0.18,0.82,M(0x6b4430));box(10.82,5.15,10.83,5.95,0,0.18,M(0x3a2a20),false);
  box(10.82,5.13,11.37,5.97,0.82,0.86,M(0xf1efea));
  [5.55].forEach(z=>{cyl(11.11,0.92,z,0.17,0.13,0.12,ceramic);cyl(11.11,0.975,z,0.15,0.15,0.005,M(0xdfe6ea));
  cyl(10.89,1.02,z,0.014,0.018,0.32,chrome);box(10.89,z-0.012,11.03,z+0.012,1.16,1.18,chrome,false);});
  const mirror=new THREE.MeshStandardMaterial({color:0xcfdbe3,roughness:0.05,metalness:0.85});
  box(10.82,5.2,10.845,5.9,1.15,1.85,mirror);box(10.82,5.25,10.87,5.85,1.87,1.9,new THREE.MeshBasicMaterial({color:0xfff3d6}),false);});
  // WC1: an 80 cm wall-hung basin on the west wall by the entrance (z 6.19..6.99), the toilet centred beyond it
  obj('lavaboWc1','Lavabo 80 cm + gương','WC1',true,()=>{const bw=cyl(11.07,0.8,6.59,0.19,0.14,0.14,ceramic);bw.scale.set(1,1,1.35);box(10.84,6.19,11.3,6.99,0.86,0.88,ceramic,false);
  const rim=cyl(11.07,0.885,6.59,0.16,0.16,0.005,M(0xdfe6ea));rim.scale.set(1,1,1.35);cyl(10.88,0.97,6.59,0.014,0.018,0.2,chrome);box(10.88,6.578,11.0,6.602,1.06,1.08,chrome,false);
  box(10.84,6.24,10.855,6.94,1.15,1.75,new THREE.MeshStandardMaterial({color:0xcfdbe3,roughness:0.05,metalness:0.85}));});
  function shower(xw:number,z:number){cyl(xw+0.05,1.5,z,0.016,0.016,1.2,chrome);
  box(xw+0.05,z-0.012,xw+0.33,z+0.012,2.09,2.11,chrome,false);cyl(xw+0.33,2.07,z,0.13,0.13,0.02,chrome);
  box(xw,z-0.09,xw+0.07,z+0.09,0.95,1.1,chrome,false);
  cyl(xw+0.08,1.25,z+0.09,0.025,0.018,0.22,chrome);
  box(xw+0.4,z-0.06,xw+0.52,z+0.06,0.021,0.025,M(0x9aa1a8),false);}
  /** Plain shower (sen thường) on the wall x = xw: wall mixer, slide bar with a hand shower, hose. */
  function handShower(xw:number,z:number){box(xw,z-0.09,xw+0.07,z+0.09,0.95,1.1,chrome,false);
  cyl(xw+0.03,1.5,z,0.012,0.012,0.75,chrome);box(xw,z-0.02,xw+0.04,z+0.02,1.12,1.16,chrome,false);box(xw,z-0.02,xw+0.04,z+0.02,1.86,1.9,chrome,false);
  const hd=cyl(xw+0.09,1.72,z,0.045,0.03,0.05,chrome);hd.rotation.z=Math.PI/2.4;cyl(xw+0.06,1.55,z,0.012,0.014,0.22,chrome);
  cyl(xw+0.06,1.0,z+0.05,0.009,0.009,0.7,M(0xb9bec4));
  box(xw+0.4,z-0.06,xw+0.52,z+0.06,0.021,0.025,M(0x9aa1a8),false);}
  function bed(x0:number,z0:number,x1:number,z1:number,head:Bed['head']){beds.push({x0:x0-7,z0:z0-4.5,x1:x1-7,z1:z1-4.5,head,top:0.55});box(x0,z0,x1,z1,0,0.45,white);box(x0+0.02,z0+0.02,x1-0.02,z1-0.02,0.45,0.55,blanket);
  if(head==='N')box(x0,z0,x1,z0+0.1,0,1.0,wood);if(head==='S')box(x0,z1-0.1,x1,z1,0,1.0,wood);if(head==='E')box(x0,z0,x0+0.1,z1,0,1.0,wood);if(head==='W')box(x1-0.1,z0,x1,z1,0,1.0,wood);}
  /** 1 m study desk against a wall: top, side panel, 3-drawer pedestal, lamp and books, plus a chair (a seat
   *  facing the desk). Spans [x0, x1] along the wall. The wall runs along x at z = zw (s = +1: wall on the +z side),
   *  or with axis 'x' along z at x = zw (x0/x1 are then z values, s = +1: wall on the +x side). */
  const deskTop=M(0xd9c3a0),deskBody=M(0xf2efe9),chairSeat=M(0x34495e);
  function desk(x0:number,x1:number,zw:number,s:number,axis:'z'|'x'='z'){
    // u = along the wall, v = across it
    const B=(u0:number,v0:number,u1:number,v1:number,y0:number,y1:number,m:THREE.MeshStandardMaterial,e=true)=>axis==='z'?box(u0,v0,u1,v1,y0,y1,m,e):box(v0,u0,v1,u1,y0,y1,m,e);
    const Cy=(u:number,y:number,v:number,r1:number,r2:number,h:number,m:THREE.Material,tilt?:number)=>axis==='z'?cyl(u,y,v,r1,r2,h,m,tilt):cyl(v,y,u,r1,r2,h,m,undefined,tilt===undefined?undefined:-tilt);
    const D=0.55,zf=zw-s*D;
    B(x0,zw,x1,zf,0.72,0.75,deskTop);B(x0,zw,x0+0.03,zf,0,0.72,deskBody);B(x0,zw,x1,zw-s*0.02,0.3,0.72,deskBody,false);
    B(x1-0.4,zw,x1,zf+s*0.015,0,0.72,deskBody);
    for(let i=0;i<3;i++){const y=0.04+i*0.225;B(x1-0.39,zf+s*0.015,x1-0.01,zf,y,y+0.215,deskBody);B(x1-0.24,zf,x1-0.16,zf-s*0.02,y+0.15,y+0.165,chrome,false);}
    // lamp (base, stem, shade, bulb) and a few books
    const lx=x0+0.13,lz=zw-s*0.13;
    Cy(lx,0.76,lz,0.06,0.07,0.02,steel);Cy(lx,0.95,lz,0.008,0.008,0.38,steel);
    Cy(lx,1.12,lz-s*0.08,0.025,0.075,0.1,M(0x2f6f6a),0.45*s);Cy(lx,1.1,lz-s*0.09,0.02,0.02,0.02,new THREE.MeshBasicMaterial({color:0xfff2cc}));
    [0x8e3b3b,0x3b5f8e,0xd9a441,0x4f8a5b].forEach((c,i)=>{const bx=x1-0.32+i*0.035;B(bx,zw-s*0.04,bx+0.03,zw-s*0.24,0.75,0.97-(i%2)*0.04,M(c),false);});
    // chair pulled out in front of the knee space, backrest away from the desk
    const cx=(x0+0.03+x1-0.4)/2,zc=zf-s*0.32;
    B(cx-0.21,zc-0.21,cx+0.21,zc+0.21,0.4,0.46,chairSeat);
    B(cx-0.2,zc-s*0.21,cx+0.2,zc-s*0.17,0.46,0.92,chairSeat);
    for(const [dx,dz] of [[-0.18,-0.18],[0.18,-0.18],[-0.18,0.18],[0.18,0.18]])Cy(cx+dx,0.2,zc+dz,0.012,0.012,0.4,chrome);
    if(axis==='z')seat(cx,zc-s*0.09,s>0?0:Math.PI,0.46,'desk');else seat(zc-s*0.09,cx,s>0?Math.PI/2:-Math.PI/2,0.46,'desk');}
  obj('banHoc1','Bàn học + ghế','Phòng ngủ 1',true,()=>desk(5.5,6.5,8.8,1));                 // north-east corner, beside the window
  obj('banHoc2','Bàn học + ghế','Phòng ngủ 2',true,()=>desk(9.72,10.72,8.8,1));               // as PN1: under the AC, back corner by the lavabo / WC wall, beside the window
  obj('banHoc3','Bàn học + ghế','Phòng ngủ 3',true,()=>desk(10.06,11.06,0.2,-1));
  obj('giuong3','Giường + tab đầu giường','Phòng ngủ 3',true,()=>{bed(12.0,0.2,13.8,2.2,'N');box(11.55,0.2,12.0,0.65,0,0.5,wood);}); // against the west wall, no corner table (owner's choice)
  obj('giuong1','Giường + 2 tab đầu giường','Phòng ngủ 1',true,()=>{bed(2.71,5.05,4.51,7.05,'N');box(4.51,5.05,4.96,5.5,0,0.5,wood);}); // head to the south wall, along the thờ wall
  obj('giuong2','Giường + 2 tab đầu giường','Phòng ngủ 2',true,()=>{bed(6.66,5.05,8.46,7.05,'N');box(8.46,5.05,8.91,5.5,0,0.5,wood);}); // as PN1: head to the middle wall, along the PN1 wall
  // Án gian thờ (client's photo): 1.97 long × 0.97 deep × 1.27 high to the top of the scrolled ends, back to the PN1
  // wall and facing the front window. Thick legs on hoof feet, a top board with raised scrolled ends over a Greek-key
  // frieze, an apron with three carved panels, fretwork (chữ công) with a lotus panel in the middle and fret
  // brackets down the legs; a small two-door cabinet underneath. Local coords: u along the length from za, v depth
  // from the front face xf.
  const AL=1.97,AD=0.97,axf=2.55-AD,aza=6.925-AL/2,ayT=1.147;
  const aWood=new THREE.MeshStandardMaterial({color:0x7a3a20,roughness:0.55}),aDark=new THREE.MeshStandardMaterial({color:0x5c2a15,roughness:0.6}),
    aLight=new THREE.MeshStandardMaterial({color:0x8e4a2a,roughness:0.5}),aBrass=new THREE.MeshStandardMaterial({color:0xd2a83c,roughness:0.28,metalness:0.85});
  const AB=(u0:number,u1:number,v0:number,v1:number,y0:number,y1:number,mat:THREE.MeshStandardMaterial,edges=false)=>box(axf+v0,aza+u0,axf+v1,aza+u1,y0,y1,mat,edges);
  const AC=(u:number,v:number,y:number,r1:number,r2:number,h:number,mat:THREE.Material,rx?:number,rz?:number)=>cyl(axf+v,y,aza+u,r1,r2,h,mat,rx,rz);
  /** Square fret loop on the front face (v0..v1) in the u/y plane. */
  const fret=(u0:number,u1:number,y0:number,y1:number,v0=0.03,v1=0.06,t=0.025)=>{AB(u0,u1,v0,v1,y1-t,y1,aWood);AB(u0,u1,v0,v1,y0,y0+t,aWood);AB(u0,u0+t,v0,v1,y0,y1,aWood);AB(u1-t,u1,v0,v1,y0,y1,aWood);};
  obj('banTho','Án gian thờ (197 × 97 × 127)','Phòng thờ',true,()=>{
    const L=AL,D=AD;
    // legs on hoof feet (chân quỳ), the toes kicked out
    for(const [u0,u1,toe] of [[0.03,0.13,-1],[L-0.13,L-0.03,1]] as [number,number,number][])for(const [v0,v1] of [[0.04,0.14],[D-0.14,D-0.04]]){
      AB(u0,u1,v0,v1,0.14,0.967,aWood,true);
      AB(u0-0.012,u1+0.012,v0-0.012,v1+0.012,0.03,0.14,aWood,true);
      AB(toe<0?u0-0.03:u1-0.08,toe<0?u0+0.08:u1+0.03,v0-0.02,v1+0.01,0,0.05,aDark);}
    // body: apron box, cornice, Greek-key frieze, top board, scrolled ends
    AB(0.03,L-0.03,0.05,D-0.05,0.77,0.967,aWood,true);
    AB(0.01,L-0.01,0.01,D-0.01,0.967,1.014,aWood,true);
    AB(0.035,L-0.035,0.035,D-0.035,1.014,1.118,aDark,true);
    AB(0.06,L-0.06,0.03,0.036,1.04,1.044,aLight);AB(0.06,L-0.06,0.03,0.036,1.088,1.092,aLight);
    for(let u=0.08;u<L-0.08;u+=0.06){AB(u,u+0.03,0.03,0.036,1.044,1.088,aLight);AB(u+0.012,u+0.034,0.03,0.036,1.06,1.066,aLight);}
    AB(0,L,0,D,1.118,ayT,aWood,true);
    for(const [u0,u1,s] of [[0,0.07,1],[L-0.07,L,-1]] as [number,number,number][]){
      AB(u0,u1,0,D,ayT,1.255,aWood,true);
      AC(s>0?0.035:L-0.035,D/2,1.25,0.035,0.035,D,aWood,0,Math.PI/2);       // rolled top of the scroll
      const ui=s>0?u1:u0-0.13;AB(ui,ui+0.13,0.02,D-0.02,ayT,1.19,aWood);              // step inside it
      AB(ui+0.03,ui+0.1,-0.004,0.02,ayT+0.008,1.18,aLight);}
    // apron: three carved panels (flowers), raised from the front face
    for(const [u0,u1] of [[0.17,0.58],[0.62,1.35],[1.39,1.8]]){AB(u0,u1,0.035,0.05,0.795,0.945,aDark);AB(u0+0.03,u1-0.03,0.028,0.035,0.82,0.92,aLight);
      for(let u=u0+0.07;u<u1-0.05;u+=0.09)AC(u,0.027,0.87,0.018,0.018,0.012,aWood,0,Math.PI/2);}
    // fretwork band: lotus panel in the middle, chữ công frets either side, fret brackets down the legs
    AB(0.62,1.35,0.04,0.06,0.575,0.77,aDark);AB(0.66,1.31,0.034,0.04,0.6,0.745,aLight);
    AC(L/2,0.03,0.672,0.055,0.055,0.012,aWood,0,Math.PI/2);
    for(let k=0;k<6;k++){const a=k*Math.PI/5;AC(L/2+Math.cos(a)*0.11,0.031,0.66+Math.sin(a)*0.05,0.022,0.022,0.01,aWood,0,Math.PI/2);}
    for(const s of [1,-1]){const U=(u:number)=>s>0?u:L-u;const R=(a:number,b:number)=>[Math.min(U(a),U(b)),Math.max(U(a),U(b))] as [number,number];
      fret(...R(0.14,0.36),0.58,0.765);fret(...R(0.38,0.6),0.58,0.765);
      {const [a,b]=R(0.2,0.3);fret(a,b,0.63,0.715,0.04,0.06,0.018);}{const [a,b]=R(0.44,0.54);fret(a,b,0.63,0.715,0.04,0.06,0.018);}
      fret(...R(0.13,0.3),0.4,0.58);fret(...R(0.13,0.26),0.22,0.4);
      {const [a,b]=R(0.17,0.25);fret(a,b,0.44,0.54,0.04,0.06,0.016);}
      // the same on the back and a plain stretcher on each end
      {const [a,b]=R(0.13,0.6);AB(a,b,D-0.06,D-0.03,0.58,0.765,aWood);}
      {const [a,b]=R(0.04,0.12);AB(a,b,0.14,D-0.14,0.77,0.967,aWood);AB(a,b,0.14,D-0.14,0.5,0.54,aWood);}}
    // cabinet underneath, two doors with lotus medallions and brass handles
    const cw=0.8,c0=L/2-cw/2,c1=c0+cw;
    AB(c0+0.02,c1-0.02,0.06,0.5,0,0.03,aDark);
    AB(c0,c1,0.04,0.52,0.03,0.4,aWood,true);
    for(const [d0,d1] of [[c0+0.03,L/2-0.005],[L/2+0.005,c1-0.03]]){AB(d0,d1,0.03,0.04,0.06,0.375,aWood,true);AB(d0+0.03,d1-0.03,0.026,0.03,0.09,0.345,aDark);
      AC((d0+d1)/2,0.024,0.22,0.09,0.09,0.008,aLight,0,Math.PI/2);AC((d0+d1)/2,0.02,0.22,0.05,0.05,0.008,aWood,0,Math.PI/2);}
    AB(L/2-0.03,L/2-0.018,0.012,0.026,0.2,0.27,aBrass);AB(L/2+0.018,L/2+0.03,0.012,0.026,0.2,0.27,aBrass);
    AB(c0+0.02,c1-0.02,0.05,0.5,0.4,0.475,aDark,true);
    for(let u=c0+0.05;u<c1-0.05;u+=0.05)AB(u,u+0.025,0.044,0.05,0.42,0.455,aLight);
    AB(c0-0.04,c1+0.04,0.02,0.54,0.475,0.535,aWood,true);
  });
  // Altar set (đồ thờ) on the table: bronze incense burner on a wooden stand in the middle, a pair of cranes,
  // lotus candle stands at the ends, blue-and-white vases, footed plates and a tray of cups.
  obj('doTho','Đồ thờ (đỉnh, hạc, chân nến, lục bình)','Phòng thờ',false,()=>{
    const L=AL,y=ayT,blueM=new THREE.MeshStandardMaterial({color:0x2a4f9a,roughness:0.3}),white=new THREE.MeshStandardMaterial({color:0xf4f4f0,roughness:0.2});
    const ball=(u:number,v:number,yc:number,r:number,mat:THREE.Material,sx=1,sy=1,sz=1)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(r,18,12),mat);m.position.set(axf+v-7,yc,aza+u-4.5);m.scale.set(sx,sy,sz);add(m);return m;};
    // incense burner (đỉnh): stand, three legs, round body with lugs, domed lid with a lion knob
    AB(L/2-0.16,L/2+0.16,0.42,0.72,y,y+0.08,aDark,true);
    const yb=y+0.08,vc=0.57;
    for(let k=0;k<3;k++){const a=k*2*Math.PI/3;AC(L/2+Math.cos(a)*0.07,vc+Math.sin(a)*0.07,yb+0.05,0.016,0.012,0.1,aBrass);}
    ball(L/2,vc,yb+0.17,0.11,aBrass,1,0.8,1);AC(L/2,vc,yb+0.25,0.085,0.1,0.03,aBrass);
    for(const s of [1,-1]){const h=new THREE.Mesh(new THREE.TorusGeometry(0.035,0.01,8,16),aBrass);h.position.set(axf+vc-7,yb+0.26,aza+L/2+s*0.13-4.5);h.rotation.y=Math.PI/2;add(h);}
    ball(L/2,vc,yb+0.3,0.08,aBrass,1,0.7,1);AC(L/2,vc,yb+0.37,0.02,0.03,0.04,aBrass);ball(L/2,vc,yb+0.41,0.035,aBrass);
    // cranes standing on turtles
    for(const s of [1,-1]){const u=L/2+s*0.36,v=0.6;
      ball(u,v,y+0.025,0.07,aBrass,1,0.45,1.25);AC(u,v-0.01,y+0.11,0.007,0.007,0.15,aBrass);AC(u,v+0.02,y+0.11,0.007,0.007,0.15,aBrass);
      ball(u,v,y+0.22,0.06,aBrass,1.2,0.75,0.8);AC(u-s*0.01,v-0.02,y+0.36,0.009,0.012,0.22,aBrass);ball(u-s*0.01,v-0.035,y+0.47,0.018,aBrass,1,0.8,1.4);
      AC(u-s*0.01,v-0.05,y+0.52,0.005,0.005,0.08,aBrass);AC(u-s*0.01,v-0.05,y+0.57,0.035,0.004,0.04,aBrass);}
    // lotus candle stands at both ends
    for(const u of [0.17,L-0.17]){const v=0.5;AC(u,v,y+0.02,0.07,0.08,0.04,aBrass);AC(u,v,y+0.2,0.022,0.028,0.32,aBrass);
      ball(u,v,y+0.12,0.04,aBrass);ball(u,v,y+0.26,0.035,aBrass);AC(u,v,y+0.36,0.15,0.13,0.012,aBrass);
      AC(u,v,y+0.45,0.02,0.024,0.17,aBrass);AC(u,v,y+0.56,0.05,0.025,0.05,aBrass);ball(u,v,y+0.6,0.025,aBrass,1,1.3,1);}
    // blue-and-white vases (lục bình): lathe profile, white glaze with blue bands
    const prof=[[0,0],[0.06,0],[0.065,0.02],[0.1,0.12],[0.095,0.2],[0.05,0.27],[0.042,0.3],[0.06,0.33],[0.058,0.335]].map(([r,h])=>new THREE.Vector2(r,h));
    for(const u of [0.42,L-0.42]){const v=0.62,m=new THREE.Mesh(new THREE.LatheGeometry(prof,24),white);m.position.set(axf+v-7,y,aza+u-4.5);add(m);
      for(const [r,h,t] of [[0.088,0.06,0.03],[0.1,0.13,0.05],[0.08,0.22,0.025],[0.046,0.29,0.015]])AC(u,v,y+h,r+0.002,r+0.002,t,blueM);}
    // footed plates (mâm bồng) in front of the vases, cups on a brass tray in the middle
    for(const u of [0.62,L-0.62]){const v=0.3;AC(u,v,y+0.025,0.04,0.05,0.05,white);AC(u,v,y+0.06,0.13,0.08,0.025,white);AC(u,v,y+0.073,0.13,0.13,0.004,blueM);}
    AB(L/2-0.11,L/2+0.11,0.2,0.32,y,y+0.02,aBrass);
    for(const du of [-0.06,0,0.06])AC(L/2+du,0.26,y+0.045,0.02,0.014,0.04,aBrass);
  });
  obj('mayGiat','Máy giặt','Lavabo',true,()=>{box(13.2,5.16,13.8,5.76,0,0.85,white);cyl(13.5,0.6,5.46,0.17,0.17,0.02,M(0x9aa1a8),Math.PI/2*0,Math.PI/2);});
  const glassP=new THREE.MeshStandardMaterial({color:0xbfe3f7,transparent:true,opacity:0.35});
  // WC1 (1.6 m wide): toilet by the door against the west wall, facing the door side; shower inside at the
  // back behind a glass screen. WC2 (1.2 m wide): shower by the door, toilet on the back wall facing the door.
  obj('sen1','Sen cây + vách kính','WC1',true,()=>{shower(10.84,8.25);box(10.84,7.75,10.99,8.0,1.0,1.02,chrome,false);box(10.84,7.62,11.84,7.68,0,2.0,glassP);});
  obj('bonCau1','Bồn cầu','WC1',true,()=>{box(10.84,7.11,11.02,7.53,0,0.8,ceramic);const b=cyl(11.26,0.2,7.32,0.19,0.16,0.4,ceramic);b.scale.set(1.3,1,1);});
  obj('sen2','Sen tắm thường (không vách kính)','WC2',true,()=>{handShower(12.58,6.95);box(12.58,7.15,12.73,7.4,1.0,1.02,chrome,false);});
  obj('bonCau2','Bồn cầu','WC2',true,()=>{box(12.97,8.6,13.39,8.78,0,0.8,ceramic);const b=cyl(13.18,0.2,8.36,0.19,0.16,0.4,ceramic);b.scale.set(1,1,1.3);});
  const doors:Door[]=[],clickables:THREE.Object3D[]=[];
  rackParts.forEach(p=>{p.userData.rack=true;clickables.push(p);});
  const ang:Record<Dir,number>={'+x':0,'-x':Math.PI,'+z':-Math.PI/2,'-z':Math.PI/2};
  const knobMat=M(0xd4af37);
  /** `deco` replaces the plain slab + knob: the leaf mesh becomes a thin glass pane and deco adds the rest
   *  (each added mesh must be passed to `tag` so it is clickable). */
  type Deco=(g:THREE.Group,len:number,tag:(m:THREE.Mesh)=>void)=>void;
  function door(hx:number,hz:number,len:number,cd:Dir,od:Dir,mat:THREE.Material,deco?:Deco,h=2.1,full=false):Door{
  if(full){const F=0.075;if(od[1]==='x')hx+=od[0]==='+'?F:-F;else hz+=od[0]==='+'?F:-F;} // hung on the wall face, so 180° lies flat on it
  const g=new THREE.Group();g.position.set(mx(hx)-7,0,mz(hz)-4.5);g.scale.y=h/2.1;
  const geo=new THREE.BoxGeometry(len-0.02,2.1,deco?0.02:0.045);const m=new THREE.Mesh(geo,mat);m.position.set(len/2,1.05,0);g.add(m);
  const parts:THREE.Mesh[]=[m];
  if(deco)deco(g,len,x=>parts.push(x));
  else{const ed=new THREE.LineSegments(new THREE.EdgesGeometry(geo),edgeMat);ed.position.copy(m.position);g.add(ed);
    const kn=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.18,0.1),knobMat);kn.position.set(len-0.1,1.0,0);g.add(kn);parts.push(kn);}
  const c=ang[cd];let d=ang[od]-c;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;if(full)d*=2;
  g.rotation.y=c;const o:Door={g,c,o:c+d,t:c,open:false,len};parts.forEach(x=>{x.userData.door=o;clickables.push(x);});doors.push(o);scene.add(g);return o;}

  // ---- main entrance (door D1 below): shared helpers ----
  const gold=new THREE.MeshStandardMaterial({color:0xd4af37,roughness:0.3,metalness:0.85});
  const lm=(gr:THREE.Object3D,geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.z=rz;gr.add(m);return m;};
  // ---- door D1 (owner's drawing): walnut (gỗ óc chó) leaves with raised panels and a fan round the handle, glazed
  // side panels and transom (kính an toàn 8.38). mm on the drawing -> leaf-local units (leaf height 2.1 is scaled to h).
  const wal=new THREE.MeshStandardMaterial({color:0x6e4428,roughness:0.45}),walP=new THREE.MeshStandardMaterial({color:0x7d4f30,roughness:0.42}),
    walD=new THREE.MeshStandardMaterial({color:0x3d2416,roughness:0.5}),dGlass=new THREE.MeshStandardMaterial({color:0x9db2bf,transparent:true,opacity:0.45,roughness:0.05,metalness:0.3});
  /** Raised panel on both faces of a leaf / frame group (local x0..x1, y0..y1, faces at ±fz). */
  const panel=(g:THREE.Object3D,x0:number,y0:number,x1:number,y1:number,fz:number,o:THREE.Mesh[])=>{const w=x1-x0,h=y1-y0;
    for(const sz of [1,-1]){o.push(lm(g,new THREE.BoxGeometry(w,h,0.008),walD,(x0+x1)/2,(y0+y1)/2,sz*(fz+0.004)));
      o.push(lm(g,new THREE.BoxGeometry(w-0.04,h-0.04,0.012),walP,(x0+x1)/2,(y0+y1)/2,sz*(fz+0.01)));}};
  const mainLeaf:Deco=(g,len,tag)=>{const o:THREE.Mesh[]=[];const kx=len/1050,ky=2.1/2400,X=(v:number)=>v*kx,Y=(v:number)=>v*ky,fz=0.025;
    o.push(lm(g,new THREE.BoxGeometry(len-0.01,2.1,0.05),wal,len/2,1.05));
    // rows (mm from the bottom): 75 | 275 | 65 | 740 | 65 | 745 | 65 | 305 | 65 ; columns from the hinge: 100 | 530 | 100 | 220 | 100
    for(const [y0,y1] of [[75,350],[2030,2335]] as [number,number][]){panel(g,X(100),Y(y0),X(630),Y(y1),fz,o);panel(g,X(730),Y(y0),X(950),Y(y1),fz,o);}
    for(const [y0,y1] of [[415,1155],[1220,1965]] as [number,number][])panel(g,X(100),Y(y0),X(950),Y(y1),fz,o);
    // the fan: a half disc on the meeting edge between the big panels, ring + spokes, both faces
    const cy=Y(1190),R=X(330);
    for(const sz of [1,-1]){const z=sz*(fz+0.02);
      const disc=new THREE.Mesh(new THREE.CircleGeometry(R,32,Math.PI/2,Math.PI),walP);disc.position.set(len,cy,z);disc.scale.y=ky/kx;if(sz<0)disc.rotation.x=Math.PI;g.add(disc);o.push(disc);
      const ring=new THREE.Mesh(new THREE.RingGeometry(R*0.95,R*1.12,32,1,Math.PI/2,Math.PI),walD);ring.position.set(len,cy,z+sz*0.002);ring.scale.y=ky/kx;if(sz<0)ring.rotation.x=Math.PI;g.add(ring);o.push(ring);
      for(let k=1;k<16;k++){const a=Math.PI/2+Math.PI*k/16;o.push(lm(g,new THREE.BoxGeometry(R*0.75,0.008,0.006),walD,len+Math.cos(a)*R*0.52,cy+Math.sin(a)*R*0.52*ky/kx,z+sz*0.003,a));}
      // gold lever handle in the middle of the fan
      o.push(lm(g,new THREE.BoxGeometry(0.03,0.16,0.012),gold,len-0.06,cy,z+sz*0.008),lm(g,new THREE.BoxGeometry(0.13,0.022,0.02),gold,len-0.11,cy+0.03,z+sz*0.02));}
    o.forEach(tag);};
  // doors from DOOR_SPECS (with the layout's width / height overrides); the main entrance is built below
  const doorById:Record<string,Door>={};
  for(const d of DOORS){const sp=d.spec,[h0,h1]=sp.axis==='x'?[sp.hinge,sp.at]:[sp.at,sp.hinge];
    if(sp.kind==='main'){const c=sp.hinge,lw=d.w/2;
      doorById[sp.id]=door(sp.at,c-d.w/2,lw,'+z','-x',wal,mainLeaf,d.h);door(sp.at,c+d.w/2,lw,'-z','-x',wal,mainLeaf,d.h);continue;}
    const mat=sp.kind==='outer'?mainWood:sp.kind==='wc'?wcDoor:inWood;
    doorById[sp.id]=door(h0,h1,d.w,sp.cd,sp.od,mat,undefined,d.h,!!sp.full);}
  const md=DOORS.find(d=>d.spec.kind==='main');
  if(md){// D1 frame: walnut jambs, head and transom rail; glazed 450 side panels and the 500 transom; local x runs along +z
    const W=md.span[1]-md.span[0],L0=MAIN_SIDE,L1=W-MAIN_SIDE,T0=md.h,T1=md.h+MAIN_TRANSOM,ky=md.h/2400,F=0.065,D=0.09;
    const fx=new THREE.Group();fx.position.set(mx(md.spec.at)-7,0,mz(md.span[0])-4.5);fx.rotation.y=-Math.PI/2;scene.add(fx);
    const bar=(x0:number,x1:number,y0:number,y1:number,d=D)=>lm(fx,new THREE.BoxGeometry(x1-x0,y1-y0,d),wal,(x0+x1)/2,(y0+y1)/2);
    bar(0,F,0,T1);bar(W-F,W,0,T1);bar(0,W,T1-F,T1);bar(0,W,T0,T0+F);bar(L0-F,L0,0,T1);bar(L1,L1+F,0,T1);
    // a glass light set in a walnut board: the board as four strips round the glass, a dark bead on both faces
    const lightIn=(x0:number,y0:number,x1:number,y1:number,ix:number,iy:number)=>{const gx0=x0+ix,gx1=x1-ix,gy0=y0+iy,gy1=y1-iy;
      bar(x0,x1,y0,gy0,0.05);bar(x0,x1,gy1,y1,0.05);bar(x0,gx0,gy0,gy1,0.05);bar(gx1,x1,gy0,gy1,0.05);
      lm(fx,new THREE.BoxGeometry(gx1-gx0,gy1-gy0,0.012),dGlass,(gx0+gx1)/2,(gy0+gy1)/2);
      for(const sz of [1,-1])for(const [a,b,c,d] of [[gx0-0.02,gy0-0.02,gx1+0.02,gy0],[gx0-0.02,gy1,gx1+0.02,gy1+0.02],[gx0-0.02,gy0,gx0,gy1],[gx1,gy0,gx1+0.02,gy1]])
        lm(fx,new THREE.BoxGeometry(c-a,d-b,0.01),walD,(a+c)/2,(b+d)/2,sz*0.03);};
    // side panels: rails as on the leaves, four glass lights between them (rows in mm from the floor)
    for(const [a,b] of [[F,L0-F],[L1+F,W-F]]){
      for(const [y0,y1] of [[0,75],[350,415],[1155,1220],[1965,2030],[2335,2400]] as [number,number][])bar(a,b,y0*ky,y1*ky,0.05);
      for(const [y0,y1] of [[75,350],[415,1155],[1220,1965],[2030,2335]] as [number,number][])lightIn(a,y0*ky,b,y1*ky,0.045,0.03);
      solids.push({x0:mx(md.spec.at-0.06)-7,x1:mx(md.spec.at+0.06)-7,z0:mz(md.span[0]+a)-4.5,z1:mz(md.span[0]+b)-4.5,y0:0,y1:T0});}
    // transom: a 1900 light over the leaves and a small one over each side panel
    lightIn(L0,T0+F,L1,T1-F,0.1,0.08);for(const [a,b] of [[F,L0-F],[L1+F,W-F]])lightIn(a,T0+F,b,T1-F,0.05,0.08);}
  const wcDoors=[doorById['d-wc1'],doorById['d-wc2']].filter(Boolean);
  clickables.push(...winLeaves);
  tvScreen.userData.tv=true;clickables.push(tvScreen);
  const inner=M(0xd7b48c),cloth=[0x3d7cc9,0xc94f4f,0xe8e2d6,0x4f8a5b,0x2f3a4a,0xd9a441].map(M);
  /** Wardrobe: open-front carcass with clothes on a rail and shelves, four doors opening toward `out`. Built in
   *  local coords u (along the front, from x0 / z0) and v (depth, from the back), mapped to plan coords by P(). */
  function wardrobe(x0:number,z0:number,x1:number,z1:number,out:Dir){
    const t=0.025,WH=2.2,s=out[0]==='+'?1:-1,alongX=out[1]==='z';
    const W=alongX?x1-x0:z1-z0,D=alongX?z1-z0:x1-x0,bk=alongX?(s>0?z0:z1):(s>0?x0:x1);
    const P=(u:number,v:number):[number,number]=>alongX?[x0+u,bk+s*v]:[bk+s*v,z0+u];
    const B=(u0:number,v0:number,u1:number,v1:number,y0:number,y1:number,mat:THREE.Material,edges=true)=>{
      const [xa,za]=P(u0,v0),[xb,zb]=P(u1,v1);return box(Math.min(xa,xb),Math.min(za,zb),Math.max(xa,xb),Math.max(za,zb),y0,y1,mat as THREE.MeshStandardMaterial,edges);};
    const um=W/2;
    B(0,0,t,D,0,WH,wood);B(W-t,0,W,D,0,WH,wood);B(um-t/2,0,um+t/2,D,0,WH,wood);
    B(0,0,W,t,0,WH,inner);
    B(0,0,W,D,WH-t,WH,wood);B(0,0,W,D,0,0.08,wood);
    solids.push({x0:x0-7,x1:x1-7,z0:z0-4.5,z1:z1-4.5,y0:0,y1:WH});
    // first half: shelf + hanging rail with clothes; second half: shelves with folded stacks
    B(t,0.01,um,D-0.01,1.84,1.86,inner,false);
    {const [x,z]=P(um/2,D/2);alongX?cyl(x,1.74,z,0.012,0.012,um-t,steel,0,Math.PI/2):cyl(x,1.74,z,0.012,0.012,um-t,steel,Math.PI/2);}
    for(let i=0;i<7;i++){const u=0.12+i*0.12;B(u-0.02,D/2-0.22,u+0.02,D/2+0.22,0.95+(i%3)*0.08,1.72,cloth[i%cloth.length],false);}
    [0.55,1.05,1.45].forEach((y,k)=>{B(um+t/2,0.01,W-t,D-0.01,y,y+0.02,inner,false);
      [0,1,2].forEach(j=>{const a=um+0.08+j*0.3;B(a,D/2-0.15,a+0.22,D/2+0.15,y+0.02,y+0.12+((j+k)%2)*0.06,cloth[(j+k*2)%cloth.length],false);});});
    const [cx,cz]=P(um,D),w:Win={leaves:[],open:false,x:cx-7,z:cz-4.5,half:um,along:alongX?'x':'z',name:'tủ quần áo'},lw=W/4;
    const ox=alongX?0:s,oz=alongX?s:0; // outward unit vector
    for(let i=0;i<4;i++){const cd:Dir=alongX?(i%2?'-x':'+x'):(i%2?'-z':'+z'),[hx,hz]=P((i%2?i+1:i)*lw,D+0.012);
      const c=angW[cd],gr=new THREE.Group();gr.position.set(hx-7,0,hz-4.5);
      const geo=new THREE.BoxGeometry(lw-0.006,2.14,0.02);const m=new THREE.Mesh(geo,wood);m.position.set(lw/2,1.1,0);gr.add(m);
      const ed=new THREE.LineSegments(new THREE.EdgesGeometry(geo),edgeMat);ed.position.copy(m.position);gr.add(ed);
      // the knob goes on the outer face: local +z points along (sin c, cos c) in plan
      const kn=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.22,0.025),knobMat);kn.position.set(lw-0.05,1.1,Math.sign(ox*Math.sin(c)+oz*Math.cos(c))*0.022);gr.add(kn);
      let d=angW[out]-c;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
      gr.rotation.y=c;w.leaves.push({g:gr,c,o:c+d*0.95,t:c});m.userData.win=w;kn.userData.win=w;clickables.push(m,kn);add(gr);}
    wardrobes.push(w);}
  obj('tuAo3','Tủ quần áo','Phòng ngủ 3',false,()=>wardrobe(11.8,3.15,13.8,3.95,'-z'));
  obj('tuAo1','Tủ quần áo','Phòng ngủ 1',false,()=>wardrobe(5.9,5.25,6.5,7.15,'-x'));   // in front of the 200 brick that hides the (6.0, 5) column, along the PN2 wall (owner's choice)
  obj('tuAo2','Tủ quần áo','Phòng ngủ 2',false,()=>wardrobe(10.12,5.05,10.72,6.95,'-x'));  // as PN1: front corner along the lavabo / WC wall, the door right beside it
  /** Wine cabinet in the living-room corner, in line with the TV unit: same depth, as tall as the partition (vh),
   *  front facing the living room (-x) like the TV wall. Built in local coords u (along the front, from the facade
   *  wall) / v (depth, from the back), mapped to plan coords by P(). Single glass door hinged on the wall side. */
  function wineCabinet(xb:number,za:number,zb:number,D:number){
    const WH=vh,t=0.025,W=zb-za;
    const P=(u:number,v:number):[number,number]=>[xb-v,za+u];
    const B=(u0:number,v0:number,u1:number,v1:number,y0:number,y1:number,mat:THREE.MeshStandardMaterial|THREE.MeshBasicMaterial,edges=true)=>{
      const [xa,z0]=P(u0,v0),[xc,z1]=P(u1,v1);return box(Math.min(xa,xc),Math.min(z0,z1),Math.max(xa,xc),Math.max(z0,z1),y0,y1,mat,edges);};
    // lying = axis along the depth with the narrow (top) end toward the front
    const C=(u:number,v:number,y:number,r1:number,r2:number,h:number,mat:THREE.Material,lying=false)=>{const [x,z]=P(u,v);return lying?cyl(x,y,z,r1,r2,h,mat,0,Math.PI/2):cyl(x,y,z,r1,r2,h,mat);};
    const glow=new THREE.MeshStandardMaterial({color:0x3a2418,emissive:0x5a3010,emissiveIntensity:0.5,roughness:0.6});
    const bottles=[M(0x1f3d2b),M(0x4a0f17),M(0x2a1a10)],cork=M(0xc9a37a),stone=M(0x2b2b2e);
    const glassW=new THREE.MeshStandardMaterial({color:0xe4f1f6,transparent:true,opacity:0.35,roughness:0.05});
    B(0,0,t,D,0,WH,darkWood);B(W-t,0,W,D,0,WH,darkWood);B(0,0,W,t,0,WH,glow);
    B(0,0,W,D,WH-0.05,WH,darkWood);B(0,0,W,D,0,0.1,darkWood);
    solids.push({x0:xb-D-7,x1:xb-7,z0:za-4.5,z1:zb-4.5,y0:0,y1:WH});
    B(0.04,0.03,W-0.04,0.07,WH-0.08,WH-0.06,new THREE.MeshBasicMaterial({color:0xffd9a0}),false); // LED strip
    // lower rack: 4 x 4 bottles lying with the necks toward the door, slats between the columns
    const cw=(W-2*t)/4;
    for(let i=1;i<4;i++)B(t+i*cw-0.006,t,t+i*cw+0.006,D-0.03,0.1,0.82,darkWood,false);
    for(let r=0;r<4;r++)for(let i=0;i<4;i++){const u=t+(i+0.5)*cw,y=0.17+r*0.17,b=bottles[(r+i)%3];
      C(u,0.17,y,0.034,0.034,0.26,b,true);C(u,0.335,y,0.012,0.02,0.07,b,true);C(u,0.375,y,0.011,0.011,0.015,cork,true);}
    // stone counter shelf with glasses, glass shelves with standing bottles above
    B(t,t,W-t,D-0.02,0.82,0.85,stone);
    [0,1,2].forEach(i=>{const u=0.1+i*0.1,v=D/2+0.06;C(u,v,0.855,0.025,0.025,0.006,glassW);C(u,v,0.905,0.004,0.004,0.1,glassW);C(u,v,0.99,0.038,0.022,0.08,glassW);});
    [W-0.2,W-0.1].forEach((u,i)=>{C(u,D/2-0.02,0.97,0.036,0.036,0.24,bottles[i]);C(u,D/2-0.02,1.14,0.013,0.02,0.1,bottles[i]);});
    [1.24,1.6,1.96,2.32].forEach((y,k)=>{B(t,t,W-t,D-0.02,y,y+0.012,glassW,false);
      for(let i=0;i<4;i++){const u=0.1+i*(W-0.2)/3,b=bottles[(i+k)%3];C(u,D/2,y+0.132,0.036,0.036,0.24,b);C(u,D/2,y+0.3,0.013,0.02,0.1,b);}});
    // single glass door with a dark frame and a long bar handle, hinged at the wall end, swinging into the room
    const [fx]=P(0,D);
    const w:Win={leaves:[],open:false,x:fx-7,z:(za+zb)/2-4.5,half:0,name:'tủ rượu'},lw=W;
    const gr=new THREE.Group();gr.position.set(fx-0.012-7,0,za-4.5);
    const parts:THREE.Mesh[]=[];
    const part=(geo:THREE.BoxGeometry,mat:THREE.Material,x:number,y:number,z=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);gr.add(m);parts.push(m);return m;};
    const dy0=0.1,dy1=WH-0.06,dh=dy1-dy0,dm=(dy0+dy1)/2;
    part(new THREE.BoxGeometry(lw-0.09,dh-0.1,0.008),glassW,lw/2,dm);
    part(new THREE.BoxGeometry(0.045,dh,0.025),darkWood,0.0225,dm);part(new THREE.BoxGeometry(0.045,dh,0.025),darkWood,lw-0.0225,dm);
    part(new THREE.BoxGeometry(lw,0.05,0.025),darkWood,lw/2,dy0+0.025);part(new THREE.BoxGeometry(lw,0.05,0.025),darkWood,lw/2,dy1-0.025);
    part(new THREE.BoxGeometry(0.018,0.5,0.018),chrome,lw-0.07,1.15,0.03);
    parts.forEach(m=>{m.userData.win=w;clickables.push(m);});
    const c=angW['+z'];let d=angW['-x']-c;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
    gr.rotation.y=c;w.leaves.push({g:gr,c,o:c+d*0.95,t:c});add(gr);
    wardrobes.push(w);}
  // from the facade wall to the TV unit, same depth as the TV unit (x 5.45..5.95)
  // with the filler above the end of the TV unit up to the first partition post, and the top rail to the wall
  obj('tuRuou','Tủ rượu','Phòng khách',false,()=>{wineCabinet(5.95,0.28,0.95,0.5);box(5.45,0.95,5.95,vz0,0.62,vh,darkWood);box(5.95,0.2,6.1,vz0,vh-0.12,vh,darkWood);});
  const labels:THREE.Sprite[]=[];
  function label(t:string,x:number,z:number){const c=document.createElement('canvas');c.width=320;c.height=72;const g=c.getContext('2d')!;g.fillStyle='rgba(255,255,255,0.88)';g.beginPath();if(g.roundRect)g.roundRect(4,8,312,56,14);else g.rect(4,8,312,56);g.fill();g.fillStyle='#2c2c2a';g.font='500 30px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(t,160,37);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false}));s.scale.set(2.2,0.5,1);s.position.set(mx(x)-7,E1+0.5,mz(z)-4.5);s.renderOrder=10;s.visible=false;scene.add(s);labels.push(s);return s;}
  ([['Sảnh',-0.2,2.5],['Phòng khách',3.6,2.8],['Bếp + ăn',8.0,3.9],['P. ngủ 3',11.9,2.7],['Hành lang',12.0,4.5],['P. thờ',1.4,7.0],['P. ngủ 1',4.5,6.3],['P. ngủ 2',8.55,6.3],['Lavabo',12.4,5.6],['WC1',11.64,7.3],['WC2',13.18,7.3],] as [string,number,number][]).forEach(l=>label(l[0],l[1],l[2]));
  const siteLabels=[label('Lối đi',7.6,-0.75),label('Mương',7.6,-2.55)];
  const roofG=new THREE.Group();scene.add(roofG);
  // the WC slab at +2.4 (the WC ceiling, the storage loft's floor, "mái kho") with the boxes on it: its own group,
  // hidden on its own to look down into the WCs
  const loftG=new THREE.Group();scene.add(loftG);
  const roofCol=new THREE.Color(map.color('roof'));
  // Wavy roof tiles (ngói sóng): a grey-scale tile pattern tinted by the roof colour, also used as the bump map. One
  // texture repeat = TW x TH metres (4 waves across, 3 courses up the slope); hip() gives every face UVs in metres.
  const TW=1.2,TH=1.0;
  const tileTex=(()=>{const N=256,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d')!,img=g.createImageData(N,N);
    const waves=4,rows=3,rh=N/rows;
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const cy=(y%rh)/rh;                                   // 0 = top of a course (under the next one), 1 = its lower edge
      const off=Math.floor(y/rh)%2?0.5:0;                   // courses staggered by half a wave
      const w=Math.cos(((x/N)*waves+off)*Math.PI*2);        // the wave across the tile
      let v=0.78+0.2*w*(0.6+0.4*cy);                        // humps lighter, troughs darker
      v*=0.82+0.18*cy;                                      // shaded where the course above overlaps it
      if(cy>0.9)v*=0.55+(1-cy)*2.5;                         // lower lip casts a thin shadow
      const i=(y*N+x)*4,b=Math.max(0,Math.min(255,v*255));img.data[i]=img.data[i+1]=img.data[i+2]=b;img.data[i+3]=255;}
    g.putImageData(img,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;})();
  const roofMat=new THREE.MeshStandardMaterial({color:roofCol.clone().multiplyScalar(1.25),map:tileTex,bumpMap:tileTex,bumpScale:2.5,roughness:0.5,side:THREE.DoubleSide});
  const roofLine=new THREE.LineBasicMaterial({color:roofCol.clone().multiplyScalar(0.55)});
  const cutPlanes=[new THREE.Plane(new THREE.Vector3(-1,0,0),mx(1.0)-7),new THREE.Plane(new THREE.Vector3(0,0,1),-(mz(0.2)-4.5))];
  const roofMatS=roofMat.clone();roofMatS.clippingPlanes=cutPlanes;roofMatS.clipIntersection=true;
  const roofLineS=roofLine.clone();roofLineS.clippingPlanes=cutPlanes;roofLineS.clipIntersection=true;
  const capMat=M(roofCol.clone().multiplyScalar(0.72).getHex()); // ridge caps a shade darker than the tiles
  function cap(a:number[],b:number[],cm:THREE.Material=capMat){const A=new THREE.Vector3(a[0],a[1]+0.05,a[2]),B=new THREE.Vector3(b[0],b[1]+0.05,b[2]);const len=A.distanceTo(B);
  const c=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,len,8),cm);c.position.copy(A).add(B).multiplyScalar(0.5);
  c.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),B.clone().sub(A).normalize());roofG.add(c);}
  /** capTo: stop the ridge cap at this plan x (where the ridge disappears under the main roof). */
  /** dSkip: plan distance along the (x0, z1) hip from its eave corner where its cap starts (an L wing covers the rest) */
  function hip(x0:number,x1:number,z0:number,z1:number,hl:boolean,hr:boolean,E:number,t:number,mat?:THREE.Material,lmat?:THREE.LineBasicMaterial,capTo=Infinity,cm:THREE.Material=capMat,dSkip=0){const zm=(z0+z1)/2,half=(z1-z0)/2,r=E+half*t,L=hl?x0+half:x0,R=hr?x1-half:x1;
  const P=(x:number,y:number,z:number)=>[x-7,y,z-4.5];
  const tri:number[]=[];const q=(a:number[],b:number[],c:number[])=>tri.push(...a,...b,...c);
  const A=P(x0,E,z0),B=P(x1,E,z0),C=P(x1,E,z1),D=P(x0,E,z1),RL=P(L,r,zm),RR=P(R,r,zm);
  q(A,B,RR);q(A,RR,RL);q(D,RL,RR);q(D,RR,C);q(A,RL,D);q(B,C,RR);
  // UVs in metres per face: u along its eave, v up the slope (plan distance from the eave x slope length factor)
  const sl=Math.sqrt(1+t*t),uv:number[]=[],X0=x0-7,X1=x1-7,Z0=z0-4.5,Z1=z1-4.5;
  for(let f=0;f<6;f++){for(let k=0;k<3;k++){const o=(f*3+k)*3,px=tri[o],pz=tri[o+2];
    const [u,v]=f<2?[px,pz-Z0]:f<4?[-px,Z1-pz]:f===4?[-pz,px-X0]:[pz,X1-px];uv.push(u/TW,v*sl/TH);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(tri,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
  roofG.add(new THREE.Mesh(g,mat||roofMat));roofG.add(new THREE.LineSegments(new THREE.EdgesGeometry(g,20),lmat||roofLine));
  cap(RL,capTo<R?P(Math.max(L,capTo),r,zm):RR,cm);if(hl){cap(A,RL,cm);const f=Math.min(1,dSkip/half);cap(D.map((v,i)=>v+(RL[i]-v)*f),RL,cm);}if(hr){cap(B,RR,cm);cap(C,RR,cm);}
  return {L,R,r,zm};}
  // main roof minus the flat-roof corner (clipped where x > FX and z > FZ)
  const flatPlanes=[new THREE.Plane(new THREE.Vector3(-1,0,0),FX-7),new THREE.Plane(new THREE.Vector3(0,0,-1),FZ-4.5)];
  const clipF=<T extends THREE.Material>(m:T)=>{const c=m.clone() as T;c.clippingPlanes=flatPlanes;c.clipIntersection=true;return c;};
  // the thờ wing shares the main roof's north eave, so their north faces are one plane up to where the wing's ridge
  // meets the main roof: no main hip cap along that stretch
  const thoHalf=(RT.Z1-RT.Z0)/2,thoMeet=RF.X0+Math.max(0,thoR-E1)/RF.t;
  const main=hip(RF.X0,RF.X1,RF.Z0,RF.Z1,true,true,E1,RF.t,clipF(roofMat),clipF(roofLine),Infinity,clipF(capMat),Math.abs(RT.Z1-RF.Z1)<0.01?Math.min(thoHalf,thoMeet-RF.X0):0);
  // The ancestor-room roof runs into the main roof; clip it (and stop its ridge cap) where its ridge goes under
  // the main roof's east face, otherwise a steeper / higher one shows through.
  const thoPlanes=[new THREE.Plane(new THREE.Vector3(-1,0,0),Math.min(thoCut,thoMeet+0.03)-7)];
  const roofMatT=roofMat.clone();roofMatT.clippingPlanes=thoPlanes;const roofLineT=roofLine.clone();roofLineT.clippingPlanes=thoPlanes;
  const tho=hip(RT.X0,RT.X1,RT.Z0,RT.Z1,true,false,E2,RT.t,roofMatT,roofLineT,thoMeet);
  // its ridge cap stops at the house front (x 1.0): past it the porch roof is cut away under the main roof
  const sanh=hip(RP.X0,RP.X1,RP.Z0,RP.Z1,true,false,E3,RP.t,roofMatS,roofLineS,mx(1.0));
  const fas=M(map.color('fascia'));
  // phào mái: the fascia as a moulded cornice (owner's reference): top lip, the face, a bead and a stepped drip below
  const fb=(x0:number,z0:number,x1:number,z1:number,E:number)=>{const along=Math.abs(x1-x0)>=Math.abs(z1-z0);
    const g=(d:number,y0:number,y1:number)=>along?box(x0-d,Math.min(z0,z1)-d,x1+d,Math.max(z0,z1)+d,y0,y1,fas,true,null,roofG):box(Math.min(x0,x1)-d,z0-d,Math.max(x0,x1)+d,z1+d,y0,y1,fas,true,null,roofG);
    if(Math.abs(x1-x0)<1e-3||Math.abs(z1-z0)<1e-3)return;
    g(0,E-0.15,E);g(0.03,E-0.04,E+0.01);g(0.015,E-0.10,E-0.085);g(0.02,E-0.19,E-0.15);};
  const sf=(x0:number,z0:number,x1:number,z1:number,E:number)=>box(x0,z0,x1,z1,E-0.14,E-0.12,fas,false,null,roofG);
  {// main roof fascia + soffits, in edited coords (follow the roof's own length / width)
    const {X0,X1,Z0,Z1}=RF,hz0=mz(0),hz1=mz(9),hx1=mx(14);noMap=true;
    // the cornice clads the BTCT eave slab's edge, 80 inside the tile edge (TI); the soffit is the slab's underside
    const TI=0.08;
    fb(X0+TI,Z0+TI,X1-TI,Z0+TI+0.06,E1);fb(X0+TI,Z1-TI-0.06,X1-TI,Z1-TI,E1);fb(X1-TI-0.06,Z0+TI,X1-TI,Z1-TI,E1);fb(X0+TI,Z0+TI,X0+TI+0.06,mz(0.3),E1);if(RT.Z1<Z1)fb(X0+TI,RT.Z1,X0+TI+0.06,Z1-TI,E1); // front edge where it shows above the lower porch roof
    sf(X0+TI,Z0+TI,X1-TI,hz0,E1);sf(X0+TI,hz1,X1-TI,Z1-TI,E1);sf(hx1,Z0+TI,X1-TI,Z1-TI,E1);noMap=false;}
  {// ---- flat roof over the WC block + 1500 L stainless water tank (horizontal, Φ1140 x L1750, on its stand) ----
    noMap=true;const X1=RF.X1,Z1=RF.Z1,slab=M(0xbdbab3),wallC=M(map.color('wall'));
    box(FX,FZ,X1,Z1,E1-0.12,E1,slab,true,null,roofG);                                   // slab, top at the eave line
    box(FX,Z1-0.1,X1,Z1,E1,E1+0.3,wallC,true,null,roofG);box(X1-0.1,FZ,X1,Z1-0.1,E1,E1+0.3,wallC,true,null,roofG); // low parapet
    // close the cut faces of the hip roof (a white gable wall along x = FX and z = FZ, up to the roof surface)
    const hR=(x:number,z:number)=>E1+Math.max(0,Math.min(x-RF.X0,z-RF.Z0,RF.Z1-z,RF.X1-x))*RF.t;
    const gable=(alongZ:boolean)=>{const a0=alongZ?FZ:FX,a1=alongZ?Z1:X1,n=40,pos:number[]=[];
      for(let i=0;i<n;i++){const p=a0+(a1-a0)*i/n,q=a0+(a1-a0)*(i+1)/n,hp=alongZ?hR(FX,p):hR(p,FZ),hq=alongZ?hR(FX,q):hR(q,FZ);
        const v=(a:number,y:number)=>alongZ?[FX-7,y,a-4.5]:[a-7,y,FZ-4.5];
        pos.push(...v(p,E1),...v(q,E1),...v(q,hq),...v(p,E1),...v(q,hq),...v(p,hp));}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();
      roofG.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:map.color('wall'),roughness:0.85,side:THREE.DoubleSide})));};
    gable(true);gable(false);
    // the tank (over the WC block, lying along x) on a 1.55 m steel stand, so it sits above the solar heater it feeds
    const tx=(mx(TANK.x0)+mx(TANK.x1))/2-7,tz=mz(TANK.z)-4.5,R=0.57,TL=1.75,cy=TANK.bottom+R;
    const inox=new THREE.MeshStandardMaterial({color:0xe8ebee,roughness:0.3,metalness:0.35}); // no env map: keep it light
    const body=new THREE.Mesh(new THREE.CylinderGeometry(R,R,TL,32),inox);body.rotation.z=Math.PI/2;body.position.set(tx,cy,tz);roofG.add(body);
    for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(R,32,16,0,Math.PI*2,0,Math.PI/2),inox);e.scale.set(1,0.18,1);
      e.rotation.z=-sx*Math.PI/2;e.position.set(tx+sx*TL/2,cy,tz);roofG.add(e);
      for(const b of [-0.5,0.5]){const r=new THREE.Mesh(new THREE.TorusGeometry(R+0.005,0.012,6,40),inox);r.rotation.y=Math.PI/2;r.position.set(tx+sx*TL*0.33+b*0.05,cy,tz);roofG.add(r);}}
    const lid=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,0.08,24),inox);lid.position.set(tx,cy+R+0.02,tz);roofG.add(lid);
    const stand=M(0x8d9399),TB=TANK.bottom;
    for(const sx of [-0.8,0.8])for(const sz of [-0.55,0.55])box(tx+sx-0.03+7,tz+sz-0.03+4.5,tx+sx+0.03+7,tz+sz+0.03+4.5,E1,TB,stand,true,null,roofG);
    for(const sz of [-0.55,0.55]){box(tx-0.83+7,tz+sz-0.03+4.5,tx+0.83+7,tz+sz+0.03+4.5,TB-0.06,TB,stand,false,null,roofG);box(tx-0.83+7,tz+sz-0.02+4.5,tx+0.83+7,tz+sz+0.02+4.5,E1+0.5,E1+0.54,stand,false,null,roofG);}
    for(const sx of [-0.8,0,0.8])box(tx+sx-0.03+7,tz-0.58+4.5,tx+sx+0.03+7,tz+0.58+4.5,TB-0.06,TB,stand,false,null,roofG);
    const pipeM=M(0xe9e9e9),dp=(x:number,y0:number,y1:number,z:number)=>{const p=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,y1-y0,10),pipeM);p.position.set(x,(y0+y1)/2,z);roofG.add(p);};
    dp(mx(12.91)-7,E1,TB,tz);dp(mx(11.55)-7,4.75,TB,tz);
    // solar water heater (bình năng lượng mặt trời): horizontal inox tank on top, a row of vacuum tubes sloping down
    // towards the south, steel frame. Its tank top stays below the main tank's bottom (gravity feed).
    {const sx0=mx(SOLAR.x0)-7,sx1=mx(SOLAR.x1)-7,scx=(sx0+sx1)/2,sL=sx1-sx0,stz=mz(SOLAR.tankZ)-4.5,sty=SOLAR.tankY,sR=0.235;
      const st=new THREE.Mesh(new THREE.CylinderGeometry(sR,sR,sL,28),inox);st.rotation.z=Math.PI/2;st.position.set(scx,sty,stz);roofG.add(st);
      for(const e of [-1,1]){const c=new THREE.Mesh(new THREE.CylinderGeometry(sR+0.01,sR+0.01,0.03,28),M(0x9aa1a8));c.rotation.z=Math.PI/2;c.position.set(scx+e*sL/2,sty,stz);roofG.add(c);}
      const fz=mz(SOLAR.z0)-4.5,fy=E1+0.35,tubeM=new THREE.MeshStandardMaterial({color:0x1b2a3a,roughness:0.15,metalness:0.5});
      const a=new THREE.Vector3(0,sty-0.12,stz-0.12),b=new THREE.Vector3(0,fy,fz),L=a.distanceTo(b),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());
      const n=18;for(let i=0;i<n;i++){const x=sx0+0.08+(sL-0.16)*i/(n-1),t=new THREE.Mesh(new THREE.CylinderGeometry(0.029,0.029,L,12),tubeM);
        t.position.set(x,(a.y+b.y)/2,(a.z+b.z)/2);t.quaternion.copy(q);roofG.add(t);}
      const rail=(y:number,z:number)=>box(sx0+7,z-0.025+4.5,sx1+7,z+0.025+4.5,y-0.025,y+0.025,stand,false,null,roofG);
      rail(fy-0.04,fz);rail(sty-0.3,stz);
      for(const x of [sx0+0.05,sx1-0.05]){box(x-0.02+7,fz-0.02+4.5,x+0.02+7,fz+0.02+4.5,E1,fy,stand,false,null,roofG);box(x-0.02+7,stz-0.02+4.5,x+0.02+7,stz+0.02+4.5,E1,sty-0.2,stand,false,null,roofG);}
      dp(mx(13.15)-7,E1,sty-sR,stz);}
    noMap=false;}
  {// sub-roof fascia + soffits (porch ceiling), in edited coords like the main roof's
    const wx=mx(1.0),hz0=mz(0),hz9=mz(4.95);noMap=true;
    const TI=0.08;
    fb(RT.X0+TI,RT.Z0+TI,RT.X0+TI+0.06,RT.Z1-TI,E2);fb(RT.X0+TI,RT.Z1-TI-0.06,RF.X0+TI,RT.Z1-TI,E2);if(RP.Z1<=RT.Z0)fb(RT.X0+TI,RT.Z0+TI,0,RT.Z0+TI+0.06,E2); // hidden under the porch roof where they overlap
    sf(RT.X0+TI,RT.Z0+TI,mx(THO_X),RT.Z1-TI,E2);sf(mx(THO_X),RT.Z0+TI,RF.X0+TI,mz(4.95),E2); // its south overhang above the lower porch roof
    fb(RP.X0+TI,RP.Z0+TI,RP.X0+TI+0.06,RP.Z1-TI,E3);fb(RP.X0+TI,RP.Z0+TI,wx,RP.Z0+TI+0.06,E3);if(RT.X0>RP.X0)fb(RP.X0+TI,RP.Z1-TI-0.06,RT.X0,RP.Z1-TI,E3);fb(wx-0.06,RP.Z0+TI,wx,hz0,E3);
    sf(RP.X0+TI,RP.Z0+TI,wx,Math.min(RP.Z1-TI,hz9),E3);noMap=false;}
  const porchLamp=new THREE.MeshBasicMaterial({color:0xd8d4c8});porchLamp.userData.off=0xd8d4c8; // the big porch ceiling light, its own switch (OUT_PORCH)
  box(-0.15-PO/2,2.2,0.25-PO/2,2.75,E3-0.15,E3-0.14,porchLamp,false,null,roofG);
  const finMat=capMat;
  function finial(x:number,y:number,z:number,h:number){const s=new THREE.Mesh(new THREE.SphereGeometry(0.14,16,12),finMat);s.position.set(x-7,y+0.17,z-4.5);roofG.add(s);
  const s2=new THREE.Mesh(new THREE.SphereGeometry(0.09,16,12),finMat);s2.position.set(x-7,y+0.42,z-4.5);roofG.add(s2);
  const c=new THREE.Mesh(new THREE.ConeGeometry(0.035,h,10),finMat);c.position.set(x-7,y+0.5+h/2,z-4.5);roofG.add(c);}
  finial(main.L,main.r,main.zm,1.0);finial(main.R,main.r,main.zm,1.0);finial(tho.L,tho.r,tho.zm,0.8);finial(sanh.L,sanh.r,sanh.zm,0.7);
  
  // ---- outdoor lights (Bật đèn): eave downlights with a cone of light washed on the wall below, wall sconces
  // (porch columns, both sides of the ancestor-room window) washing light up and down, the big porch light.
  // The washes are additive planes and the downlights have no real light, so dozens of them stay cheap.
  const lights:HouseLights={glows:[],bulbs:[],points:[],hemi,sun,downlights:0,sconces:0,indoor:0,rooms:{},fixtures:[]};
  {
    const spacing=Math.max(0.5,layout.lights?.spacing??LIGHT_SPACING);
    const tex=(draw:(g:CanvasRenderingContext2D)=>void)=>{const c=document.createElement('canvas');c.width=128;c.height=256;draw(c.getContext('2d')!);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;};
    const coneTex=tex(g=>{g.translate(64,0);g.scale(0.42,1);const r=g.createRadialGradient(0,0,4,0,0,256);r.addColorStop(0,'rgba(255,226,170,1)');r.addColorStop(0.35,'rgba(255,210,150,.55)');r.addColorStop(1,'rgba(255,200,140,0)');g.fillStyle=r;g.fillRect(-160,0,320,256);});
    const washTex=tex(g=>{g.translate(64,128);g.scale(0.38,1);const r=g.createRadialGradient(0,0,6,0,0,128);r.addColorStop(0,'rgba(255,226,170,1)');r.addColorStop(0.4,'rgba(255,210,150,.5)');r.addColorStop(1,'rgba(255,200,140,0)');g.fillStyle=r;g.fillRect(-180,-128,360,256);});
    const glowMat=(map:THREE.Texture,o:number)=>new THREE.MeshBasicMaterial({map,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,fog:false});
    const cone=glowMat(coneTex,0.85),wash=glowMat(washTex,0.95);
    // three outdoor groups, each on its own switch by the main door (owner's choice): porch ceiling light, wall washers, eave downlights
    const grp=(k:string,bm:THREE.MeshBasicMaterial)=>{bm.userData.off=bm.userData.off??0x9a9a9a;const R={points:[],glows:[],bulb:bm} as HouseLights['rooms'][string];lights.rooms[k]=R;return R;};
    const eaveR=grp(OUT_EAVE,new THREE.MeshBasicMaterial({color:0x9a9a9a})),washR=grp(OUT_WASH,new THREE.MeshBasicMaterial({color:0x9a9a9a})),porchR=grp(OUT_PORCH,porchLamp);
    const bulb=eaveR.bulb;
    const discGeo=new THREE.CylinderGeometry(0.045,0.045,0.012,16);
    /** Glow plane on a wall face: n = outward normal ('+x' etc.), centred at (x, y, z) world. */
    const glowOn=(mat:THREE.Material,w:number,h:number,x:number,y:number,z:number,n:Dir,R=eaveR)=>{
      const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);m.position.set(x,y,z);m.rotation.y={'+z':0,'-z':Math.PI,'+x':Math.PI/2,'-x':-Math.PI/2}[n];
      m.renderOrder=5;m.visible=false;scene.add(m);R.glows.push(m);};
    /** Downlights spread evenly along [a0, a1] (edited plan coords) at `at` across; wall: face to wash and its range. */
    // E: that roof's eave (the three roofs step down), so each row sits in its own soffit
    const row=(axis:'x'|'z',a0:number,a1:number,at:number,wall?:{face:number;n:Dir;from:number;to:number},E=E1)=>{const SOF=E-0.15;
      if(a1-a0<0.3)return;const n=Math.max(1,Math.round((a1-a0)/spacing));
      for(let i=0;i<n;i++){const a=a0+(i+0.5)*(a1-a0)/n,[x,z]=axis==='x'?[a,at]:[at,a];
        const d=new THREE.Mesh(discGeo,bulb);d.position.set(x-7,SOF-0.006,z-4.5);scene.add(d);lights.downlights++;lights.fixtures.push({x,z,kind:'eave',room:OUT_EAVE});
        if(wall&&a>=wall.from&&a<=wall.to){const off={'+z':0.06,'-z':-0.06,'+x':0.06,'-x':-0.06}[wall.n];
          if(axis==='x')glowOn(cone,1.0,1.9,x-7,SOF-0.95,wall.face+off-4.5,wall.n);else glowOn(cone,1.0,1.9,wall.face+off-7,SOF-0.95,z-4.5,wall.n);}}};
    const hx0=mx(1.0),hx14=mx(14),hz9=mz(9);
    row('x',hx0,RF.X1,(RF.Z0+0)/2,{face:0,n:'-z',from:hx0,to:hx14});                 // main roof, facade side
    row('x',mx(4.0),RF.X1,(hz9+RF.Z1)/2,{face:hz9,n:'+z',from:0,to:hx14});           // main roof, back
    row('z',RF.Z0,RF.Z1,(hx14+RF.X1)/2,{face:hx14,n:'+x',from:0,to:hz9});             // main roof, west end
    row('x',RT.X0,mx(4.0),(hz9+RT.Z1)/2,{face:hz9,n:'+z',from:0,to:hx14},E2);        // ancestor-room roof, back
    row('z',Math.max(RT.Z0,RP.Z1),RT.Z1,(RT.X0+mx(THO_X))/2,{face:mx(THO_X),n:'-x',from:mz(4.95),to:hz9},E2); // ancestor-room roof, east
    row('z',RP.Z0,RP.Z1,(RP.X0+mx(-0.8-PO))/2,undefined,E3);                                  // porch roof, east (over the yard)
    row('x',RP.X0,hx0,(RP.Z0+0)/2,undefined,E3);                                      // porch roof, side-path side
    /** Wall sconce at (x, y, z) world on a face with outward normal n: dark box, bulb, up/down wash, a real light. */
    const boxMat=M(0x1d1f22);
    const sconce=(x:number,y:number,z:number,n:Dir)=>{
      const o={'+z':[0,0.05],'-z':[0,-0.05],'+x':[0.05,0],'-x':[-0.05,0]}[n],along=n[1]==='x';
      const b=new THREE.Mesh(new THREE.BoxGeometry(along?0.09:0.12,0.22,along?0.12:0.09),boxMat);b.position.set(x+o[0],y,z+o[1]);scene.add(b);
      for(const dy of [0.112,-0.112]){const f=new THREE.Mesh(new THREE.BoxGeometry(along?0.07:0.1,0.006,along?0.1:0.07),washR.bulb);f.position.set(x+o[0],y+dy,z+o[1]);scene.add(f);}
      glowOn(wash,0.75,2.1,x+o[0]*0.4,y,z+o[1]*0.4,n,washR);
      const l=new THREE.PointLight(0xffd59a,0,3.2,1.6);l.position.set(x+o[0]*3,y,z+o[1]*3);scene.add(l);washR.points.push({light:l,on:1.1*Math.PI});lights.sconces++;
      lights.fixtures.push({x:x+7+o[0],z:z+4.5+o[1],kind:'sconce',room:OUT_WASH});};
    sconce(mx(PORCH_COL-0.24)-7,1.75,mz(0.11)-4.5,'-x');sconce(mx(PORCH_COL-0.24)-7,1.75,mz(PORCH_NZ)-4.5,'-x');   // porch columns, facing the yard
    const tw=map.windows.find(w=>w.spec.id==='w-tho')!.rect;                          // both sides of the ancestor-room window
    sconce(mx(THO_X)-7,1.75,mz(tw[1])-0.4-4.5,'-x');sconce(mx(THO_X)-7,1.75,mz(tw[3])+0.4-4.5,'-x');
    const pl=new THREE.PointLight(0xfff0d0,0,6,1.4);pl.position.set(mx(0.05-PO/2)-7,E3-0.6,mz(2.475)-4.5);scene.add(pl);porchR.points.push({light:pl,on:2.2*Math.PI});
    lights.fixtures.push({x:mx(0.05-PO/2),z:mz(2.475),kind:'porch',room:OUT_PORCH});
    // ---- gypsum ceilings (trần thạch cao) at +3.2 in every room but the porch, and the indoor lights ----
    // The ceilings are downward-facing planes: seen from inside the rooms, invisible from above (overview with the
    // roof off still looks in). Living room and bedrooms have a dropped border band (giật cấp) with a hidden LED
    // strip washing the raised centre; downlights sit in the band, a ceiling light in the centre. Other rooms get a
    // grid of downlights; the dining table a row of three pendants. One real light per room lights it at night.
    /** Ceiling fan (quạt trần) at (x, z) EDITED coords under a ceiling at y: canopy, down-rod, motor, 5 blades at ~2.75 m. */
    const fanMat=M(0xf2f0eb),bladeMat=M(0x7a5a3e);
    const fan=(x:number,z:number,y:number,room:string)=>{const X=x-7,Z=z-4.5,BY=2.75,g=new THREE.Group();g.position.set(X,0,Z);scene.add(g);
      const add=(m:THREE.Mesh,py:number)=>{m.position.y=py;g.add(m);return m;};
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,0.06,20),fanMat),y-0.03);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,y-BY-0.1,8),fanMat),(y+BY+0.1)/2-0.03);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.11,0.12,24),fanMat),BY+0.02);
      for(let k=0;k<5;k++){const b=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.012,0.13),bladeMat);const a=k*Math.PI*2/5;
        b.position.set(Math.cos(a)*0.4,BY,Math.sin(a)*0.4);b.rotation.y=-a;g.add(b);}
      lights.fixtures.push({x,z,kind:'fan',room});};
    /** Dining-table fan position (default plan): the centre of the table. */
    const KFAN:[number,number]=[6.85,2.55];
    const CEIL=3.2,TRAY=0.15,BAND=0.55,ceilMat=new THREE.MeshStandardMaterial({color:0xf8f7f3,roughness:0.92});ceilMat.userData.oneSided=true;
    const ceil=(x0:number,z0:number,x1:number,z1:number,y:number)=>{if(x1-x0<0.02||z1-z0<0.02)return;
      const m=new THREE.Mesh(new THREE.PlaneGeometry(x1-x0,z1-z0),ceilMat);m.rotation.x=Math.PI/2;m.position.set((x0+x1)/2-7,y,(z0+z1)/2-4.5);scene.add(m);};
    // LED wash on the raised centre: a strip bright along the step, fading inwards; faces down only
    const ledTex=(()=>{const c=document.createElement('canvas');c.width=4;c.height=64;const g=c.getContext('2d')!,gr=g.createLinearGradient(0,64,0,0);
      gr.addColorStop(0,'rgba(255,214,150,1)');gr.addColorStop(0.35,'rgba(255,205,140,.45)');gr.addColorStop(1,'rgba(255,200,140,0)');g.fillStyle=gr;g.fillRect(0,0,4,64);
      const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
    const led=new THREE.MeshBasicMaterial({map:ledTex,transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,fog:false});led.userData.oneSided=true;
    // fixtures are downward-facing discs: seen from below only (no dots on the overview from above); white when off
    const indoorBulb=new THREE.MeshBasicMaterial({color:0xf2f2f2});indoorBulb.userData={off:0xf2f2f2,oneSided:true};
    const ringMat=new THREE.MeshStandardMaterial({color:0xd9d9d9,roughness:0.4,metalness:0.4});ringMat.userData.oneSided=true;
    const disc=(r:number,mat:THREE.Material,x:number,y:number,z:number)=>{const m=new THREE.Mesh(new THREE.CircleGeometry(r,24),mat);m.rotation.x=Math.PI/2;m.position.set(x-7,y,z-4.5);scene.add(m);};
    // downlight Φ75 (a plain disc), spotlight Φ90 (a ring with a recessed lens), owner's sizes
    const down=(x:number,z:number,y:number,bm:THREE.Material,room:string)=>{disc(0.055,ringMat,x,y-0.003,z);disc(0.0375,bm,x,y-0.006,z);lights.indoor++;lights.fixtures.push({x,z,kind:'down',room});};
    const spotMat=M(0x2b2d30);spotMat.userData.oneSided=true;
    const spot=(x:number,z:number,y:number,bm:THREE.Material,room:string)=>{disc(0.065,ringMat,x,y-0.003,z);disc(0.045,spotMat,x,y-0.005,z);disc(0.028,bm,x,y-0.007,z);lights.indoor++;lights.fixtures.push({x,z,kind:'spot',room});};
    const DIRV:Record<Dir,[number,number]>={'+x':[1,0],'-x':[-1,0],'+z':[0,1],'-z':[0,-1]};
    const TRAYS=new Set(['Phòng khách']);
    // bedrooms: flat ceiling, no light over the bed head (default plan coords of the zone at each bed's head)
    const HEAD_ZONE:Record<string,[number,number,number,number]>={'Phòng ngủ 1':[2.4,5.0,4.7,6.35],'Phòng ngủ 2':[6.25,5.0,8.55,6.35],'Phòng ngủ 3':[11.3,0.15,13.6,1.5]};
    const inHead=(room:string,x:number,z:number)=>{const h=HEAD_ZONE[room];if(!h)return false;return x>mx(h[0])&&x<mx(h[2])&&z>mz(h[1])&&z<mz(h[3]);};
    // WC concrete ceiling height, and the x (default plan) of each WC's loft hatch = its door centre
    const WC_CEIL=2.4,WC_SLAB:Record<string,number>={WC1:11.89,WC2:13.22};
    const slabMat=new THREE.MeshStandardMaterial({color:0xe9e8e4,roughness:0.95}),hatchMat=M(0xd9d4cb),loftBox=M(0xb08d5e);
    for(const r of ROOM_DIMS){if(r.room==='Sảnh')continue;
      const R:HouseLights['rooms'][string]={points:[],glows:[],bulb:indoorBulb.clone()};lights.rooms[r.room]=R;
      const [a0,b0,a1,b1]=map.rect(r.rect),x0=a0-0.06,z0=b0-0.06,x1=a1+0.06,z1=b1+0.06,cx=(a0+a1)/2,cz=(b0+b1)/2,w=a1-a0,d=b1-b0;
      if(TRAYS.has(r.room)){
        const ix0=a0+BAND,iz0=b0+BAND,ix1=a1-BAND,iz1=b1-BAND;
        ceil(x0,z0,x1,iz0,CEIL);ceil(x0,iz1,x1,z1,CEIL);ceil(x0,iz0,ix0,iz1,CEIL);ceil(ix1,iz0,x1,iz1,CEIL);ceil(ix0,iz0,ix1,iz1,CEIL+TRAY);
        // the step faces (facing the room centre) and the LED wash on them
        const step=(px:number,pz:number,len:number,n:Dir)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(len,TRAY),ceilMat);
          m.position.set(px-7,CEIL+TRAY/2,pz-4.5);m.rotation.y={'+z':0,'-z':Math.PI,'+x':Math.PI/2,'-x':-Math.PI/2}[n];scene.add(m);
          const v=DIRV[n],gl=new THREE.Mesh(new THREE.PlaneGeometry(len,0.6),led);
          gl.rotation.set(Math.PI/2,0,0);gl.rotateOnWorldAxis(new THREE.Vector3(0,1,0),{'+z':0,'-z':Math.PI,'+x':Math.PI/2,'-x':-Math.PI/2}[n]);
          gl.position.set(px+v[0]*0.3-7,CEIL+TRAY-0.006,pz+v[1]*0.3-4.5);gl.renderOrder=5;gl.visible=false;scene.add(gl);R.glows.push(gl);};
        step((ix0+ix1)/2,iz0,ix1-ix0,'+z');step((ix0+ix1)/2,iz1,ix1-ix0,'-z');step(ix0,(iz0+iz1)/2,iz1-iz0,'+x');step(ix1,(iz0+iz1)/2,iz1-iz0,'-x');
        // a ceiling fan in the centre of the raised tray (owner's choice, no centre light) and downlights along the band
        fan(cx,cz,CEIL+TRAY,r.room);
        const ins=BAND/2,pts:[number,number][]=[];
        const side=(p0:[number,number],p1:[number,number])=>{const L=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]),n=Math.max(1,Math.round(L/1.3));
          for(let k=0;k<=n;k++){const p:[number,number]=[p0[0]+(p1[0]-p0[0])*k/n,p0[1]+(p1[1]-p0[1])*k/n];if(!pts.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<0.3))pts.push(p);}};
        const A:[number,number]=[a0+ins,b0+ins],B:[number,number]=[a1-ins,b0+ins],C:[number,number]=[a1-ins,b1-ins],D:[number,number]=[a0+ins,b1-ins];
        side(A,B);side(B,C);side(C,D);side(D,A);pts.forEach(([x,z])=>down(x,z,CEIL,R.bulb,r.room));
      }else if(WC_SLAB[r.room]){
        // WCs: a 100 mm concrete slab at +2.4 (painted underside), the void above it (to the flat roof) is a storage
        // loft (gác để đồ) opened from the Lavabo side through a single hatch above the WC1 door (the loft spans both WCs)
        const sl=new THREE.Mesh(new THREE.BoxGeometry(x1-x0+0.06,0.1,z1-z0+0.06),slabMat);sl.position.set(cx-7,WC_CEIL+0.05,cz-4.5);loftG.add(sl);
        down(cx,cz,WC_CEIL,R.bulb,r.room);
        const hx=mx(WC_SLAB[r.room]),fz=mz(6.05)-4.5;   // the one hatch (WC1 only), on the Lavabo face of the WC wall
        if(r.room==='WC1'){const hd=new THREE.Mesh(new THREE.BoxGeometry(0.66,0.56,0.025),hatchMat);hd.position.set(hx-7,2.84,fz-0.0125);scene.add(hd);
        const hh=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.02,0.02),M(0x9aa0a6));hh.position.set(hx-7,2.66,fz-0.035);scene.add(hh);}
        // a few storage boxes on the slab (seen with the roof off)
        [[0.25,0.45,0.42,0.32],[0.75,0.3,0.4,0.3],[0.3,1.2,0.5,0.35],[0.7,1.75,0.38,0.28]].forEach(([u,v,s2,h2])=>{if(u+s2/2>w-0.05)return;
          const bx=new THREE.Mesh(new THREE.BoxGeometry(s2,h2,s2*0.8),loftBox);bx.position.set(a0+u-7,WC_CEIL+0.1+h2/2,b0+v+0.3-4.5);loftG.add(bx);});
      }else if(BED_LIGHTS[r.room]){
        // PN1 / PN2 / PN3: flat ceiling, 4 corner spotlights 0.6 m from both walls and one downlight on its own group
        ceil(x0,z0,x1,z1,CEIL);
        // 4 corner spotlights Φ90 (the room group) + the room's downlight Φ75 (own group, BED_LIGHTS)
        for(const [x,z] of [[a0+0.6,b0+0.6],[a1-0.6,b0+0.6],[a1-0.6,b1-0.6],[a0+0.6,b1-0.6]])spot(x,z,CEIL,R.bulb,r.room);
        const BL=BED_LIGHTS[r.room],bx=mx(BL.x),bz=mz(BL.z);
        if(BL.own){const key=bedLamp(r.room),RB:HouseLights['rooms'][string]={points:[],glows:[],bulb:indoorBulb.clone()};lights.rooms[key]=RB;
          down(bx,bz,CEIL,RB.bulb,key);
          const bp=new THREE.PointLight(0xffe9c8,0,3.5,1.2);bp.position.set(bx-7,CEIL-0.35,bz-4.5);scene.add(bp);RB.points.push({light:bp,on:0.35*Math.PI});}
        else down(bx,bz,CEIL,R.bulb,r.room); // PN3: one group with the corners, on the room's 2-way switches
      }else if(HEAD_ZONE[r.room]){
        // flat ceiling: a ceiling light (ốp trần) over the free floor, downlights on a ~1.3 m grid, none at the bed head
        ceil(x0,z0,x1,z1,CEIL);
        let lx=cx,lz=cz;const h=HEAD_ZONE[r.room];
        if(inHead(r.room,lx,lz)){const hz=[mx(h[0]),mz(h[1]),mx(h[2]),mz(h[3])];
          const cand:[number,number][]=[[cx,hz[3]+0.6],[cx,hz[1]-0.6],[hz[2]+0.6,cz],[hz[0]-0.6,cz]].filter(p=>p[0]>a0+0.4&&p[0]<a1-0.4&&p[1]>b0+0.4&&p[1]<b1-0.4) as [number,number][];
          if(cand.length)[lx,lz]=cand[0];}
        disc(0.26,ringMat,lx,CEIL-0.004,lz);disc(0.23,R.bulb,lx,CEIL-0.008,lz);lights.indoor++;lights.fixtures.push({x:lx,z:lz,kind:'ceiling',room:r.room});
        const nx=Math.max(2,Math.round((w-0.3)/1.3)),nz=Math.max(2,Math.round((d-0.3)/1.3));
        for(let i=0;i<nx;i++)for(let k=0;k<nz;k++){const x=a0+0.45+(w-0.9)*i/(nx-1),z=b0+0.45+(d-0.9)*k/(nz-1);
          if(inHead(r.room,x,z)||Math.hypot(x-lx,z-lz)<0.7)continue;down(x,z,CEIL,R.bulb,r.room);}
      }else{
        ceil(x0,z0,x1,z1,CEIL);
        const one=r.room==='Lavabo',nx=one?1:Math.max(1,Math.round((w-0.4)/1.6)),nz=one?1:Math.max(1,Math.round((d-0.4)/1.6)); // the washing zone: 1 light (owner's choice)
        for(let i=0;i<nx;i++)for(let k=0;k<nz;k++){const x=a0+w*(i+0.5)/nx,z=b0+d*(k+0.5)/nz;
          if(r.room==='Bếp + ăn'&&Math.hypot(x-mx(KFAN[0]),z-mz(KFAN[1]))<0.75)continue; // under the dining fan
          down(x,z,CEIL,R.bulb,r.room);}
      }
      const ch=WC_SLAB[r.room]?WC_CEIL:CEIL;
      const pt=new THREE.PointLight(0xffe9c8,0,Math.max(w,d)*1.7,1.2);pt.position.set(cx-7,ch-0.35,cz-4.5);scene.add(pt);
      R.points.push({light:pt,on:(0.45+w*d*0.045)*Math.PI});
    }
    // ceiling fan over the dining table (replaces the three pendants, owner's choice)
    fan(mx(KFAN[0]),mz(KFAN[1]),CEIL,'Bếp + ăn');
  }
  // ---- structure (Kết cấu button): a preliminary frame derived from the current walls — pad footings under a
  // column at every wall corner / junction (plus extra ones on long walls, kept out of door and window openings),
  // ground beams (dầm móng) under every wall and a tie beam (dầm giằng) at the eaves. Hidden unless switched on.
  // Built in EDITED coords so it follows room stretches; not part of collisions or clicks.
  const structG=new THREE.Group();structG.visible=false;scene.add(structG);
  const SM={foot:M(0x8f8b84),lean:M(0xc9c4b8),gb:M(0xb86a2c),col:M(0xc23b2e),tie:M(0xd99a1e)};
  const sEdge=new THREE.LineBasicMaterial({color:0x2a2a2a,transparent:true,opacity:0.6});
  const sbox=(x0:number,z0:number,x1:number,z1:number,y0:number,y1:number,mat:THREE.Material)=>{
    const g=new THREE.BoxGeometry(Math.abs(x1-x0),y1-y0,Math.abs(z1-z0)),m=new THREE.Mesh(g,mat);
    m.position.set((x0+x1)/2-7,(y0+y1)/2,(z0+z1)/2-4.5);structG.add(m);
    const e=new THREE.LineSegments(new THREE.EdgesGeometry(g),sEdge);e.position.copy(m.position);structG.add(e);};
  const structure:House['structure']={group:structG,columns:0,footings:0,groundBeam:0,tieBeam:0,cols:[],beams:[]};
  {
    const C=0.22,MAXSPAN=5.0;
    // footing levels after the owner's foundation detail (anh-ket-cau MĐ-1): pad underside −2.000 on 100 lean concrete,
    // pad 300 + sloped top 200 (to −1.500), the neck column up to the ground beam
    const Y={foot0:-2.0,foot1:-1.7,foot2:-1.5,gb0:-0.7,gb1:-0.3,tie0:E1-0.3,tie1:E1};
    // wall centre lines in default plan coords: axis 'x' = runs along x at z = at
    type Line={axis:'x'|'z';at:number;a0:number;a1:number;/** ground beam only, no tie beam on top */noTie?:boolean};
    const lines:Line[]=WALLS.map(w=>(w[2]-w[0])>=(w[3]-w[1])?{axis:'x',at:(w[1]+w[3])/2,a0:w[0],a1:w[2]}:{axis:'z',at:(w[0]+w[2])/2,a0:w[1],a1:w[3]});
    // The middle-wall beam runs on unbroken over the corridor → lavabo opening (x 11.45–13.2), and the WC1 / WC2
    // partition beam (x = 12.51) is carried on through the lavabo to land on it, so no beam end is left open there.
    {const sp=lines.filter(l=>l.axis==='x'&&Math.abs(l.at-5)<0.01);
      if(sp.length>1){const one={...sp[0],a0:Math.min(...sp.map(l=>l.a0)),a1:Math.max(...sp.map(l=>l.a1))};
        for(const l of sp)lines.splice(lines.indexOf(l),1);lines.push(one);}
      const wc=lines.find(l=>l.axis==='z'&&Math.abs(l.at-12.51)<0.01);if(wc)wc.a0=5.0;
      // no tie beam along the bedroom-3 / corridor wall (z = 4), by the owner's choice; it keeps its ground beam
      const cor=lines.find(l=>l.axis==='x'&&Math.abs(l.at-4)<0.01);if(cor)cor.noTie=true;
      // the thờ / PN1 wall (x 2.55..2.71) and the PN1 / PN2 wall (x 6.4..6.56) are built out to the face of their
      // columns on the PN1 / PN2 side, so the columns at (2.6, 5) and (6.45, 5) do not show in those rooms; their
      // beams stay on the column lines
      // the PN2 / lavabo-WC wall keeps 100 mm; its columns move to x = 10.83 instead (owner's choice), flush with the PN2
      // face (10.72) and standing out on the lavabo / WC side, so nothing shows in PN2 and WC1 stays 1.6 m
      for(const [wc,cl] of [[2.63,2.6],[10.77,10.83]]){const l=lines.find(l=>l.axis==='z'&&Math.abs(l.at-wc)<0.01);if(l)l.at=cl;}}
    const pts:[number,number][]=[];
    const addPt=(x:number,z:number)=>{if(!pts.some(p=>Math.abs(p[0]-x)<0.3&&Math.abs(p[1]-z)<0.3))pts.push([x,z]);};
    // openings on a line (default coords, along the line), to keep columns out of them
    const holesOn=(l:Line)=>HOLES.filter(h=>l.axis==='x'?h[1]<=l.at&&h[3]>=l.at:h[0]<=l.at&&h[2]>=l.at)
      .map(h=>l.axis==='x'?[h[0],h[2]]:[h[1],h[3]]).filter(([p,q])=>q>l.a0&&p<l.a1);
    const freeOn=(l:Line,a:number)=>!holesOn(l).some(([p,q])=>a>p-C/2-0.05&&a<q+C/2+0.05);
    /** The free position nearest to t (within [lo, hi]) on all the given lines. */
    const nudge=(t:number,ls:Line[],lo=-Infinity,hi=Infinity)=>{
      for(let d=0;d<=1.5;d+=0.05)for(const c of [t-d,t+d])if(c>lo&&c<hi&&ls.every(l=>freeOn(l,c)))return c;return null;};
    const mapA=(l:Line,a:number)=>l.axis==='x'?mx(a):mz(a);
    // Column grid (a frame with the usual 3.5–5 m spans, not a column at every wall junction): the outside corners,
    // where the room walls meet the back wall, and two cross frames through the open living room + kitchen (one in
    // the middle, one on the bedroom-3 wall x = 10 carried on to the middle wall), each with a column at both ends
    // and a beam across. The middle wall (z = 5) is carried by those frames; thin partitions (WC, the corridor
    // stub, bedroom 3's inner walls, the x = 10.77 wall's front end) just sit on the beams.
    // Bedroom 1 / 2 columns sit in the room corners (where the bedroom walls meet the middle wall: x = 2.6, 6.45,
    // 10.77), not mid-wall. The middle cross frame (owner's choice) stands at the wine cabinet: a facade column at
    // x = 6.0, on the TV-wall line (5.9..6.1), with a straight beam over the TV wall to the middle-wall beam; the
    // kitchen door d-bep starts right beside it and opens against the wine cabinet. x = 10: no column at the bedroom-3 / corridor corner (owner's choice);
    // the x = 10 beam runs from the facade column to the middle-wall beam. The corridor wall (z = 4) has no tie beam.
    // The living-room front wall (x = 1.1) has no column where it meets the middle wall either: its beam lands on the
    // middle-wall beam, so the ancestor room has columns only in its four corners.
    // Bedroom 2 likewise has columns only in its corners: the lavabo / WC wall's beam (z = 6.1) lands on the x = 10.83 beam (columns on that line moved to 10.83).
    // west gable (owner's choice): one column at the middle-wall junction (13.9, 5) instead of (13.9, 4) and (13.9, 6.1)
    // the PN1 corner column moved from (2.6, 5) to the main-door wall corner (1.1, 5), and the PN1 / PN2 one on the
    // middle wall from (6.45, 5) to (6.0, 5), in line with the living room's TV wall (owner's choices; walls unchanged)
    // no column at the ancestor room's porch corner (THO_X, 5) (owner's choice): the porch's north beam runs on the
    // middle-wall line into the living-room column (1.1, 5), and the thờ front wall's beam lands on it
    for(const p of [[1.1,0.1],[13.9,0.1],[13.9,5],[1.1,5],[6.0,5],[10.83,5],[THO_X+0.1,8.9],[2.6,8.9],[6.58,8.9],[10.83,8.9],[13.9,8.9]])addPt(p[0],p[1]);
    const cross:Line[]=[];
    const MID=6.0;addPt(MID,0.1);cross.push({axis:'z',at:MID,a0:0.1,a1:5.0});
    addPt(10,0.1);
    cross.push({axis:'z',at:10,a0:3.95,a1:5.0}); // joins the x = 10 wall beam (ends 3.95) with no gap
    // a column on the open beams and outside walls wherever a span grows past MAXSPAN (room stretched)
    for(const l of [...lines,...cross]){
      const on=pts.filter(p=>Math.abs((l.axis==='x'?p[1]:p[0])-l.at)<0.05).map(p=>l.axis==='x'?p[0]:p[1]).sort((p,q)=>p-q);
      for(let i=0;i+1<on.length;i++){
        const s0=on[i],s1=on[i+1];
        // the living room keeps a clear 4.9 m facade span (1.1 → 6.0, over the 4-leaf window): no extra column
        // or cross beam in the middle of the room, by the owner's choice
        if(l.axis==='x'&&Math.abs(l.at-0.1)<0.05&&Math.abs(s0-1.1)<0.05&&Math.abs(s1-MID)<0.05)continue;
        const n=Math.ceil((mapA(l,s1)-mapA(l,s0))/MAXSPAN);
        for(let k=1;k<n;k++){const c=nudge(s0+(s1-s0)*k/n,[l],s0+0.8,s1-0.8);if(c!==null)l.axis==='x'?addPt(c,l.at):addPt(l.at,c);}}
    }
    lines.push(...cross);
    // Porch (1.8 m deep, only the small porch roof on it): no footings of its own. Its two columns stand on ground
    // beams cantilevered out from the house: the facade beam line (z = 0.1) carried on, and one hard against the
    // middle-wall line (z = PORCH_NZ, straight on into the living-room column), plus a front ground beam linking the two.
    const porch:[number,number][]=[[PORCH_COL,0.11],[PORCH_COL,PORCH_NZ]];
    // footings + columns (mapped centres; sizes stay real)
    // The middle wall (and any 110 wall running along x) is built flush with the FRONT face of its columns, so the
    // living room / kitchen / corridor side is flat: the column (and the beams on that line) shift towards the
    // bedrooms and stick out ~110 mm there only, shown as a pilaster (trụ áp tường) in the wall colour.
    const thinX=(x:number,z:number)=>WALLS.find(w=>(w[3]-w[1])<0.15&&(w[2]-w[0])>(w[3]-w[1])&&Math.abs((w[1]+w[3])/2-z)<0.02&&x>=w[0]-0.01&&x<=w[2]+0.01);
    const colZ=(x:number,z:number)=>{const w=thinX(x,z);return w?mz(w[1])+C/2:mz(z);};
    // footing type by the column's tributary roof / floor area (half the spans to the next column on its row and on
    // its line, 0.6 m past an outside wall): MĐ1 1500, MĐ2 1300, MĐ3 1200, MĐ4 1000 (owner's reference set);
    // C2 (4Ø18) on MĐ1 / MĐ2, C1 (4Ø16) elsewhere, C3 the porch columns
    const half=(arr:number[],v:number)=>{const lo=arr.filter(a=>a<v-0.3),hi=arr.filter(a=>a>v+0.3);
      return ((lo.length?v-Math.max(...lo):1.2)+(hi.length?Math.min(...hi)-v:1.2))/2;};
    const footOf=(x:number,z:number)=>{const ax=half(pts.filter(p=>Math.abs(p[1]-z)<0.3).map(p=>p[0]),x),az=half(pts.filter(p=>Math.abs(p[0]-x)<0.3).map(p=>p[1]),z),A=ax*az;
      const [t,B]=A>=18?['MĐ1',1.5]:A>=11?['MĐ2',1.3]:A>=6.5?['MĐ3',1.2]:['MĐ4',1.0];return {foot:t as string,B:B as number,ct:B>=1.3?'C2':'C1',trib:A};};
    for(const [x,z] of pts){const X=mx(x),Z=colZ(x,z),ft=footOf(x,z),FOOT=ft.B;structure.cols.push({x:X,z:Z,porch:false,...ft});
      sbox(X-FOOT/2-0.1,Z-FOOT/2-0.1,X+FOOT/2+0.1,Z+FOOT/2+0.1,Y.foot0-0.1,Y.foot0,SM.lean);
      sbox(X-FOOT/2,Z-FOOT/2,X+FOOT/2,Z+FOOT/2,Y.foot0,Y.foot1,SM.foot);
      {const r0=FOOT/2*Math.SQRT2,r1=(C/2+0.05)*Math.SQRT2,g=new THREE.CylinderGeometry(r1,r0,Y.foot2-Y.foot1,4,1),m=new THREE.Mesh(g,SM.foot);
        m.rotation.y=Math.PI/4;m.position.set(X-7,(Y.foot1+Y.foot2)/2,Z-4.5);structG.add(m);const e=new THREE.LineSegments(new THREE.EdgesGeometry(g),sEdge);e.rotation.copy(m.rotation);e.position.copy(m.position);structG.add(e);}
      sbox(X-C/2,Z-C/2,X+C/2,Z+C/2,Y.foot1,Y.tie1,SM.col);structure.columns++;structure.footings++;}
    noMap=true;
    for(const [x,z] of pts){
      if(!WALLS.some(w=>Math.min(w[2]-w[0],w[3]-w[1])<0.15&&x>=w[0]-0.01&&x<=w[2]+0.01&&z>=w[1]-0.01&&z<=w[3]+0.01))continue;
      const X=mx(x),Z=colZ(x,z),f=thinX(x,z)?0.003:0;box(X-C/2,Z-C/2+f,X+C/2,Z+C/2,0,Y.tie1,wallMat,true);} // flush face: 3 mm behind, no z-fight
    noMap=false;
    for(const [x,z] of porch){const X=mx(x),Z=mz(z);structure.cols.push({x:X,z:Z,porch:true,foot:'',B:0,ct:'C3',trib:0});
      sbox(X-C/2,Z-C/2,X+C/2,Z+C/2,Y.gb0,PC,SM.col);structure.columns++;}
    // beams along every wall line; the eave tie beam on every wall
    const beam=(l:Line,y0:number,y1:number,mat:THREE.Material)=>{
      const p=mapA(l,l.a0),q=mapA(l,l.a1),c=l.axis==='x'?colZ((l.a0+l.a1)/2,l.at):mx(l.at);
      if(l.axis==='x')sbox(p,c-C/2,q,c+C/2,y0,y1,mat);else sbox(c-C/2,p,c+C/2,q,y0,y1,mat);return q-p;};
    const rec=(l:Line,porch:boolean)=>{const p=l.axis==='x'?mx(l.a0):mz(l.a0),q=l.axis==='x'?mx(l.a1):mz(l.a1),c=l.axis==='x'?colZ((l.a0+l.a1)/2,l.at):mx(l.at);
      structure.beams.push(l.axis==='x'?{x0:p,z0:c,x1:q,z1:c,porch}:{x0:c,z0:p,x1:c,z1:q,porch});};
    for(const l of lines){structure.groundBeam+=beam(l,Y.gb0,Y.gb1,SM.gb);if(!l.noTie)structure.tieBeam+=beam(l,Y.tie0,Y.tie1,SM.tie);rec(l,false);}
    for(const l of [{axis:'z',at:PORCH_COL,a0:0.11,a1:PORCH_NZ},{axis:'x',at:0.11,a0:PORCH_COL,a1:1.1},{axis:'x',at:PORCH_NZ,a0:PORCH_COL,a1:THO_X}] as Line[]){
      // the north porch tie beam (at the porch beam level) runs on inside the thờ wall to the main-door wall column (1.1, 5), not ending in the air at THO_X
      const t=l.axis==='x'&&l.at===PORCH_NZ?{...l,a1:1.1}:l;
      structure.groundBeam+=beam(l,Y.gb0,Y.gb1,SM.gb);structure.tieBeam+=beam(t,PC,PC+0.3,SM.tie);rec(t,true);}
  }
  // ---- roof slab (sàn mái BTCT 100) and steel roof frame (khung thép mái ngói), after the owner's reference set:
  // cây chống / cầu phong 40x80x1.8 (rafters ~1.2 m apart), li tô 30x30x1.4 at 200 from the eave then every 330, a ring
  // of props + purlin 2.4 m in from the ridge. The slab is drawn with the roof (hidden with it) and ghosted in the
  // structure view, where the frame shows. Built from the three roofs as rendered (the top surface wins).
  /** valley gutter outlets [x, y, z] (mapped plan coords), piped down inside the nearest column */
  const rainOut:[number,number,number][]=[];
  const roofFrame:RoofFrame={members:[],props:[],slabs:[],area:{main:0,tho:0,sanh:0},ridge:0,hips:0,valley:0,ridgeEnds:0,hipFeet:0,valleyPts:[],downpipes:[],roofs:[],edgePts:[],t:RF.t};
  {
    const SLAB=0.1,THO_TOP=E2;
    const slabMat=M(0xb9b6ae),slabGhost=new THREE.MeshStandardMaterial({color:0x9fa4aa,transparent:true,opacity:0.3,depthWrite:false});
    const PCX=-0.625-PORCH_OUT; // the porch roof / slab reference line (the columns now stand further out, PORCH_COL)
    for(const [x0,z0,x1,z1,y] of [[1.0,0.2,10.72,9.0,E1],[10.72,0.2,14.0,6.05,E1],[4.0,0,14.0,0.2,E1],[THO_X,5.05,1.0,9.0,THO_TOP],
      // eave slab (mái đua BTCT) 600 out from the outer wall faces (the WC corner has the flat roof slab)
      [0.4,-0.6,14.6,0,E1],[14,0,14.6,6.05,E1],[THO_X-0.6,9.0,10.72,9.6,E1],[THO_X-0.6,4.35,THO_X,9.0,E1],[THO_X,4.35,0.4,4.95,E1],
      // porch slab under its roof, 600 out from the porch beam faces (PORCH_EAVE from the column centres)
      [PCX-PORCH_EAVE,0.11-PORCH_EAVE,1.0,4.95,E3],[PCX-PORCH_EAVE,4.95,THO_X,PORCH_NZ+PORCH_EAVE,E3]] as [number,number,number,number,number][]){
      box(x0,z0,x1,z1,y-SLAB,y,slabMat,false,null,roofG);
      const X0=mx(x0),Z0=mz(z0),X1=mx(x1),Z1=mz(z1);sbox(X0,Z0,X1,Z1,y-SLAB,y,slabGhost);roofFrame.slabs.push({x0:X0,z0:Z0,x1:X1,z1:Z1,y});}
    const RDEF:{k:RoofKey;r:typeof RF;E:number;hl:boolean;hr:boolean;ex:(x:number,z:number)=>boolean}[]=[
      {k:'main',r:RF,E:E1,hl:true,hr:true,ex:(x,z)=>x>FX&&z>FZ},
      {k:'tho',r:RT,E:E2,hl:true,hr:false,ex:x=>x>thoCut},
      {k:'sanh',r:RP,E:E3,hl:true,hr:false,ex:(x,z)=>x>mx(1.0)&&z>mz(0.2)}];
    type RD=typeof RDEF[number];
    const hOf=(d:RD,x:number,z:number)=>{const r=d.r,e=1e-6;if(x<r.X0-e||x>r.X1+e||z<r.Z0-e||z>r.Z1+e||d.ex(x,z))return -Infinity;
      return d.E+Math.max(0,Math.min(d.hl?x-r.X0:Infinity,z-r.Z0,r.Z1-z,d.hr?r.X1-x:Infinity))*r.t;};
    const built=(d:RD,x:number,z:number)=>{const h=hOf(d,x,z);return h>-Infinity&&RDEF.every(o=>o===d||hOf(o,x,z)<=h+1e-6);};
    const steel=M(0x5d6670),batt=M(0x8f979f),purl=M(0x3f4852),X=new THREE.Vector3(1,0,0);
    const mesh=(a:number[],b:number[],w:number,h:number,mat:THREE.Material)=>{const A=new THREE.Vector3(a[0]-7,a[1],a[2]-4.5),B=new THREE.Vector3(b[0]-7,b[1],b[2]-4.5),L=A.distanceTo(B);if(L<0.02)return;
      const m=new THREE.Mesh(new THREE.BoxGeometry(L,h,w),mat);m.position.copy(A).add(B).multiplyScalar(0.5);m.quaternion.setFromUnitVectors(X,B.clone().sub(A).normalize());structG.add(m);};
    const add=(kind:RoofMember['kind'],d:RD,a:[number,number,number],b:[number,number,number])=>{roofFrame.members.push({kind,roof:d.k,a,b});
      if(kind==='batten')mesh(a,b,0.03,0.03,batt);else mesh(a,b,0.04,0.08,kind==='rafter'?steel:purl);};
    /** a plan segment on roof d, kept where d is the roof built there; the member's centre `off` below the tiles */
    const seg=(d:RD,kind:RoofMember['kind'],p0:[number,number],p1:[number,number],off:number)=>{
      const L=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]);if(L<0.05)return;const n=Math.max(1,Math.ceil(L/0.05));
      const P=(i:number):[number,number]=>[p0[0]+(p1[0]-p0[0])*i/n,p0[1]+(p1[1]-p0[1])*i/n];let s=-1;
      for(let i=0;i<=n;i++){const q=P(i),o=built(d,q[0],q[1]);if(o&&s<0)s=i;
        if(s>=0&&(!o||i===n)){const e=o?i:i-1;if(e>s){const A=P(s),B=P(e);add(kind,d,[A[0],hOf(d,A[0],A[1])-off,A[1]],[B[0],hOf(d,B[0],B[1])-off,B[1]]);}s=-1;}}};
    const baseAt=(d:RD,x:number,z:number)=>{const s=roofFrame.slabs.find(s=>x>=Math.min(s.x0,s.x1)&&x<=Math.max(s.x0,s.x1)&&z>=Math.min(s.z0,s.z1)&&z<=Math.max(s.z0,s.z1));
      return s?s.y:d.k==='sanh'?E3-0.15:null;};
    const prop=(d:RD,x:number,z:number,type:RoofProp['type'])=>{if(!built(d,x,z))return;const y0=baseAt(d,x,z),y1=hOf(d,x,z)-0.13;if(y0===null||y1-y0<0.3)return;
      if(roofFrame.props.some(p=>Math.hypot(p.x-x,p.z-z)<0.1))return;roofFrame.props.push({x,z,y0,y1,roof:d.k,type});mesh([x,y0,z],[x,y1,z],0.04,0.08,steel);
      const pl=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.008,0.15),purl);pl.position.set(x-7,y0+0.004,z-4.5);structG.add(pl);};
    const steps=(a:number,b:number,max:number)=>{const n=Math.max(1,Math.ceil((b-a)/max-1e-9));return Array.from({length:n+1},(_,i)=>a+(b-a)*i/n);};
    for(const d of RDEF){const {X0,X1,Z0,Z1,t}=d.r,half=(Z1-Z0)/2,zm=(Z0+Z1)/2,L=d.hl?X0+half:X0,R=d.hr?X1-half:X1;
      roofFrame.roofs.push({k:d.k,X0,X1,Z0,Z1,E:d.E,t,hl:d.hl,hr:d.hr});
      // li tô: rings parallel to the eaves, 200 from the edge then every 330, both measured along the slope
      const sl=Math.sqrt(1+t*t);
      for(let o=0.2/sl;o<half-0.05;o+=0.33/sl){
        seg(d,'batten',[d.hl?X0+o:X0,Z0+o],[d.hr?X1-o:X1,Z0+o],0.035);seg(d,'batten',[d.hl?X0+o:X0,Z1-o],[d.hr?X1-o:X1,Z1-o],0.035);
        if(d.hl)seg(d,'batten',[X0+o,Z0+o],[X0+o,Z1-o],0.035);if(d.hr)seg(d,'batten',[X1-o,Z0+o],[X1-o,Z1-o],0.035);}
      // cầu phong: from the eaves up the slope to the ridge / hip, ≤ 1.2 m apart
      const up=(x:number)=>Math.min(half,d.hl?x-X0:Infinity,d.hr?X1-x:Infinity);
      for(const x of steps(X0,X1,1.2)){const u=up(x);seg(d,'rafter',[x,Z0],[x,Z0+u],0.09);seg(d,'rafter',[x,Z1],[x,Z1-u],0.09);}
      for(const z of steps(Z0,Z1,1.2)){const u=Math.min(z-Z0,Z1-z);if(d.hl)seg(d,'rafter',[X0,z],[X0+u,z],0.09);if(d.hr)seg(d,'rafter',[X1,z],[X1-u,z],0.09);}
      // ridge and hips
      seg(d,'ridge',[L,zm],[R,zm],0.09);
      if(d.hl){seg(d,'hip',[X0,Z0],[L,zm],0.09);seg(d,'hip',[X0,Z1],[L,zm],0.09);}if(d.hr){seg(d,'hip',[X1,Z0],[R,zm],0.09);seg(d,'hip',[X1,Z1],[R,zm],0.09);}
      // cây chống: under the ridge ≤ 2.4 m apart, and a ring 2.4 m in from the ridge with its purlin (xà gồ) on top
      for(const x of steps(L,R,2.4))prop(d,x,zm,'ridge');
      const dr=half-2.4;
      if(dr>=0.9){const rx0=d.hl?X0+dr:X0,rx1=d.hr?X1-dr:X1,z0=Z0+dr,z1=Z1-dr;
        for(const x of steps(rx0,rx1,2.4)){prop(d,x,z0,'ring');prop(d,x,z1,'ring');}
        for(const z of steps(z0,z1,2.4)){if(d.hl)prop(d,rx0,z,'ring');if(d.hr)prop(d,rx1,z,'ring');}
        seg(d,'purlin',[rx0,z0],[rx1,z0],0.17);seg(d,'purlin',[rx0,z1],[rx1,z1],0.17);if(d.hl)seg(d,'purlin',[rx0,z0],[rx0,z1],0.17);if(d.hr)seg(d,'purlin',[rx1,z0],[rx1,z1],0.17);}
      if(d.hl&&built(d,L,zm))roofFrame.ridgeEnds++;if(d.hr&&built(d,R,zm))roofFrame.ridgeEnds++;
      for(const [cx,cz,sx,sz] of [[X0,Z0,1,1],[X0,Z1,1,-1],[X1,Z0,-1,1],[X1,Z1,-1,-1]] as const){if((sx>0?d.hl:d.hr)&&built(d,cx+sx*0.05,cz+sz*0.05))roofFrame.hipFeet++;}}
    const len3=(m:RoofMember)=>Math.hypot(m.b[0]-m.a[0],m.b[1]-m.a[1],m.b[2]-m.a[2]);
    for(const m of roofFrame.members){if(m.kind==='ridge')roofFrame.ridge+=len3(m);if(m.kind==='hip')roofFrame.hips+=len3(m);}
    // owner grid (5 cm): tiled areas, valleys (máng xối) between roofs, the visible outline, downpipes at valley ends
    const C=0.05,gx0=Math.min(RF.X0,RT.X0,RP.X0)-C,gz0=Math.min(RF.Z0,RT.Z0,RP.Z0)-C,gx1=Math.max(RF.X1,RT.X1,RP.X1)+C,gz1=Math.max(RF.Z1,RT.Z1,RP.Z1)+C;
    const nx=Math.ceil((gx1-gx0)/C),nz=Math.ceil((gz1-gz0)/C),own=new Int8Array(nx*nz).fill(-1);
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const x=gx0+(i+0.5)*C,z=gz0+(j+0.5)*C;let b=-1,bh=-Infinity;
      RDEF.forEach((d,k)=>{const h=hOf(d,x,z);if(h>bh){bh=h;b=k;}});if(b>=0){own[i*nz+j]=b;roofFrame.area[RDEF[b].k]+=C*C;}}
    const O=(i:number,j:number)=>i<0||j<0||i>=nx||j>=nz?-1:own[i*nz+j];
    const flat=(x:number,z:number)=>x>FX&&z>FZ&&x<RF.X1&&z<RF.Z1;
    let vEdges=0;const ends:[number,number][]=[];const gutter:[number,number,number][]=[];rainOut.length=0;
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const a=O(i,j);
      for(const [di,dj] of [[1,0],[0,1]]){const b=O(i+di,j+dj);const x=gx0+(i+0.5+di/2)*C,z=gz0+(j+0.5+dj/2)*C;
        // a real valley only where the two roof faces meet at the same height (not where the main eave just overhangs
        // the lower porch roof: the water drips off there)
        const ha=a>=0?hOf(RDEF[a],x,z):-Infinity,hb=b>=0?hOf(RDEF[b],x,z):-Infinity;
        // ...and not where two faces are one plane (the thờ wing's north face runs on as the main roof's: mái liền)
        // (the top surface creases into a V there: the mid point sits below the average of the two sides)
        const T=(u:number,v:number)=>Math.max(...RDEF.map(d=>hOf(d,u,v)));
        const cop=!(T(x+0.2,z)+T(x-0.2,z)-2*T(x,z)>0.04||T(x,z+0.2)+T(x,z-0.2)-2*T(x,z)>0.04);
        if(a>=0&&b>=0&&a!==b&&Math.abs(ha-hb)<0.03&&!cop){vEdges++;roofFrame.valleyPts.push([x,z]);gutter.push([x,Math.max(ha,hb),z]);
          let out=false;for(let p=-3;p<=3&&!out;p++)for(let q=-3;q<=3&&!out;q++)if(O(i+p,j+q)<0&&!flat(gx0+(i+p+0.5)*C,gz0+(j+q+0.5)*C))out=true;if(out)ends.push([x,z]);}
        else if((a>=0)!==(b>=0)&&!flat(x,z))roofFrame.edgePts.push([x,z]);}}
    roofFrame.valley=vEdges*C/Math.SQRT2*Math.sqrt(1+RF.t*RF.t/2);
    // outlets (phễu thu) at the low ends of the valley gutters: a gutter point with no lower neighbour; merged within 0.6
    void ends;
    // only at the END of a gutter run (its neighbours all on one side), so not along the level porch / thờ stretch
    const isEnd=(g:[number,number,number])=>{const nb=gutter.filter(q=>q!==g&&Math.hypot(q[0]-g[0],q[2]-g[2])<0.09);
      return nb.length>0&&nb.every(a=>nb.every(b=>Math.hypot(a[0]-b[0],a[2]-b[2])<0.09));};
    for(const g of gutter){const low=!gutter.some(q=>q!==g&&Math.hypot(q[0]-g[0],q[2]-g[2])<0.09&&q[1]<g[1]-1e-4);if(!low||!isEnd(g))continue;
      if(!roofFrame.downpipes.some(q=>Math.hypot(q[0]-g[0],q[1]-g[2])<0.6)){roofFrame.downpipes.push([g[0],g[2]]);rainOut.push(g);}}
    // máng xối (owner's reference roof plan): a 400 galvanised / stainless valley gutter, shown as the strip left
    // visible between the tiles along each valley (one instanced mesh, with the roof)
    {const gm=new THREE.MeshStandardMaterial({color:0xa9b1b8,metalness:0.6,roughness:0.35}),geo=new THREE.BoxGeometry(0.11,0.02,0.11);
      const im=new THREE.InstancedMesh(geo,gm,Math.max(1,gutter.length)),o=new THREE.Object3D();
      gutter.forEach(([x,y,z],i)=>{o.position.set(x-7,y+0.035,z-4.5);o.rotation.set(0,Math.PI/4,0);o.updateMatrix();im.setMatrixAt(i,o.matrix);});
      im.count=gutter.length;roofG.add(im);}
  }
  // ---- water supply / drainage (plumbing.ts): pipes in a hidden group shown by the "Ống nước" button (house
  // ghosted); the technical shaft box and the floor drains are real fittings, always shown.
  const pipeG=new THREE.Group();pipeG.visible=false;scene.add(pipeG);
  {
    const P3=(p:[number,number,number])=>new THREE.Vector3(mx(p[0])-7,p[1],mz(p[2])-4.5);
    const mats:Record<string,THREE.Material>={};
    for(const k of Object.keys(PIPE_STYLE))mats[k]=new THREE.MeshStandardMaterial({color:PIPE_STYLE[k as keyof typeof PIPE_STYLE].color,roughness:0.45,emissive:PIPE_STYLE[k as keyof typeof PIPE_STYLE].color,emissiveIntensity:0.25});
    for(const pp of PIPES){const r=Math.max(0.014,pp.d/2000),mat=mats[pp.kind];
      for(let i=0;i+1<pp.pts.length;i++){const a=P3(pp.pts[i]),b=P3(pp.pts[i+1]),L=a.distanceTo(b);if(L<0.005)continue;
        const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,L,10),mat);m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());pipeG.add(m);
        const j=new THREE.Mesh(new THREE.SphereGeometry(r*1.25,10,8),mat);j.position.copy(b);pipeG.add(j);}}
    // rainwater (owner's reference roof plan: "ống thoát nước trong cột"): from each valley gutter outlet a funnel
    // (phễu thu) and a Ø90 uPVC pipe running under the tiles to the nearest column, down inside it below the ground
    // and out to a rainwater pit (hố ga) with a grate beside the house
    {const rm=mats.rain,R=0.045;
      const steel=new THREE.MeshStandardMaterial({color:0xa9b1b8,metalness:0.6,roughness:0.35});
      const seg=(a:THREE.Vector3,b:THREE.Vector3)=>{const L=a.distanceTo(b);if(L<0.005)return;const m=new THREE.Mesh(new THREE.CylinderGeometry(R,R,L,12),rm);
        m.position.copy(a).add(b).multiplyScalar(0.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());pipeG.add(m);
        const j=new THREE.Mesh(new THREE.SphereGeometry(R*1.2,10,8),rm);j.position.copy(b);pipeG.add(j);};
      // keep the pits off the house, the porch floor and the steps (default plan coords)
      const blocked=(x:number,z:number)=>[[1.0,0,14,9],[THO_X,5,1.0,9],[0,0,1.0,4.95],[-2.5,-0.35,0,5.5]].some(r=>x>r[0]-0.25&&x<r[2]+0.25&&z>r[1]-0.25&&z<r[3]+0.25);
      for(const [ox,oy,oz] of rainOut){
        const c=structure.cols.reduce((b,q)=>Math.hypot(q.x-ox,q.z-oz)<Math.hypot(b.x-ox,b.z-oz)?q:b,structure.cols[0]);
        const V=(x:number,y:number,z:number)=>new THREE.Vector3(x-7,y,z-4.5);
        const f=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.05,0.12,16,1,true),steel);f.position.copy(V(ox,oy-0.02,oz));roofG.add(f);
        const yTop=oy-0.1,yRun=Math.min(yTop,E3)-0.05,yLow=GROUND-0.45;
        const pit=[[0,0.65],[0,-0.65],[-0.65,0],[0.65,0]].map(([dx,dz])=>[c.x+dx,c.z+dz]).find(([x,z])=>!blocked(x,z))??[c.x,c.z+0.65];
        const pts=[V(ox,yTop,oz),V(c.x,yRun,c.z),V(c.x,yLow,c.z),V(pit[0],yLow,pit[1])];
        for(let i=0;i+1<pts.length;i++)seg(pts[i],pts[i+1]);
        noMap=true;box(pit[0]-0.2,pit[1]-0.2,pit[0]+0.2,pit[1]+0.2,GROUND-0.6,GROUND+0.02,M(0x8d8a84),true);
        box(pit[0]-0.16,pit[1]-0.16,pit[0]+0.16,pit[1]+0.16,GROUND+0.02,GROUND+0.03,M(0x2b2d30),false);noMap=false;}
      // the clean-water pits of the AC condensate and the flat roof (plumbing.ts), and the flat roof's drain funnel
      for(const p of RAIN_PITS){const t=p.top??GROUND;box(p.x-0.2,p.z-0.2,p.x+0.2,p.z+0.2,GROUND-0.6,t+0.012,M(0x8d8a84),true);
        box(p.x-0.16,p.z-0.16,p.x+0.16,p.z+0.16,t+0.012,t+0.02,M(0x2b2d30),false);}
      {const f=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.03,16),steel);f.position.set(mx(ROOF_DRAIN.x)-7,E1+0.015,mz(ROOF_DRAIN.z)-4.5);roofG.add(f);
        const gr=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.075,0.035,12),M(0x2b2d30));gr.position.copy(f.position);roofG.add(gr);}}
    // septic tank + manholes (below ground) and the vent cap
    const conc=new THREE.MeshStandardMaterial({color:0x9c9890,roughness:0.9,transparent:true,opacity:0.75});
    const g=new THREE.Mesh(new THREE.BoxGeometry(mx(SEPTIC.x1)-mx(SEPTIC.x0),SEPTIC.depth,Math.abs(mz(SEPTIC.z1)-mz(SEPTIC.z0))),conc);
    g.position.set((mx(SEPTIC.x0)+mx(SEPTIC.x1))/2-7,GROUND-SEPTIC.depth/2,(mz(SEPTIC.z0)+mz(SEPTIC.z1))/2-4.5);pipeG.add(g);
    for(const h of MANHOLES){const m=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.7,0.5),conc);m.position.set(mx(h.x)-7,GROUND-0.05,mz(h.z)-4.5);pipeG.add(m);}
    const vpts=PIPES.find(q=>q.kind==='vent')!.pts,vp=vpts[vpts.length-1];
    const cap=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.1,12),mats.vent);cap.position.set(mx(vp[0])-7,vp[1]+0.05,mz(vp[2])-4.5);pipeG.add(cap);
    // odour traps under the floor drains, ball valves (red lever) on the two hot sources, the garden tap
    const trapM=M(0x5f666d),red=M(0xd23a2a),brass=new THREE.MeshStandardMaterial({color:0xc9a23a,roughness:0.35,metalness:0.6});
    for(const f of FLOOR_DRAINS){const t=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,0.12,14),trapM);t.position.set(mx(f.x)-7,-0.07,mz(f.z)-4.5);pipeG.add(t);}
    for(const v of VALVES){const g2=new THREE.Group();g2.position.set(mx(v.x)-7,v.y,mz(v.z)-4.5);pipeG.add(g2);
      const bd=new THREE.Mesh(new THREE.SphereGeometry(0.045,14,10),brass);g2.add(bd);const lv=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.02,0.16),red);lv.position.set(0,0.06,0.04);g2.add(lv);}
    // technical shaft (tiled box, access panel facing the room) and floor drain grates
    const shaftMat=M(0xdfe3e6);box(SHAFT.x0,SHAFT.z0,SHAFT.x1,SHAFT.z1,0,SHAFT.y1,shaftMat,true);
    box(SHAFT.x0+0.04,SHAFT.z0-0.012,SHAFT.x1-0.04,SHAFT.z0,0.9,1.5,M(0xc9ced2),false);
    const grate=M(0x9aa1a8);for(const f of FLOOR_DRAINS)box(f.x-0.075,f.z-0.075,f.x+0.075,f.z+0.075,0.003,0.008,grate,false);
    // garden tap on the back wall (always shown): wall plate, brass bib tap with a red handle
    const brassT=new THREE.MeshStandardMaterial({color:0xc9a23a,roughness:0.35,metalness:0.6});
    for(const t of TAPS){ // u: along the wall, v: out of it (+z or +x)
      const tb=(u0:number,v0:number,u1:number,v1:number,y0:number,y1:number,mat:THREE.MeshStandardMaterial)=>t.n==='+z'?box(t.x+u0,t.z+v0,t.x+u1,t.z+v1,y0,y1,mat,false):box(t.x+v0,t.z+u0,t.x+v1,t.z+u1,y0,y1,mat,false);
      tb(-0.05,0,0.05,0.015,t.y-0.05,t.y+0.05,M(0xd9d9d6));tb(-0.015,0.015,0.015,0.11,t.y-0.015,t.y+0.015,brassT);
      tb(-0.015,0.09,0.015,0.11,t.y-0.07,t.y,brassT);tb(-0.04,0.04,0.04,0.06,t.y+0.02,t.y+0.035,M(0xd23a2a));}
  }
  // ---- electrical fittings (electrical.ts): 2-way switches (click / E toggles the room's lights), sockets, air
  // conditioners, wall TVs, water heaters, the living-room camera and the main panel, on their wall faces.
  const switches:House['switches']=[];
  {
    const plate=new THREE.MeshStandardMaterial({color:0xf6f6f3,roughness:0.45}),rocker=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.3}),
      hole=M(0x30302e),acMat=new THREE.MeshStandardMaterial({color:0xf7f7f5,roughness:0.35}),grey=M(0x8c9095),black=new THREE.MeshStandardMaterial({color:0x111214,roughness:0.3,metalness:0.2}),
      screen=new THREE.MeshStandardMaterial({color:0x1b2633,roughness:0.15,metalness:0.3}),red=new THREE.MeshBasicMaterial({color:0xd23a2a}),green=new THREE.MeshBasicMaterial({color:0x37c46b});
    const ANG:Record<Dir,number>={'+z':0,'-z':Math.PI,'+x':Math.PI/2,'-x':-Math.PI/2};
    for(const e of ELEC){
      const g=new THREE.Group();g.position.set(mx(e.x)-7,e.y,mz(e.z)-4.5);g.rotation.y=ANG[e.n];scene.add(g);
      // local frame: x along the wall, y up, +z out of the wall into the room
      const B=(w:number,h:number,d:number,mat:THREE.Material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z+d/2);g.add(m);return m;};
      const C=(r:number,len:number,mat:THREE.Material,x:number,y:number,z:number,axis:'x'|'z')=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,20),mat);
        if(axis==='x')m.rotation.z=Math.PI/2;else m.rotation.x=Math.PI/2;m.position.set(x,y,z);g.add(m);return m;};
      if(e.kind==='switch2'||e.kind==='switch1'){const lamp=e.lamp??e.room;
        const parts=e.kind==='switch2'?[B(0.086,0.086,0.012,plate),B(0.034,0.06,0.008,rocker,-0.019,0,0.012),B(0.034,0.06,0.008,rocker,0.019,0,0.012)]
          :[B(0.086,0.086,0.012,plate),B(0.05,0.06,0.008,rocker,0,0,0.012)];
        parts.forEach(m=>{m.userData.lamp=lamp;clickables.push(m);});
        switches.push({room:lamp,x:mx(e.x)-7,z:mz(e.z)-4.5});
      }else if(e.kind==='heaterSw'){B(0.086,0.086,0.012,plate);B(0.05,0.06,0.008,rocker,0,0,0.012);B(0.008,0.008,0.004,red,0,0.036,0.012);}
      else if(e.kind==='socket'){B(0.086,0.086,0.012,plate);for(const dx of [-0.011,0.011])C(0.0045,0.004,hole,dx,0.006,0.013,'z');C(0.004,0.004,hole,0,-0.016,0.013,'z');}
      else if(e.kind==='data'){B(0.086,0.086,0.012,plate);B(0.016,0.012,0.003,hole,-0.016,0,0.012);C(0.007,0.004,hole,0.018,0,0.013,'z');}
      else if(e.kind==='ac'){B(0.85,0.28,0.2,acMat);B(0.76,0.025,0.006,grey,0,-0.105,0.2);B(0.04,0.012,0.004,green,0.33,0.05,0.2);}
      else if(e.kind==='acOut'){ // outdoor unit on two wall brackets, fan grille facing out, insulated pipe into the wall
        B(0.8,0.55,0.29,acMat,0,0,0.1);C(0.17,0.01,grey,-0.1,0,0.395,'z');C(0.05,0.012,M(0x5a5e63),-0.1,0,0.397,'z');
        for(const dx of [-0.3,0.3]){B(0.04,0.04,0.42,grey,dx,-0.295,0);B(0.04,0.3,0.04,grey,dx,-0.43,0);}
        const pipe=M(0xe8e6df);B(0.05,0.05,0.1,pipe,0.33,0.1,0);B(0.05,0.18,0.05,pipe,0.33,0.2,0.05);}
      else if(e.kind==='tv'){B(0.97,0.57,0.03,black);B(0.94,0.53,0.004,screen,0,0,0.03);}
      else if(e.kind==='heater'){C(0.21,0.92,acMat,0,0,0.24,'x');B(0.5,0.05,0.04,grey,0,0,0);
        for(const dx of [-0.12,0.12]){const pp=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.45,8),grey);pp.position.set(dx,-0.4,0.18);g.add(pp);}}
      else if(e.kind==='camera'){B(0.09,0.09,0.03,acMat);const head=new THREE.Group();head.position.set(0,-0.03,0.09);head.rotation.y=-Math.PI/4;g.add(head);
        const body=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,0.14),acMat);body.position.set(0,0,0.04);head.add(body);
        const lens=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.01,16),black);lens.rotation.x=Math.PI/2;lens.position.set(0,0,0.115);head.add(lens);
        const arm=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.02,0.08),grey);arm.position.set(0,0.0,-0.02);head.add(arm);}
      else if(e.kind==='wifi'){
        if(e.onTop){ // router lying on the cabinet top: body, status LEDs on the front, four antennas
          const r=new THREE.Mesh(new THREE.BoxGeometry(0.26,0.04,0.17),black);r.position.set(0,0.02,-0.04);g.add(r);
          for(let i=0;i<4;i++){const l=new THREE.Mesh(new THREE.BoxGeometry(0.008,0.006,0.002),green);l.position.set(-0.06+i*0.03,0.02,0.046);g.add(l);}
          for(const dx of [-0.11,-0.04,0.04,0.11]){const a=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.008,0.16,8),black);a.position.set(dx,0.12,-0.12);g.add(a);}
        }else{B(0.18,0.18,0.035,acMat);B(0.05,0.006,0.004,green,0,-0.06,0.035);} // wall-mounted access point
      }
      else if(e.kind==='fanCtl'){B(0.086,0.086,0.012,plate);C(0.022,0.014,grey,0,0,0.019,'z');}
      else if(e.kind==='panel'){B(0.36,0.46,0.1,M(0xe9e9e6));B(0.3,0.005,0.004,grey,0,0.12,0.1);B(0.06,0.03,0.006,grey,0.12,0,0.1);}
    }
  }
  // ---- mirror front-to-back (Cài đặt → Đảo ngược): flip the house group, then every recorded world coordinate.
  // The site (ground, side path, boundary wall, ditch and their labels) is moved out of the flipped group so it stays.
  let mirrorZ:number|null=null;
  if(layout.mirror){
    const MZ=mz(9)-9;mirrorZ=MZ; // = 2 x the house's centre line in world z
    scene.scale.z=-1;scene.position.z=MZ;
    [...scene.children.slice(site0,site1),...siteLabels].forEach(o=>root.add(o));
    const keep=new Set<Rect>([...floors.slice(siteF0,siteF1),...solids.slice(siteS0,siteS1)]);
    const fz=(z:number)=>MZ-z;
    for(const r of [...solids,...floors,...tiles]){if(keep.has(r))continue;const a=fz(r.z1),b=fz(r.z0);r.z0=a;r.z1=b;}
    for(const s of seats){s.z=fz(s.z);s.face=Math.PI-s.face;}
    for(const b of beds){const a=fz(b.z1),c=fz(b.z0);b.z0=a;b.z1=c;if(b.head==='N'||b.head==='S')b.head=b.head==='N'?'S':'N';}
    for(const w of [...windows,...wardrobes])w.z=fz(w.z);
    for(const sw of switches)sw.z=fz(sw.z);
    for(const d of doors)d.mirror=MZ;
    const mm=new THREE.Matrix4().makeScale(1,1,-1).setPosition(0,0,MZ);
    [...cutPlanes,...thoPlanes,...flatPlanes].forEach(p=>p.applyMatrix4(mm));
    // a negative scale turns faces inside out for raycasting (camera occlusion, clicks): test both sides
    scene.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;(Array.isArray(m.material)?m.material:[m.material]).forEach(mt=>{if(!mt.userData.oneSided)mt.side=THREE.DoubleSide;});});
  }
  scene.updateMatrixWorld(true);
  const rb=new THREE.Box3().setFromObject(rackG),rc=rb.getCenter(new THREE.Vector3());
  return { roofFrame, solids, floors, tiles, occluders, doors, wcDoors, windows, wardrobes, beds, seats, labels, clickables, roof: roofG, loft: loftG, rack: { group: rackG, armL, armR }, rackPos: [rc.x, rc.z], root, objects, mirrorZ, lights, tvScreen, structure, pipes: pipeG, walls: WALLS, switches };
}
