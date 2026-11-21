// Geometry of the 9 x 14 m house, ported from ../mo_hinh_3d_nha_ve_sinh_sen_lavabo.html.
// All helpers take PLAN coordinates in meters (house spans x 0..14, z 0..9);
// they subtract (7, 4.5) so the house is centered on the world origin.
import * as THREE from 'three';
import { ELEC } from './electrical';
import { LIGHT_SPACING, MAIN_SIDE, MAIN_TRANSOM, PlanMap, ROOM_DIMS, emptyLayout, type Layout } from './layout';

export type Dir = '+x' | '-x' | '+z' | '-z';
/** Axis-aligned box in WORLD coordinates. */
export interface Rect { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }
/** Something that swings on a vertical hinge: g.rotation.y eases from c (closed) to o (open); t is the target. */
export interface Leaf { g: THREE.Group; c: number; o: number; t: number; /** hinge axis, default 'y' (vertical) */ axis?: 'x' | 'y' }
export interface Door extends Leaf { open: boolean; len: number; /** set when the house is mirrored: world z = mirror - local z */ mirror?: number }
/** Something with hinged leaves that open together: a casement/awning window or a wardrobe. x,z = its front centre. */
export interface Win { leaves: Leaf[]; open: boolean; x: number; z: number; /** cabinets: half-width of the front and display name */ half?: number; name?: string }
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
  structure: { group: THREE.Group; columns: number; footings: number; groundBeam: number; tieBeam: number };
  /** Wall boxes [x0, z0, x1, z1] in DEFAULT plan coords (map them with mx / mz), for drawn floor plans. */
  walls: number[][];
  /** Light switches (WORLD x, z) and the room whose lights they toggle (2-way pairs: two per room). */
  switches: { room: string; x: number; z: number }[];
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
  /** Indoor lights per room (ROOM_DIMS key), switched by that room's 2-way switches. */
  rooms: Record<string, { points: { light: THREE.PointLight; on: number }[]; glows: THREE.Object3D[]; bulb: THREE.MeshBasicMaterial }>;
  /** Ceiling fixtures in EDITED plan coords, for the electrical plan. */
  fixtures: { x: number; z: number; kind: 'down' | 'ceiling' | 'pendant'; room: string }[];
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
  const H = 4.0; // walls run up under the roof; the eave line (wall height outside) is E1
  // eave heights: main roof, ancestor-room roof, porch roof. All equal (as in the client's reference photo) so the
  // white fascia and the mouldings run in one straight line from the front of the porch to the back.
  const E1=3.9,E2=E1,E3=E1; // wall height 3.9 m (client)
  const PC=E3-0.62; // porch column top / underside of the porch beam
  // Roof surface height over an EDITED plan point (the highest roof covering it, as rendered: the porch roof is
  // clipped over the house, the ancestor-room roof east of where it runs under the main roof); -Infinity if none.
  const RS=map.roofs,RF=RS.main,RT=RS.tho,RP=RS.sanh;
  const thoR=E2+(RT.W/2)*RT.t,thoCut=RF.X0+Math.max(0,thoR+0.12-E1)/RF.t;
  // Along the main roof's east edge, where the sub roofs run into it, the valleys between the roofs are open from
  // the side, so there stay under the LOWEST roof covering the point. Further in, the main roof hides everything:
  // stay under the highest (the porch roof's thin strip over the facade wall must not pull that wall down).
  // Flat concrete roof (mái bằng) over the WC block, for the 1500 L water tank: the main hip roof is cut away for
  // x > FX, z > FZ (edited plan coords) out to its eaves, and a slab sits there at the eave height.
  const FX=mx(10.72),FZ=mz(6.2),inFlat=(x:number,z:number)=>x>FX&&z>FZ;
  const roofAt=(x:number,z:number)=>{let hi=-Infinity,lo=Infinity;
    for(const [r,E,k] of [[RF,E1,'main'],[RT,E2,'tho'],[RP,E3,'sanh']] as const){
      if(x<r.X0||x>r.X1||z<r.Z0||z>r.Z1)continue;
      if(k==='tho'&&x>thoCut)continue;
      if(k==='sanh'&&x>mx(1.0)&&z>mz(0.2))continue;
      const h=k==='main'&&inFlat(x,z)?E:E+Math.min(x-r.X0,z-r.Z0,r.Z1-z,k==='main'?r.X1-x:Infinity)*r.t;hi=Math.max(hi,h);lo=Math.min(lo,h);}
    return x<RF.X0+0.6&&lo<Infinity?lo:hi;};
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
      if (y1 <= 0.05 && y1 >= -0.35) { floors.push(r); if (y0 >= 0 && y1 <= 0.03) tiles.push({ ...r, color: '#' + mat.color.getHexString() }); }
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
  box(-8,-6,20,-3.4,-0.32,-0.3,grass,false);box(-8,-1.7,20,15,-0.32,-0.3,grass,false);
  box(-1.3,-1.5,14.6,0,-0.3,-0.28,M(0xb9b4ab));                                     // side path paving
  box(-8,-1.7,20,-1.5,-0.3,1.5,M(0xe9e5dc));box(-8,-1.73,20,-1.47,1.5,1.56,M(0xa9a39a),false); // wall + coping
  const earth=M(0x7d6a4f);
  box(-8,-3.4,20,-3.3,-1.2,-0.3,earth,false);box(-8,-1.8,20,-1.7,-1.2,-0.3,earth,false);box(-8,-3.4,20,-1.7,-1.25,-1.2,M(0x4f4636),false);
  box(-8,-3.3,20,-1.8,-1.2,-0.8,new THREE.MeshStandardMaterial({color:0x5f8f86,transparent:true,opacity:0.85,roughness:0.15}),false);
  const site1=scene.children.length,siteF1=floors.length,siteS1=solids.length; // the site: not mirrored
  box(0,0,14,9,-0.3,0,M(0xcfc9be));
  const stoneMat=M(0x3a3d42);
  box(-0.8,0,0,4.95,-0.3,0,M(0xe2ddd4));
  box(-1.25,1.0,-0.8,4.0,-0.3,-0.15,stoneMat);
  box(-1.05,1.0,-0.8,4.0,-0.15,0,M(0xe8e4dc));
  [[0,0,1.0,4.95,0xe7c3ae],[1.2,0.2,5.95,4.95,0xeeeae4],[5.95,0.2,9.95,4.95,0xe6dfd1],[10.05,4.05,13.8,4.95,0xe6dfd1],[10.05,0.2,13.8,3.95,0xc9a982],[0.2,5.05,2.55,8.8,0xd8c3a5],[2.65,5.05,6.4,8.8,0xc9a982],[6.5,5.05,10.72,8.8,0xc9a982],[10.82,5.05,13.8,6.2,0xdfe3e6],[10.82,6.3,12.46,8.8,0xd6dadd],[12.56,6.3,13.8,8.8,0xd6dadd]].forEach(f=>box(f[0],f[1],f[2],f[3],0,0.012,M(f[4]),false));
  box(2.2,1.3,5.0,3.0,0.012,0.02,M(0xd9d2c4),false);
  const showerTile=M(0x6c747c);
  box(10.84,7.5,12.44,8.78,0.012,0.02,showerTile,false);box(12.58,6.32,13.78,7.6,0.012,0.02,showerTile,false);
  // Window openings [x0,z0,x1,z1,y0,y1] (plan). The original drew glass over solid walls;
  // here walls are cut around them so the sashes can swing open.
  // openings hidden in Cài đặt → Cửa are simply not built: no hole, no leaf, the wall stays closed
  const WINS=map.windows.filter(w=>!w.hidden),WIN=WINS.map(w=>w.rect),DOORS=map.doors.filter(d=>!d.hidden);
  const hasDoor=(id:string)=>DOORS.some(d=>d.spec.id===id);
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
  const WALLS=[[1.0,0,14,0.2],[1.0,0.2,1.2,4.95],[0,4.95,11.45,5.05],[13.2,4.95,14,5.05],[0,5.05,0.2,9],[0.2,8.8,13.8,9],[13.8,0,14,9],[9.95,0.2,10.05,3.95],[9.95,3.95,13.8,4.05],[2.55,5.05,2.65,8.8],[6.4,5.05,6.5,8.8],[10.72,5.05,10.82,8.8],[10.82,6.2,13.8,6.3],[12.46,6.3,12.56,8.8]];
  WALLS.forEach(w=>wallWithHoles(w,0,H,wallMat,true));
  const wcTile=M(0xe9ecee);
  [[10.82,6.3,10.84,8.8],[12.44,6.3,12.46,8.8],[12.56,6.3,12.58,8.8],[13.78,6.3,13.8,8.8],[10.84,6.3,12.44,6.32],[12.58,6.3,13.78,6.32],[10.84,8.78,12.44,8.8],[12.58,8.78,13.78,8.8]].forEach(w=>wallWithHoles(w,0,2.4,wcTile,false));
  // Mouldings (as in the client's reference photo), 4 cm proud of the outside wall faces and cut around doors /
  // windows like the walls. Phào trên: a 0.5 m band right under the eave soffit (main roof; the ancestor wing sits
  // under its lower roof). Phào dưới: plinth from the foundation to 0.45 m, also on the porch-facing walls.
  const band=M(map.color('topBand')),plinth=M(map.color('bottomBand'));
  [[1.0,-0.04,14.04,0],[14,0,14.04,9.04],[0.2,9,14.04,9.04]].forEach(w=>wallWithHoles(w,E1-0.76,E1-0.26,band,true));
  [[-0.04,4.95,0,9.04],[-0.04,9,0.2,9.04]].forEach(w=>wallWithHoles(w,E2-0.76,E2-0.26,band,true));
  [[0.96,-0.04,14.04,0],[14,0,14.04,9.04],[-0.04,9,14.04,9.04],[-0.04,4.91,0,9.04],[0.96,0.2,1.0,4.95],[0,4.91,1.0,4.95]].forEach(w=>wallWithHoles(w,-0.3,0.45,plinth,true));
  box(-0.04,5.9,0,7.94,0.35,0.85,band,false);
  const darkWood=new THREE.MeshStandardMaterial({color:0x4a2c1e,roughness:0.5});
  box(1.2,0.2,5.95,0.28,0,0.1,darkWood,false);box(1.2,4.87,5.95,4.95,0,0.1,darkWood,false);
  const colMat=M(map.color('column'));
  box(-0.8,0,-0.45,0.35,0,PC,colMat);box(-0.8,4.6,-0.45,4.95,0,PC,colMat);
  box(-0.86,-0.06,-0.39,0.41,0,0.5,plinth);box(-0.86,4.54,-0.39,5.01,0,0.5,plinth);
  box(-0.86,-0.06,-0.39,0.41,PC-0.12,PC-0.02,colMat);box(-0.86,4.54,-0.39,5.01,PC-0.12,PC-0.02,colMat);
  box(-0.81,0.1,-0.79,0.25,0.7,PC-0.5,band,false);box(-0.81,4.7,-0.79,4.85,0.7,PC-0.5,band,false);
  // porch beams: from the column tops up to the soffit, right under the fascia line
  box(-0.8,0,-0.45,4.95,PC,E3-0.24,colMat);box(-0.8,0,1.0,0.35,PC,E3-0.24,colMat);box(-0.8,4.6,0,4.95,PC,E3-0.24,colMat);
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
  const stepMat=M(0xbdb6aa);
  if(hasDoor('d-hong'))box(14,3.95,14.42,5.05,-0.3,-0.15,stepMat); // step outside the side door
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
  const wood=M(0x6b4430),white=M(0xfafafa),blanket=M(0x9fb3c8),counter=M(0xd9bb8c),steel=new THREE.MeshStandardMaterial({color:0xc9ced3,roughness:0.3,metalness:0.6}),chrome=new THREE.MeshStandardMaterial({color:0xe6e9ec,roughness:0.15,metalness:0.9}),altar=M(0x8b2e2e),blue=M(0x6aa7d8),chairF=M(0x8e99a6),ceramic=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.25});
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
  obj('tuXanh','Tủ nhỏ màu xanh','Bếp + ăn',true,()=>box(7.32,0.2,7.82,0.7,0,1.1,blue));
  obj('lavabo','Bàn lavabo đôi + gương','Lavabo',true,()=>{box(10.82,5.12,11.32,6.08,0.18,0.82,M(0x6b4430));box(10.82,5.12,10.83,6.08,0,0.18,M(0x3a2a20),false);
  box(10.82,5.1,11.37,6.1,0.82,0.86,M(0xf1efea));
  [5.36,5.84].forEach(z=>{cyl(11.11,0.92,z,0.17,0.13,0.12,ceramic);cyl(11.11,0.975,z,0.15,0.15,0.005,M(0xdfe6ea));
  cyl(10.89,1.02,z,0.014,0.018,0.32,chrome);box(10.89,z-0.012,11.03,z+0.012,1.16,1.18,chrome,false);});
  const mirror=new THREE.MeshStandardMaterial({color:0xcfdbe3,roughness:0.05,metalness:0.85});
  box(10.82,5.15,10.845,6.05,1.15,1.85,mirror);box(10.82,5.2,10.87,6.0,1.87,1.9,new THREE.MeshBasicMaterial({color:0xfff3d6}),false);});
  function shower(xw:number,z:number){cyl(xw+0.05,1.5,z,0.016,0.016,1.2,chrome);
  box(xw+0.05,z-0.012,xw+0.33,z+0.012,2.09,2.11,chrome,false);cyl(xw+0.33,2.07,z,0.13,0.13,0.02,chrome);
  box(xw,z-0.09,xw+0.07,z+0.09,0.95,1.1,chrome,false);
  cyl(xw+0.08,1.25,z+0.09,0.025,0.018,0.22,chrome);
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
  obj('banHoc1','Bàn học + ghế','Phòng ngủ 1',true,()=>desk(2.65,3.65,8.8,1));                 // north-east corner, beside the window
  obj('banHoc2','Bàn học + ghế','Phòng ngủ 2',true,()=>desk(9.4,10.4,8.8,1));
  obj('banHoc3','Bàn học + ghế','Phòng ngủ 3',true,()=>desk(10.06,11.06,0.2,-1));
  obj('giuong3','Giường + 2 tab đầu giường','Phòng ngủ 3',true,()=>{bed(11.55,0.2,13.35,2.2,'N');box(11.1,0.2,11.55,0.65,0,0.5,wood);box(13.35,0.2,13.8,0.65,0,0.5,wood);});
  obj('giuong1','Giường + 2 tab đầu giường','Phòng ngủ 1',true,()=>{bed(2.65,5.05,4.45,7.05,'N');box(4.45,5.05,4.9,5.5,0,0.5,wood);}); // head to the south wall, along the thờ wall
  obj('giuong2','Giường + 2 tab đầu giường','Phòng ngủ 2',true,()=>{bed(6.5,6.55,8.5,8.35,'E');box(6.5,8.35,6.95,8.8,0,0.5,wood);}); // head to the east (PN1) wall
  obj('banTho','Bàn thờ','Phòng thờ',true,()=>box(1.59,5.96,2.55,7.88,0,1.2,altar));
  obj('mayGiat','Máy giặt','Lavabo',true,()=>{box(13.2,5.16,13.8,5.76,0,0.85,white);cyl(13.5,0.6,5.46,0.17,0.17,0.02,M(0x9aa1a8),Math.PI/2*0,Math.PI/2);});
  const glassP=new THREE.MeshStandardMaterial({color:0xbfe3f7,transparent:true,opacity:0.35});
  // WC1 (1.6 m wide): toilet by the door against the west wall, facing the door side; shower inside at the
  // back behind a glass screen. WC2 (1.2 m wide): shower by the door, toilet on the back wall facing the door.
  obj('sen1','Sen cây + vách kính','WC1',true,()=>{shower(10.84,8.25);box(10.84,7.75,10.99,8.0,1.0,1.02,chrome,false);box(10.84,7.47,11.84,7.53,0,2.0,glassP);});
  obj('bonCau1','Bồn cầu','WC1',true,()=>{box(10.84,6.64,11.02,7.06,0,0.8,ceramic);const b=cyl(11.26,0.2,6.85,0.19,0.16,0.4,ceramic);b.scale.set(1.3,1,1);});
  obj('sen2','Sen cây + vách kính','WC2',true,()=>{shower(12.58,6.95);box(12.58,7.15,12.73,7.4,1.0,1.02,chrome,false);box(12.58,7.57,13.18,7.63,0,2.0,glassP);});
  obj('bonCau2','Bồn cầu','WC2',true,()=>{box(12.97,8.6,13.39,8.78,0,0.8,ceramic);const b=cyl(13.18,0.2,8.36,0.19,0.16,0.4,ceramic);b.scale.set(1,1,1.3);});
  const doors:Door[]=[],clickables:THREE.Object3D[]=[];
  rackParts.forEach(p=>{p.userData.rack=true;clickables.push(p);});
  const ang:Record<Dir,number>={'+x':0,'-x':Math.PI,'+z':-Math.PI/2,'-z':Math.PI/2};
  const knobMat=M(0xd4af37);
  /** `deco` replaces the plain slab + knob: the leaf mesh becomes a thin glass pane and deco adds the rest
   *  (each added mesh must be passed to `tag` so it is clickable). */
  type Deco=(g:THREE.Group,len:number,tag:(m:THREE.Mesh)=>void)=>void;
  function door(hx:number,hz:number,len:number,cd:Dir,od:Dir,mat:THREE.Material,deco?:Deco,h=2.1):Door{const g=new THREE.Group();g.position.set(mx(hx)-7,0,mz(hz)-4.5);g.scale.y=h/2.1;
  const geo=new THREE.BoxGeometry(len-0.02,2.1,deco?0.02:0.045);const m=new THREE.Mesh(geo,mat);m.position.set(len/2,1.05,0);g.add(m);
  const parts:THREE.Mesh[]=[m];
  if(deco)deco(g,len,x=>parts.push(x));
  else{const ed=new THREE.LineSegments(new THREE.EdgesGeometry(geo),edgeMat);ed.position.copy(m.position);g.add(ed);
    const kn=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.18,0.1),knobMat);kn.position.set(len-0.1,1.0,0);g.add(kn);parts.push(kn);}
  const c=ang[cd];let d=ang[od]-c;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
  g.rotation.y=c;const o:Door={g,c,o:c+d,t:c,open:false,len};parts.forEach(x=>{x.userData.door=o;clickables.push(x);});doors.push(o);scene.add(g);return o;}

  // ---- main entrance: dark aluminium + smoked glass with gold leading, corner ornaments and long gold handles ----
  const alu=new THREE.MeshStandardMaterial({color:0x3b3d40,roughness:0.45,metalness:0.35});
  const gold=new THREE.MeshStandardMaterial({color:0xd4af37,roughness:0.3,metalness:0.85});
  const tint=new THREE.MeshStandardMaterial({color:0x2a3540,transparent:true,opacity:0.55,roughness:0.05,metalness:0.4});
  const lm=(gr:THREE.Object3D,geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.z=rz;gr.add(m);return m;};
  /** Gold leading on a glass area (group-local, glass in the z = 0 plane): a centre bar, `rows` cross bars,
   *  alternating diamonds and four-point stars where they cross. */
  function goldGrid(gr:THREE.Object3D,x0:number,y0:number,x1:number,y1:number,rows:number,out:THREE.Mesh[]){
    const w=x1-x0,h=y1-y0,xc=(x0+x1)/2,T=0.03;
    out.push(lm(gr,new THREE.BoxGeometry(0.01,h,T),gold,xc,(y0+y1)/2));
    for(let i=1;i<rows;i++){const y=y0+h*i/rows;out.push(lm(gr,new THREE.BoxGeometry(w,0.01,T),gold,xc,y));
      if(i%2)out.push(lm(gr,new THREE.BoxGeometry(0.05,0.05,T+0.004),gold,xc,y,0,Math.PI/4));
      else{[0,Math.PI/2].forEach(r=>out.push(lm(gr,new THREE.BoxGeometry(Math.min(0.14,w*0.5),0.014,T+0.004),gold,xc,y,0,r)));
        [Math.PI/4,-Math.PI/4].forEach(r=>out.push(lm(gr,new THREE.BoxGeometry(0.07,0.012,T+0.004),gold,xc,y,0,r)));}}}
  /** Curved gold triangle in a glass corner; (sx, sy) = ±1 point it into the glass. */
  function cornerOrn(gr:THREE.Object3D,x:number,y:number,sx:number,sy:number,sz:number,out:THREE.Mesh[]){
    const sh=new THREE.Shape();sh.moveTo(0,0);sh.lineTo(sx*sz,0);sh.quadraticCurveTo(sx*sz*0.3,sy*sz*0.3,0,sy*sz);sh.lineTo(0,0);
    const geo=new THREE.ExtrudeGeometry(sh,{depth:0.036,bevelEnabled:false});geo.translate(0,0,-0.018);out.push(lm(gr,geo,gold,x,y));}
  /** Leaf: aluminium stiles/rails around smoked glass with gold leading, corner ornaments, gold bar handle on both faces. */
  const mainLeaf:Deco=(g,len,tag)=>{const o:THREE.Mesh[]=[];
    const L=len-0.02,x0=0.01;
    o.push(lm(g,new THREE.BoxGeometry(0.09,2.1,0.05),alu,x0+0.045,1.05),lm(g,new THREE.BoxGeometry(0.09,2.1,0.05),alu,x0+L-0.045,1.05));
    o.push(lm(g,new THREE.BoxGeometry(L,0.12,0.05),alu,x0+L/2,2.04),lm(g,new THREE.BoxGeometry(L,0.28,0.05),alu,x0+L/2,0.14));
    const gx0=x0+0.09,gx1=x0+L-0.09,gy0=0.28,gy1=1.98;
    goldGrid(g,gx0,gy0,gx1,gy1,6,o);
    cornerOrn(g,gx0,gy1,1,-1,0.13,o);cornerOrn(g,gx1,gy1,-1,-1,0.13,o);cornerOrn(g,gx0,gy0,1,1,0.1,o);cornerOrn(g,gx1,gy0,-1,1,0.1,o);
    cornerOrn(g,x0,0,1,1,0.16,o);cornerOrn(g,x0+L,0,-1,1,0.16,o); // big ornaments on the bottom rail
    const hx=x0+L-0.07;
    for(const z of [0.055,-0.055]){o.push(lm(g,new THREE.BoxGeometry(0.024,0.8,0.024),gold,hx,1.05,z));
      for(const y of [0.72,1.38])o.push(lm(g,new THREE.BoxGeometry(0.018,0.018,0.04),gold,hx,y,z*0.6));}
    o.forEach(tag);};
  // doors from DOOR_SPECS (with the layout's width / height overrides); the main entrance is built below
  const doorById:Record<string,Door>={};
  for(const d of DOORS){const sp=d.spec,[h0,h1]=sp.axis==='x'?[sp.hinge,sp.at]:[sp.at,sp.hinge];
    if(sp.kind==='main'){const c=sp.hinge,lw=d.w/2;
      doorById[sp.id]=door(sp.at,c-d.w/2,lw,'+z','-x',tint,mainLeaf,d.h);door(sp.at,c+d.w/2,lw,'-z','-x',tint,mainLeaf,d.h);continue;}
    const mat=sp.kind==='outer'?mainWood:sp.kind==='wc'?wcDoor:inWood;
    doorById[sp.id]=door(h0,h1,d.w,sp.cd,sp.od,mat,undefined,d.h);}
  const md=DOORS.find(d=>d.spec.kind==='main');
  if(md){// fixed side lights (MAIN_SIDE each side of the leaves) and the transom over all three bays; local x runs along +z
    const W=md.span[1]-md.span[0],L0=MAIN_SIDE,L1=W-MAIN_SIDE,C=W/2,T0=md.h+0.02,T1=md.h+MAIN_TRANSOM;
    const fx=new THREE.Group();fx.position.set(mx(md.spec.at)-7,0,mz(md.span[0])-4.5);fx.rotation.y=-Math.PI/2;scene.add(fx);
    const o:THREE.Mesh[]=[];
    const bar=(x0:number,x1:number,y0:number,y1:number)=>lm(fx,new THREE.BoxGeometry(x1-x0,y1-y0,0.07),alu,(x0+x1)/2,(y0+y1)/2);
    for(const [a,b] of [[0,L0],[L1,W]]){
      bar(a,a+0.06,0,T0);bar(b-0.06,b,0,T0);bar(a,b,0,0.12);
      lm(fx,new THREE.BoxGeometry(b-a-0.12,T0-0.12,0.02),tint,(a+b)/2,(T0+0.12)/2);
      goldGrid(fx,a+0.06,0.12,b-0.06,T0,6,o);
      cornerOrn(fx,a+0.06,T0,1,-1,0.09,o);cornerOrn(fx,b-0.06,T0,-1,-1,0.09,o);
      solids.push({x0:mx(md.spec.at-0.06)-7,x1:mx(md.spec.at+0.06)-7,z0:mz(md.span[0]+a)-4.5,z1:mz(md.span[0]+b)-4.5,y0:0,y1:T0});}
    bar(0,W,md.h,T0+0.06);bar(0,W,T1-0.05,T1);
    for(const x of [0,L0,C,L1,W])bar(Math.max(0,x-0.03),Math.min(W,x+0.03),T0,T1);
    lm(fx,new THREE.BoxGeometry(W,T1-T0-0.1,0.02),tint,W/2,(T0+0.06+T1-0.05)/2);
    for(const [a,b] of [[0,L0],[L0,C],[C,L1],[L1,W]]){const ym=(T0+0.06+T1-0.05)/2,c=(a+b)/2;
      o.push(lm(fx,new THREE.BoxGeometry(b-a-0.06,0.01,0.03),gold,c,ym));
      [0,Math.PI/2,Math.PI/4,-Math.PI/4].forEach((r,k)=>o.push(lm(fx,new THREE.BoxGeometry(k<2?0.16:0.08,0.014,0.034),gold,c,ym,0,r)));
      if(b-a>0.8)[a+(b-a)*0.22,b-(b-a)*0.22].forEach(x=>o.push(lm(fx,new THREE.BoxGeometry(0.045,0.045,0.034),gold,x,ym,0,Math.PI/4)));}}
  const wcDoors=[doorById['d-wc1'],doorById['d-wc2']].filter(Boolean);
  clickables.push(...winLeaves);
  tvScreen.userData.tv=true;clickables.push(tvScreen);
  const inner=M(0xd7b48c),cloth=[0x3d7cc9,0xc94f4f,0xe8e2d6,0x4f8a5b,0x2f3a4a,0xd9a441].map(M);
  /** 2 m wardrobe: open-front carcass with clothes on a rail and shelves, four doors opening toward `out`. */
  function wardrobe(x0:number,z0:number,x1:number,z1:number,out:'+z'|'-z'){
    const t=0.025,WH=2.2,s=out==='+z'?1:-1,zf=s>0?z1:z0,zb=s>0?z0:z1,xm=(x0+x1)/2;
    box(x0,z0,x0+t,z1,0,WH,wood);box(x1-t,z0,x1,z1,0,WH,wood);box(xm-t/2,z0,xm+t/2,z1,0,WH,wood);
    box(x0,Math.min(zb,zb+s*t),x1,Math.max(zb,zb+s*t),0,WH,inner);
    box(x0,z0,x1,z1,WH-t,WH,wood);box(x0,z0,x1,z1,0,0.08,wood);
    solids.push({x0:x0-7,x1:x1-7,z0:z0-4.5,z1:z1-4.5,y0:0,y1:WH});
    // left half: shelf + hanging rail with clothes; right half: shelves with folded stacks
    box(x0+t,z0+0.01,xm,z1-0.01,1.84,1.86,inner,false);
    cyl((x0+xm)/2,1.74,(z0+z1)/2,0.012,0.012,xm-x0-t,steel,0,Math.PI/2);
    for(let i=0;i<7;i++){const x=x0+0.12+i*0.12;box(x-0.02,(z0+z1)/2-0.22,x+0.02,(z0+z1)/2+0.22,0.95+(i%3)*0.08,1.72,cloth[i%cloth.length],false);}
    [0.55,1.05,1.45].forEach((y,k)=>{box(xm+t/2,z0+0.01,x1-t,z1-0.01,y,y+0.02,inner,false);
      [0,1,2].forEach(j=>{const a=xm+0.08+j*0.3;box(a,(z0+z1)/2-0.15,a+0.22,(z0+z1)/2+0.15,y+0.02,y+0.12+((j+k)%2)*0.06,cloth[(j+k*2)%cloth.length],false);});});
    const w:Win={leaves:[],open:false,x:xm-7,z:zf-4.5,half:(x1-x0)/2,name:'tủ quần áo'},lw=(x1-x0)/4;
    for(let i=0;i<4;i++){const cd:Dir=i%2?'-x':'+x',hx=x0+(i%2?i+1:i)*lw;
      const gr=new THREE.Group();gr.position.set(hx-7,0,zf+s*0.012-4.5);
      const geo=new THREE.BoxGeometry(lw-0.006,2.14,0.02);const m=new THREE.Mesh(geo,wood);m.position.set(lw/2,1.1,0);gr.add(m);
      const ed=new THREE.LineSegments(new THREE.EdgesGeometry(geo),edgeMat);ed.position.copy(m.position);gr.add(ed);
      const kn=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.22,0.025),knobMat);kn.position.set(lw-0.05,1.1,(cd==='+x'?s:-s)*0.022);gr.add(kn);
      const c=angW[cd];let d=angW[out]-c;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
      gr.rotation.y=c;w.leaves.push({g:gr,c,o:c+d*0.95,t:c});m.userData.win=w;kn.userData.win=w;clickables.push(m,kn);add(gr);}
    wardrobes.push(w);}
  obj('tuAo3','Tủ quần áo','Phòng ngủ 3',false,()=>wardrobe(11.8,3.15,13.8,3.95,'-z'));
  obj('tuAo1','Tủ quần áo','Phòng ngủ 1',false,()=>wardrobe(5.15,8.0,6.4,8.8,'-z'));     // north corner by PN2
  obj('tuAo2','Tủ quần áo','Phòng ngủ 2',false,()=>wardrobe(6.5,5.05,8.5,5.85,'+z'));
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
  const roofCol=new THREE.Color(map.color('roof'));
  const roofMat=new THREE.MeshStandardMaterial({color:roofCol,roughness:0.55,side:THREE.DoubleSide});
  const roofLine=new THREE.LineBasicMaterial({color:roofCol.clone().multiplyScalar(0.55)});
  const cutPlanes=[new THREE.Plane(new THREE.Vector3(-1,0,0),mx(1.0)-7),new THREE.Plane(new THREE.Vector3(0,0,1),-(mz(0.2)-4.5))];
  const roofMatS=roofMat.clone();roofMatS.clippingPlanes=cutPlanes;roofMatS.clipIntersection=true;
  const roofLineS=roofLine.clone();roofLineS.clippingPlanes=cutPlanes;roofLineS.clipIntersection=true;
  const capMat=M(roofCol.clone().multiplyScalar(0.72).getHex()); // ridge caps a shade darker than the tiles
  function cap(a:number[],b:number[],cm:THREE.Material=capMat){const A=new THREE.Vector3(a[0],a[1]+0.05,a[2]),B=new THREE.Vector3(b[0],b[1]+0.05,b[2]);const len=A.distanceTo(B);
  const c=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,len,8),cm);c.position.copy(A).add(B).multiplyScalar(0.5);
  c.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),B.clone().sub(A).normalize());roofG.add(c);}
  /** capTo: stop the ridge cap at this plan x (where the ridge disappears under the main roof). */
  function hip(x0:number,x1:number,z0:number,z1:number,hl:boolean,hr:boolean,E:number,t:number,mat?:THREE.Material,lmat?:THREE.LineBasicMaterial,capTo=Infinity,cm:THREE.Material=capMat){const zm=(z0+z1)/2,half=(z1-z0)/2,r=E+half*t,L=hl?x0+half:x0,R=hr?x1-half:x1;
  const P=(x:number,y:number,z:number)=>[x-7,y,z-4.5];
  const tri:number[]=[];const q=(a:number[],b:number[],c:number[])=>tri.push(...a,...b,...c);
  const A=P(x0,E,z0),B=P(x1,E,z0),C=P(x1,E,z1),D=P(x0,E,z1),RL=P(L,r,zm),RR=P(R,r,zm);
  q(A,B,RR);q(A,RR,RL);q(D,RL,RR);q(D,RR,C);q(A,RL,D);q(B,C,RR);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(tri,3));g.computeVertexNormals();
  roofG.add(new THREE.Mesh(g,mat||roofMat));roofG.add(new THREE.LineSegments(new THREE.EdgesGeometry(g,20),lmat||roofLine));
  cap(RL,capTo<R?P(Math.max(L,capTo),r,zm):RR,cm);if(hl){cap(A,RL,cm);cap(D,RL,cm);}if(hr){cap(B,RR,cm);cap(C,RR,cm);}
  return {L,R,r,zm};}
  // main roof minus the flat-roof corner (clipped where x > FX and z > FZ)
  const flatPlanes=[new THREE.Plane(new THREE.Vector3(-1,0,0),FX-7),new THREE.Plane(new THREE.Vector3(0,0,-1),FZ-4.5)];
  const clipF=<T extends THREE.Material>(m:T)=>{const c=m.clone() as T;c.clippingPlanes=flatPlanes;c.clipIntersection=true;return c;};
  const main=hip(RF.X0,RF.X1,RF.Z0,RF.Z1,true,true,E1,RF.t,clipF(roofMat),clipF(roofLine),Infinity,clipF(capMat));
  // The ancestor-room roof runs into the main roof; clip it (and stop its ridge cap) where its ridge goes under
  // the main roof's east face, otherwise a steeper / higher one shows through.
  const thoPlanes=[new THREE.Plane(new THREE.Vector3(-1,0,0),thoCut-7)];
  const roofMatT=roofMat.clone();roofMatT.clippingPlanes=thoPlanes;const roofLineT=roofLine.clone();roofLineT.clippingPlanes=thoPlanes;
  const tho=hip(RT.X0,RT.X1,RT.Z0,RT.Z1,true,false,E2,RT.t,roofMatT,roofLineT,thoCut);
  const sanh=hip(RP.X0,RP.X1,RP.Z0,RP.Z1,true,false,E3,RP.t,roofMatS,roofLineS);
  const fas=M(map.color('fascia'));
  const fb=(x0:number,z0:number,x1:number,z1:number,E:number)=>box(x0,z0,x1,z1,E-0.24,E,fas,false,null,roofG);
  const sf=(x0:number,z0:number,x1:number,z1:number,E:number)=>box(x0,z0,x1,z1,E-0.26,E-0.24,fas,false,null,roofG);
  {// main roof fascia + soffits, in edited coords (follow the roof's own length / width)
    const {X0,X1,Z0,Z1}=RF,hz0=mz(0),hz1=mz(9),hx1=mx(14);noMap=true;
    fb(X0,Z0-0.06,X1,Z0,E1);fb(X0,Z1,X1,Z1+0.06,E1);fb(X1,Z0,X1+0.06,Z1,E1);fb(X0-0.06,Z0,X0,mz(-0.3),E1);fb(X0-0.06,mz(9.4),X0,Z1,E1);
    sf(X0,Z0,X1,hz0,E1);sf(X0,hz1,X1,Z1,E1);sf(hx1,Z0,X1,Z1,E1);noMap=false;}
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
    // the tank, centred over the WC block, lying along x
    const tx=(mx(10.82)+mx(13.8))/2-7,tz=(mz(6.3)+mz(8.8))/2-4.5,R=0.57,TL=1.75,cy=E1+1.365-R;
    const inox=new THREE.MeshStandardMaterial({color:0xe8ebee,roughness:0.3,metalness:0.35}); // no env map: keep it light
    const body=new THREE.Mesh(new THREE.CylinderGeometry(R,R,TL,32),inox);body.rotation.z=Math.PI/2;body.position.set(tx,cy,tz);roofG.add(body);
    for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(R,32,16,0,Math.PI*2,0,Math.PI/2),inox);e.scale.set(1,0.18,1);
      e.rotation.z=-sx*Math.PI/2;e.position.set(tx+sx*TL/2,cy,tz);roofG.add(e);
      for(const b of [-0.5,0.5]){const r=new THREE.Mesh(new THREE.TorusGeometry(R+0.005,0.012,6,40),inox);r.rotation.y=Math.PI/2;r.position.set(tx+sx*TL*0.33+b*0.05,cy,tz);roofG.add(r);}}
    const lid=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,0.08,24),inox);lid.position.set(tx,cy+R+0.02,tz);roofG.add(lid);
    const stand=M(0x8d9399);
    for(const sx of [-0.6,0,0.6]){box(tx+sx-0.04+7,tz-0.61+4.5,tx+sx+0.04+7,tz+0.61+4.5,E1,E1+0.24,stand,true,null,roofG);}
    box(tx-0.9+7,tz-0.61+4.5,tx+0.9+7,tz-0.55+4.5,E1+0.18,E1+0.24,stand,false,null,roofG);box(tx-0.9+7,tz+0.55+4.5,tx+0.9+7,tz+0.61+4.5,E1+0.18,E1+0.24,stand,false,null,roofG);
    const pipe=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,cy-R-E1+0.05,10),M(0xe9e9e9));pipe.position.set(tx+0.4,(cy-R+E1)/2,tz);roofG.add(pipe);
    noMap=false;}
  {// sub-roof fascia + soffits (porch ceiling), in edited coords like the main roof's
    const wx=mx(1.0),hz0=mz(0),hz9=mz(4.95);noMap=true;
    fb(RT.X0-0.06,RT.Z0,RT.X0,RT.Z1,E2);fb(RT.X0,RT.Z1,0.2,RT.Z1+0.06,E2);if(RP.Z1<=RT.Z0)fb(RT.X0,RT.Z0-0.06,0,RT.Z0,E2); // hidden under the porch roof where they overlap
    sf(RT.X0,RT.Z0,0,RT.Z1,E2);
    fb(RP.X0-0.06,RP.Z0,RP.X0,RP.Z1,E3);fb(RP.X0,RP.Z0-0.06,wx,RP.Z0,E3);if(RT.X0>RP.X0)fb(RP.X0,RP.Z1,RT.X0,RP.Z1+0.06,E3);fb(wx-0.06,RP.Z0,wx,hz0,E3);
    sf(RP.X0,RP.Z0,wx,Math.min(RP.Z1,hz9),E3);noMap=false;}
  const porchLamp=new THREE.MeshBasicMaterial({color:0xfff3c4}); // the big porch ceiling light (kept as it was)
  box(-0.15,2.2,0.25,2.75,E3-0.27,E3-0.26,porchLamp,false,null,roofG);
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
    const SOF=E1-0.27,spacing=Math.max(0.5,layout.lights?.spacing??LIGHT_SPACING);
    const tex=(draw:(g:CanvasRenderingContext2D)=>void)=>{const c=document.createElement('canvas');c.width=128;c.height=256;draw(c.getContext('2d')!);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;};
    const coneTex=tex(g=>{g.translate(64,0);g.scale(0.42,1);const r=g.createRadialGradient(0,0,4,0,0,256);r.addColorStop(0,'rgba(255,226,170,1)');r.addColorStop(0.35,'rgba(255,210,150,.55)');r.addColorStop(1,'rgba(255,200,140,0)');g.fillStyle=r;g.fillRect(-160,0,320,256);});
    const washTex=tex(g=>{g.translate(64,128);g.scale(0.38,1);const r=g.createRadialGradient(0,0,6,0,0,128);r.addColorStop(0,'rgba(255,226,170,1)');r.addColorStop(0.4,'rgba(255,210,150,.5)');r.addColorStop(1,'rgba(255,200,140,0)');g.fillStyle=r;g.fillRect(-180,-128,360,256);});
    const glowMat=(map:THREE.Texture,o:number)=>new THREE.MeshBasicMaterial({map,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,fog:false});
    const cone=glowMat(coneTex,0.85),wash=glowMat(washTex,0.95);
    const bulb=new THREE.MeshBasicMaterial({color:0x9a9a9a});lights.bulbs.push(bulb,porchLamp);
    const discGeo=new THREE.CylinderGeometry(0.045,0.045,0.012,16);
    /** Glow plane on a wall face: n = outward normal ('+x' etc.), centred at (x, y, z) world. */
    const glowOn=(mat:THREE.Material,w:number,h:number,x:number,y:number,z:number,n:Dir)=>{
      const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);m.position.set(x,y,z);m.rotation.y={'+z':0,'-z':Math.PI,'+x':Math.PI/2,'-x':-Math.PI/2}[n];
      m.renderOrder=5;m.visible=false;scene.add(m);lights.glows.push(m);};
    /** Downlights spread evenly along [a0, a1] (edited plan coords) at `at` across; wall: face to wash and its range. */
    const row=(axis:'x'|'z',a0:number,a1:number,at:number,wall?:{face:number;n:Dir;from:number;to:number})=>{
      if(a1-a0<0.3)return;const n=Math.max(1,Math.round((a1-a0)/spacing));
      for(let i=0;i<n;i++){const a=a0+(i+0.5)*(a1-a0)/n,[x,z]=axis==='x'?[a,at]:[at,a];
        const d=new THREE.Mesh(discGeo,bulb);d.position.set(x-7,SOF-0.006,z-4.5);scene.add(d);lights.downlights++;
        if(wall&&a>=wall.from&&a<=wall.to){const off={'+z':0.06,'-z':-0.06,'+x':0.06,'-x':-0.06}[wall.n];
          if(axis==='x')glowOn(cone,1.0,1.9,x-7,SOF-0.95,wall.face+off-4.5,wall.n);else glowOn(cone,1.0,1.9,wall.face+off-7,SOF-0.95,z-4.5,wall.n);}}};
    const hx0=mx(1.0),hx14=mx(14),hz9=mz(9);
    row('x',hx0,RF.X1,(RF.Z0+0)/2,{face:0,n:'-z',from:hx0,to:hx14});                 // main roof, facade side
    row('x',mx(4.0),RF.X1,(hz9+RF.Z1)/2,{face:hz9,n:'+z',from:0,to:hx14});           // main roof, back
    row('z',RF.Z0,RF.Z1,(hx14+RF.X1)/2,{face:hx14,n:'+x',from:0,to:hz9});             // main roof, west end
    row('x',RT.X0,mx(4.0),(hz9+RT.Z1)/2,{face:hz9,n:'+z',from:0,to:hx14});           // ancestor-room roof, back
    row('z',Math.max(RT.Z0,RP.Z1),RT.Z1,(RT.X0+0)/2,{face:0,n:'-x',from:mz(4.95),to:hz9}); // ancestor-room roof, east
    row('z',RP.Z0,RP.Z1,(RP.X0-0.8)/2);                                               // porch roof, east (over the yard)
    row('x',RP.X0,hx0,(RP.Z0+0)/2);                                                   // porch roof, side-path side
    /** Wall sconce at (x, y, z) world on a face with outward normal n: dark box, bulb, up/down wash, a real light. */
    const boxMat=M(0x1d1f22);
    const sconce=(x:number,y:number,z:number,n:Dir)=>{
      const o={'+z':[0,0.05],'-z':[0,-0.05],'+x':[0.05,0],'-x':[-0.05,0]}[n],along=n[1]==='x';
      const b=new THREE.Mesh(new THREE.BoxGeometry(along?0.09:0.12,0.22,along?0.12:0.09),boxMat);b.position.set(x+o[0],y,z+o[1]);scene.add(b);
      for(const dy of [0.112,-0.112]){const f=new THREE.Mesh(new THREE.BoxGeometry(along?0.07:0.1,0.006,along?0.1:0.07),bulb);f.position.set(x+o[0],y+dy,z+o[1]);scene.add(f);}
      glowOn(wash,0.75,2.1,x+o[0]*0.4,y,z+o[1]*0.4,n);
      const l=new THREE.PointLight(0xffd59a,0,3.2,1.6);l.position.set(x+o[0]*3,y,z+o[1]*3);scene.add(l);lights.points.push({light:l,on:1.1*Math.PI});lights.sconces++;};
    sconce(-0.8-7,1.75,mz(0.175)-4.5,'-x');sconce(-0.8-7,1.75,mz(4.775)-4.5,'-x');   // porch columns, facing the yard
    const tw=map.windows.find(w=>w.spec.id==='w-tho')!.rect;                          // both sides of the ancestor-room window
    sconce(-7,1.75,mz(tw[1])-0.4-4.5,'-x');sconce(-7,1.75,mz(tw[3])+0.4-4.5,'-x');
    const pl=new THREE.PointLight(0xfff0d0,0,6,1.4);pl.position.set(mx(0.05)-7,E3-0.6,mz(2.475)-4.5);scene.add(pl);lights.points.push({light:pl,on:2.2*Math.PI});
    // ---- gypsum ceilings (trần thạch cao) at +3.2 in every room but the porch, and the indoor lights ----
    // The ceilings are downward-facing planes: seen from inside the rooms, invisible from above (overview with the
    // roof off still looks in). Living room and bedrooms have a dropped border band (giật cấp) with a hidden LED
    // strip washing the raised centre; downlights sit in the band, a ceiling light in the centre. Other rooms get a
    // grid of downlights; the dining table a row of three pendants. One real light per room lights it at night.
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
    const down=(x:number,z:number,y:number,bm:THREE.Material,room:string)=>{disc(0.075,ringMat,x,y-0.003,z);disc(0.058,bm,x,y-0.006,z);lights.indoor++;lights.fixtures.push({x,z,kind:'down',room});};
    const DIRV:Record<Dir,[number,number]>={'+x':[1,0],'-x':[-1,0],'+z':[0,1],'-z':[0,-1]};
    const TRAYS=new Set(['Phòng khách','Phòng ngủ 1','Phòng ngủ 2','Phòng ngủ 3']);
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
        // centre ceiling light (ốp trần) and downlights along the band, about every 1.3 m
        disc(0.32,ringMat,cx,CEIL+TRAY-0.004,cz);disc(0.29,R.bulb,cx,CEIL+TRAY-0.008,cz);lights.indoor++;lights.fixtures.push({x:cx,z:cz,kind:'ceiling',room:r.room});
        const ins=BAND/2,pts:[number,number][]=[];
        const side=(p0:[number,number],p1:[number,number])=>{const L=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]),n=Math.max(1,Math.round(L/1.3));
          for(let k=0;k<=n;k++){const p:[number,number]=[p0[0]+(p1[0]-p0[0])*k/n,p0[1]+(p1[1]-p0[1])*k/n];if(!pts.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<0.3))pts.push(p);}};
        const A:[number,number]=[a0+ins,b0+ins],B:[number,number]=[a1-ins,b0+ins],C:[number,number]=[a1-ins,b1-ins],D:[number,number]=[a0+ins,b1-ins];
        side(A,B);side(B,C);side(C,D);side(D,A);pts.forEach(([x,z])=>down(x,z,CEIL,R.bulb,r.room));
      }else if(WC_SLAB[r.room]){
        // WCs: a 100 mm concrete slab at +2.4 (painted underside), the void above it (to the flat roof) is a storage
        // loft (gác để đồ) opened from the Lavabo side through a hatch above the WC door
        const sl=new THREE.Mesh(new THREE.BoxGeometry(x1-x0+0.06,0.1,z1-z0+0.06),slabMat);sl.position.set(cx-7,WC_CEIL+0.05,cz-4.5);scene.add(sl);
        down(cx,cz,WC_CEIL,R.bulb,r.room);
        const hx=mx(WC_SLAB[r.room]),fz=mz(6.2)-4.5;   // hatch on the Lavabo face of the WC wall
        const hd=new THREE.Mesh(new THREE.BoxGeometry(0.66,0.56,0.025),hatchMat);hd.position.set(hx-7,2.84,fz-0.0125);scene.add(hd);
        const hh=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.02,0.02),M(0x9aa0a6));hh.position.set(hx-7,2.66,fz-0.035);scene.add(hh);
        // a few storage boxes on the slab (seen with the roof off)
        [[0.25,0.45,0.42,0.32],[0.75,0.3,0.4,0.3],[0.3,1.2,0.5,0.35],[0.7,1.75,0.38,0.28]].forEach(([u,v,s2,h2])=>{if(u+s2/2>w-0.05)return;
          const bx=new THREE.Mesh(new THREE.BoxGeometry(s2,h2,s2*0.8),loftBox);bx.position.set(a0+u-7,WC_CEIL+0.1+h2/2,b0+v+0.3-4.5);scene.add(bx);});
      }else{
        ceil(x0,z0,x1,z1,CEIL);
        const nx=Math.max(1,Math.round((w-0.4)/1.6)),nz=Math.max(1,Math.round((d-0.4)/1.6));
        for(let i=0;i<nx;i++)for(let k=0;k<nz;k++)down(a0+w*(i+0.5)/nx,b0+d*(k+0.5)/nz,CEIL,R.bulb,r.room);
      }
      const ch=WC_SLAB[r.room]?WC_CEIL:CEIL;
      const pt=new THREE.PointLight(0xffe9c8,0,Math.max(w,d)*1.7,1.2);pt.position.set(cx-7,ch-0.35,cz-4.5);scene.add(pt);
      R.points.push({light:pt,on:(0.45+w*d*0.045)*Math.PI});
    }
    // three pendants over the dining table
    {const shade=M(0x2b2b2b),cord=M(0x222222),tz=mz(2.55);
      for(const x of [6.35,6.85,7.35]){const X=mx(x)-7,Z=tz-4.5;
        const cd=new THREE.Mesh(new THREE.CylinderGeometry(0.004,0.004,CEIL-1.8,6),cord);cd.position.set(X,(CEIL+1.8)/2,Z);scene.add(cd);
        const sh=new THREE.Mesh(new THREE.ConeGeometry(0.16,0.2,24,1,true),shade);sh.material.side=THREE.DoubleSide;sh.position.set(X,1.72,Z);scene.add(sh);
        const b=new THREE.Mesh(new THREE.SphereGeometry(0.045,12,10),lights.rooms['Bếp + ăn'].bulb);b.position.set(X,1.64,Z);scene.add(b);lights.indoor++;lights.fixtures.push({x:mx(x),z:tz,kind:'pendant',room:'Bếp + ăn'});}}
  }
  // ---- structure (Kết cấu button): a preliminary frame derived from the current walls — pad footings under a
  // column at every wall corner / junction (plus extra ones on long walls, kept out of door and window openings),
  // ground beams (dầm móng) under every wall and a tie beam (dầm giằng) at the eaves. Hidden unless switched on.
  // Built in EDITED coords so it follows room stretches; not part of collisions or clicks.
  const structG=new THREE.Group();structG.visible=false;scene.add(structG);
  const SM={foot:M(0x8f8b84),gb:M(0xb86a2c),col:M(0xc23b2e),tie:M(0xd99a1e)};
  const sEdge=new THREE.LineBasicMaterial({color:0x2a2a2a,transparent:true,opacity:0.6});
  const sbox=(x0:number,z0:number,x1:number,z1:number,y0:number,y1:number,mat:THREE.Material)=>{
    const g=new THREE.BoxGeometry(Math.abs(x1-x0),y1-y0,Math.abs(z1-z0)),m=new THREE.Mesh(g,mat);
    m.position.set((x0+x1)/2-7,(y0+y1)/2,(z0+z1)/2-4.5);structG.add(m);
    const e=new THREE.LineSegments(new THREE.EdgesGeometry(g),sEdge);e.position.copy(m.position);structG.add(e);};
  const structure={group:structG,columns:0,footings:0,groundBeam:0,tieBeam:0};
  {
    const C=0.22,MAXSPAN=5.0,FOOT=1.0;
    const Y={foot0:-1.6,foot1:-1.3,gb0:-0.7,gb1:-0.3,tie0:E1-0.3,tie1:E1};
    // wall centre lines in default plan coords: axis 'x' = runs along x at z = at
    type Line={axis:'x'|'z';at:number;a0:number;a1:number};
    const lines:Line[]=WALLS.map(w=>(w[2]-w[0])>=(w[3]-w[1])?{axis:'x',at:(w[1]+w[3])/2,a0:w[0],a1:w[2]}:{axis:'z',at:(w[0]+w[2])/2,a0:w[1],a1:w[3]});
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
    const facade:Line={axis:'x',at:0.1,a0:1.0,a1:14},spine:Line={axis:'x',at:5.0,a0:0,a1:11.45};
    for(const p of [[1.1,0.1],[13.9,0.1],[13.9,4],[0.1,5],[1.1,5],[0.1,8.9],[2.6,8.9],[6.45,8.9],[10.77,8.9],[13.9,8.9],[10.77,6.25],[13.9,6.25]])addPt(p[0],p[1]);
    const cross:Line[]=[];
    const mid=nudge(1.1+(10-1.1)/2,[facade,spine],2.5,8.5);
    if(mid!==null){addPt(mid,0.1);addPt(mid,5.0);cross.push({axis:'z',at:mid,a0:0.1,a1:5.0});}
    addPt(10,0.1);
    const x10=nudge(10,[spine],9.5,10.6);if(x10!==null){addPt(x10,5.0);cross.push({axis:'z',at:x10,a0:4.0,a1:5.0});}
    // a column on the open beams and outside walls wherever a span grows past MAXSPAN (room stretched)
    for(const l of [...lines,...cross]){
      const on=pts.filter(p=>Math.abs((l.axis==='x'?p[1]:p[0])-l.at)<0.05).map(p=>l.axis==='x'?p[0]:p[1]).sort((p,q)=>p-q);
      for(let i=0;i+1<on.length;i++){
        const s0=on[i],s1=on[i+1],n=Math.ceil((mapA(l,s1)-mapA(l,s0))/MAXSPAN);
        for(let k=1;k<n;k++){const c=nudge(s0+(s1-s0)*k/n,[l],s0+0.8,s1-0.8);if(c!==null)l.axis==='x'?addPt(c,l.at):addPt(l.at,c);}}
    }
    lines.push(...cross);
    // porch columns stand on their own footings, tied back to the house by ground beams
    const porch:[number,number][]=[[-0.625,0.175],[-0.625,4.775]];
    // footings + columns (mapped centres; sizes stay real)
    // The middle wall (and any 110 wall running along x) is built flush with the FRONT face of its columns, so the
    // living room / kitchen / corridor side is flat: the column (and the beams on that line) shift towards the
    // bedrooms and stick out ~110 mm there only, shown as a pilaster (trụ áp tường) in the wall colour.
    const thinX=(x:number,z:number)=>WALLS.find(w=>(w[3]-w[1])<0.15&&(w[2]-w[0])>(w[3]-w[1])&&Math.abs((w[1]+w[3])/2-z)<0.02&&x>=w[0]-0.01&&x<=w[2]+0.01);
    const colZ=(x:number,z:number)=>{const w=thinX(x,z);return w?mz(w[1])+C/2:mz(z);};
    for(const [x,z] of pts){const X=mx(x),Z=colZ(x,z);
      sbox(X-FOOT/2,Z-FOOT/2,X+FOOT/2,Z+FOOT/2,Y.foot0,Y.foot1,SM.foot);
      sbox(X-C/2,Z-C/2,X+C/2,Z+C/2,Y.foot1,Y.tie1,SM.col);structure.columns++;structure.footings++;}
    noMap=true;
    for(const [x,z] of pts){
      if(!WALLS.some(w=>Math.min(w[2]-w[0],w[3]-w[1])<0.15&&x>=w[0]-0.01&&x<=w[2]+0.01&&z>=w[1]-0.01&&z<=w[3]+0.01))continue;
      const X=mx(x),Z=colZ(x,z),f=thinX(x,z)?0.003:0;box(X-C/2,Z-C/2+f,X+C/2,Z+C/2,0,Y.tie1,wallMat,true);} // flush face: 3 mm behind, no z-fight
    noMap=false;
    for(const [x,z] of porch){const X=mx(x),Z=mz(z);
      sbox(X-FOOT/2,Z-FOOT/2,X+FOOT/2,Z+FOOT/2,Y.foot0,Y.foot1,SM.foot);
      sbox(X-C/2,Z-C/2,X+C/2,Z+C/2,Y.foot1,PC,SM.col);structure.columns++;structure.footings++;}
    // beams along every wall line; the eave tie beam on every wall
    const beam=(l:Line,y0:number,y1:number,mat:THREE.Material)=>{
      const p=mapA(l,l.a0),q=mapA(l,l.a1),c=l.axis==='x'?colZ((l.a0+l.a1)/2,l.at):mx(l.at);
      if(l.axis==='x')sbox(p,c-C/2,q,c+C/2,y0,y1,mat);else sbox(c-C/2,p,c+C/2,q,y0,y1,mat);return q-p;};
    for(const l of lines){structure.groundBeam+=beam(l,Y.gb0,Y.gb1,SM.gb);structure.tieBeam+=beam(l,Y.tie0,Y.tie1,SM.tie);}
    for(const l of [{axis:'z',at:-0.625,a0:0.175,a1:4.775},{axis:'x',at:0.175,a0:-0.625,a1:1.1},{axis:'x',at:4.775,a0:-0.625,a1:1.1}] as Line[])
      {structure.groundBeam+=beam(l,Y.gb0,Y.gb1,SM.gb);structure.tieBeam+=beam(l,PC,PC+0.3,SM.tie);}
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
      if(e.kind==='switch2'){
        const parts=[B(0.086,0.086,0.012,plate),B(0.034,0.06,0.008,rocker,-0.019,0,0.012),B(0.034,0.06,0.008,rocker,0.019,0,0.012)];
        parts.forEach(m=>{m.userData.lamp=e.room;clickables.push(m);});
        switches.push({room:e.room,x:mx(e.x)-7,z:mz(e.z)-4.5});
      }else if(e.kind==='heaterSw'){B(0.086,0.086,0.012,plate);B(0.05,0.06,0.008,rocker,0,0,0.012);B(0.008,0.008,0.004,red,0,0.036,0.012);}
      else if(e.kind==='socket'){B(0.086,0.086,0.012,plate);for(const dx of [-0.011,0.011])C(0.0045,0.004,hole,dx,0.006,0.013,'z');C(0.004,0.004,hole,0,-0.016,0.013,'z');}
      else if(e.kind==='data'){B(0.086,0.086,0.012,plate);B(0.016,0.012,0.003,hole,-0.016,0,0.012);C(0.007,0.004,hole,0.018,0,0.013,'z');}
      else if(e.kind==='ac'){B(0.85,0.28,0.2,acMat);B(0.76,0.025,0.006,grey,0,-0.105,0.2);B(0.04,0.012,0.004,green,0.33,0.05,0.2);}
      else if(e.kind==='acOut'){ // outdoor unit on two wall brackets, fan grille facing out, insulated pipe into the wall
        B(0.8,0.55,0.29,acMat,0,0,0.1);C(0.17,0.01,grey,-0.1,0,0.395,'z');C(0.05,0.012,M(0x5a5e63),-0.1,0,0.397,'z');
        for(const dx of [-0.3,0.3]){B(0.04,0.04,0.42,grey,dx,-0.295,0);B(0.04,0.3,0.04,grey,dx,-0.43,0);}
        const pipe=M(0xe8e6df);B(0.05,0.05,0.1,pipe,0.33,0.1,0);B(0.05,0.18,0.05,pipe,0.33,0.2,0.05);}
      else if(e.kind==='tv'){B(0.97,0.57,0.03,black);B(0.94,0.53,0.004,screen,0,0,0.03);}
      else if(e.kind==='heater'){C(0.19,0.78,acMat,0,0,0.22,'x');B(0.5,0.05,0.04,grey,0,0,0);
        for(const dx of [-0.12,0.12]){const pp=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.45,8),grey);pp.position.set(dx,-0.4,0.18);g.add(pp);}}
      else if(e.kind==='camera'){B(0.09,0.09,0.03,acMat);const head=new THREE.Group();head.position.set(0,-0.03,0.09);head.rotation.y=-Math.PI/4;g.add(head);
        const body=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,0.14),acMat);body.position.set(0,0,0.04);head.add(body);
        const lens=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.01,16),black);lens.rotation.x=Math.PI/2;lens.position.set(0,0,0.115);head.add(lens);
        const arm=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.02,0.08),grey);arm.position.set(0,0.0,-0.02);head.add(arm);}
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
  return { solids, floors, tiles, occluders, doors, wcDoors, windows, wardrobes, beds, seats, labels, clickables, roof: roofG, rack: { group: rackG, armL, armR }, rackPos: [rc.x, rc.z], root, objects, mirrorZ, lights, tvScreen, structure, walls: WALLS, switches };
}
