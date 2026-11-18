// Geometry of the 9 x 14 m house, ported from ../mo_hinh_3d_nha_ve_sinh_sen_lavabo.html.
// All helpers take PLAN coordinates in meters (house spans x 0..14, z 0..9);
// they subtract (7, 4.5) so the house is centered on the world origin.
import * as THREE from 'three';

export type Dir = '+x' | '-x' | '+z' | '-z';
/** Axis-aligned box in WORLD coordinates. */
export interface Rect { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }
/** Something that swings on a vertical hinge: g.rotation.y eases from c (closed) to o (open); t is the target. */
export interface Leaf { g: THREE.Group; c: number; o: number; t: number }
export interface Door extends Leaf { open: boolean; len: number }
/** A casement window: two sashes hinged on the jambs, opening outward. */
export interface Win { leaves: Leaf[]; open: boolean; x: number; z: number }
/** Bed in WORLD coords; the headboard is on the z0 side ('N') or z1 side ('S'). */
export interface Bed { x0: number; z0: number; x1: number; z1: number; head: 'N' | 'S'; top: number }
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
  wcDoors: [Door, Door];
  windows: Win[];
  beds: Bed[];
  /** Room name sprites, shown in the overview when the roof is hidden. */
  labels: THREE.Sprite[];
  clickables: THREE.Object3D[];
  roof: THREE.Group;
  rack: { group: THREE.Group; armL: THREE.Mesh; armR: THREE.Mesh };
}

export const toWorld = (x: number, z: number): [number, number] => [x - 7, z - 4.5];

export function buildHouse(scene: THREE.Scene): House {
  const solids: Rect[] = [], floors: Rect[] = [], tiles: House['tiles'] = [], occluders: THREE.Mesh[] = [];
  const H = 3.6;
  function box(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial,
    edges = true, em?: THREE.LineBasicMaterial | null, parent?: THREE.Object3D): THREE.Mesh {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0));
    const m = new THREE.Mesh(g, mat);
    m.position.set((x0 + x1) / 2 - 7, (y0 + y1) / 2, (z0 + z1) / 2 - 4.5);
    (parent || scene).add(m);
    if (edges) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), em || edgeMat); e.position.copy(m.position); (parent || scene).add(e); }
    if (!parent) {
      const r: Rect = { x0: Math.min(x0, x1) - 7, x1: Math.max(x0, x1) - 7, z0: Math.min(z0, z1) - 4.5, z1: Math.max(z0, z1) - 4.5, y0, y1 };
      if (y1 <= 0.05 && y1 >= -0.35) { floors.push(r); if (y0 >= 0 && y1 <= 0.03) tiles.push({ ...r, color: '#' + mat.color.getHexString() }); }
      else if (y0 < 1.3 && y1 > 0.25) solids.push(r);
      // walls, wardrobes and the wall above door openings block the 3rd-person camera
      if (!mat.transparent && y1 - y0 > 1.2 && y1 > 2) occluders.push(m);
    }
    return m;
  }
  scene.add(new THREE.HemisphereLight(0xffffff,0x8a8070,0.8*Math.PI));
  const sun=new THREE.DirectionalLight(0xffffff,0.7*Math.PI);sun.position.set(-14,20,-10);scene.add(sun);
  [[-3.5,3.0,-2.2],[1.6,3.0,-2.6],[5.4,3.0,2.5],[5.0,3.0,1.0]].forEach(p=>{const l=new THREE.PointLight(0xfff1dc,0.5*Math.PI,7,1);l.position.set(p[0],p[1],p[2]);scene.add(l);});
  const M=(c:number)=>new THREE.MeshStandardMaterial({color:c,roughness:0.85});
  const edgeMat=new THREE.LineBasicMaterial({color:0x444444,transparent:true,opacity:0.35});
  const frameMat=new THREE.LineBasicMaterial({color:0xffffff});
  
  function cyl(x:number,y:number,z:number,r1:number,r2:number,h:number,mat:THREE.Material,rx?:number,rz?:number){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,20),mat);m.position.set(x-7,y,z-4.5);if(rx)m.rotation.x=rx;if(rz)m.rotation.z=rz;scene.add(m);return m;}
  box(-8,-6,20,15,-0.32,-0.3,M(0xb7cc9c),false);
  box(0,0,14,9,-0.3,0,M(0xcfc9be));
  const stoneMat=M(0x3a3d42);
  box(-0.8,0,0,4.95,-0.3,0,M(0xe2ddd4));
  box(-1.25,1.0,-0.8,4.0,-0.3,-0.15,stoneMat);
  box(-1.05,1.0,-0.8,4.0,-0.15,0,M(0xe8e4dc));
  [[0,0,1.0,4.95,0xe7c3ae],[1.2,0.2,5.95,4.95,0xeeeae4],[5.95,0.2,9.95,4.95,0xe6dfd1],[10.05,4.05,13.8,4.95,0xe6dfd1],[10.05,0.2,13.8,3.95,0xc9a982],[0.2,5.05,2.55,8.8,0xd8c3a5],[2.65,5.05,6.4,8.8,0xc9a982],[6.5,5.05,10.85,8.8,0xc9a982],[10.95,5.05,13.8,6.2,0xdfe3e6],[10.95,6.3,12.325,8.8,0xd6dadd],[12.425,6.3,13.8,8.8,0xd6dadd]].forEach(f=>box(f[0],f[1],f[2],f[3],0,0.012,M(f[4]),false));
  box(2.2,1.3,5.0,3.0,0.012,0.02,M(0xd9d2c4),false);
  const showerTile=M(0x6c747c);
  box(10.95,6.3,12.325,7.92,0.012,0.02,showerTile,false);box(12.425,6.3,13.8,7.92,0.012,0.02,showerTile,false);
  // Window openings [x0,z0,x1,z1,y0,y1] (plan). The original drew glass over solid walls;
  // here walls are cut around them so the sashes can swing open.
  const WIN=[[2.8,-0.02,4.4,0.22,0.9,2.2],[7.97,-0.02,9.17,0.22,0.9,1.7],[10.1,-0.02,11.1,0.22,0.9,2.2],[-0.02,6.12,0.22,7.72,0.9,2.2],[5.37,8.78,6.37,9.02,0.9,2.2],[9.53,8.78,10.73,9.02,0.9,2.2],[11.33,8.78,11.93,9.02,1.6,2.2],[12.81,8.78,13.41,9.02,1.6,2.2]];
  /** A wall box split into pieces around any window opening that passes through it. */
  function wallWithHoles(w:number[],y0:number,y1:number,mat:THREE.MeshStandardMaterial,edges:boolean){
    const alongX=(w[2]-w[0])>=(w[3]-w[1]);const a0=alongX?w[0]:w[1],a1=alongX?w[2]:w[3];
    const holes=WIN.filter(g=>g[0]<w[2]&&g[2]>w[0]&&g[1]<w[3]&&g[3]>w[1]&&g[4]<y1&&g[5]>y0)
      .map(g=>alongX?[g[0],g[2],g[4],g[5]]:[g[1],g[3],g[4],g[5]]).sort((p,q)=>p[0]-q[0]);
    const seg=(s0:number,s1:number,h0:number,h1:number)=>{if(s1-s0<1e-3||h1-h0<1e-3)return;
      if(alongX)box(s0,w[1],s1,w[3],h0,h1,mat,edges);else box(w[0],s0,w[2],s1,h0,h1,mat,edges);};
    let cur=a0;
    for(const [h0,h1,hy0,hy1] of holes){const s0=Math.max(a0,h0),s1=Math.min(a1,h1);
      seg(cur,s0,y0,y1);seg(s0,s1,y0,Math.max(y0,hy0));seg(s0,s1,Math.min(y1,hy1),y1);cur=s1;}
    seg(cur,a1,y0,y1);}
  const wallMat=M(0xf4f1ea);
  [[1.0,0,6.0,0.2],[6.9,0,14,0.2],[1.0,0.2,1.2,0.975],[1.0,4.175,1.2,4.95],[0,4.95,1.42,5.05],[2.22,4.95,5.37,5.05],[6.17,4.95,9.05,5.05],[9.85,4.95,11.45,5.05],[13.2,4.95,14,5.05],[0,5.05,0.2,9],[0.2,8.8,13.8,9],[13.8,0,14,4.1],[13.8,4.9,14,9],[9.95,0.2,10.05,3.95],[9.95,3.95,10.15,4.05],[10.95,3.95,13.8,4.05],[2.55,5.05,2.65,8.8],[6.4,5.05,6.5,8.8],[10.85,5.05,10.95,8.8],[10.95,6.2,11.54,6.3],[12.24,6.2,12.87,6.3],[13.57,6.2,13.8,6.3],[12.325,6.3,12.425,8.8]].forEach(w=>wallWithHoles(w,0,H,wallMat,true));
  [[1.0,0.975,1.2,4.175],[6.0,0,6.9,0.2],[13.8,4.1,14,4.9],[1.42,4.95,2.22,5.05],[5.37,4.95,6.17,5.05],[9.05,4.95,9.85,5.05],[10.15,3.95,10.95,4.05],[11.54,6.2,12.24,6.3],[12.87,6.2,13.57,6.3]].forEach(l=>box(l[0],l[1],l[2],l[3],2.1,H,wallMat));
  const wcTile=M(0xe9ecee);
  [[10.95,6.3,10.97,8.8],[12.305,6.3,12.325,8.8],[12.425,6.3,12.445,8.8],[13.78,6.3,13.8,8.8],[10.97,6.3,11.54,6.32],[12.24,6.3,12.305,6.32],[12.445,6.3,12.87,6.32],[13.57,6.3,13.78,6.32],[10.97,8.78,12.305,8.8],[12.445,8.78,13.78,8.8]].forEach(w=>wallWithHoles(w,0,2.4,wcTile,false));
  const band=M(0x4a6478);
  const E1=3.5,E2=3.15,E3=2.7;
  box(1.0,-0.04,14,0,E1-0.3,H,band,false);box(14,0,14.04,9,E1-0.3,H,band,false);box(0,9,14,9.04,E1-0.3,H,band,false);
  box(-0.04,4.95,0,9,E2-0.3,H,band,false);
  box(0,-0.03,14,0,-0.3,0,stoneMat,false);box(14,0,14.03,9,-0.3,0,stoneMat,false);box(-0.03,4.95,0,9,-0.3,0,stoneMat,false);
  box(-0.04,5.9,0,7.94,2.3,2.6,band,false);box(-0.04,5.9,0,7.94,0.35,0.85,band,false);
  const darkWood=new THREE.MeshStandardMaterial({color:0x4a2c1e,roughness:0.5});
  box(1.2,0.2,5.95,0.28,0,0.1,darkWood,false);box(1.2,4.87,5.95,4.95,0,0.1,darkWood,false);
  const colMat=M(0xffffff);
  box(-0.8,0,-0.45,0.35,0,2.45,colMat);box(-0.8,4.6,-0.45,4.95,0,2.45,colMat);
  box(-0.86,-0.06,-0.39,0.41,0,0.5,stoneMat);box(-0.86,4.54,-0.39,5.01,0,0.5,stoneMat);
  box(-0.86,-0.06,-0.39,0.41,2.15,2.25,colMat);box(-0.86,4.54,-0.39,5.01,2.15,2.25,colMat);
  box(-0.81,0.1,-0.79,0.25,0.7,1.95,band,false);box(-0.81,4.7,-0.79,4.85,0.7,1.95,band,false);
  box(-0.8,0,-0.45,4.95,2.45,E3,colMat);box(-0.8,0,1.0,0.35,2.45,E3,colMat);box(-0.8,4.6,0,4.95,2.45,E3,colMat);
  const glass=new THREE.MeshStandardMaterial({color:0x2f7fd0,transparent:true,opacity:0.7,roughness:0.15,metalness:0.1});
  const winFrame=M(0x2b2b2b);
  const windows:Win[]=[],winLeaves:THREE.Mesh[]=[];
  const angW:Record<Dir,number>={'+x':0,'-x':Math.PI,'+z':-Math.PI/2,'-z':Math.PI/2};
  WIN.forEach(g=>{
    const alongX=(g[2]-g[0])>(g[3]-g[1]),cx=(g[0]+g[2])/2,cz=(g[1]+g[3])/2,fw=0.04;
    const out:Dir=alongX?(cz<4.5?'-z':'+z'):(cx<7?'-x':'+x');
    // wall faces (the opening box is 2 cm proud on each side of the wall)
    const w0=(alongX?g[1]:g[0])+0.02,w1=(alongX?g[3]:g[2])-0.02,face=out[0]==='-'?w0+0.03:w1-0.03;
    const fr=(a0:number,a1:number,y0:number,y1:number)=>alongX?box(a0,w0,a1,w1,y0,y1,winFrame,false):box(w0,a0,w1,a1,y0,y1,winFrame,false);
    const A0=alongX?g[0]:g[1],A1=alongX?g[2]:g[3];
    fr(A0,A0+fw,g[4],g[5]);fr(A1-fw,A1,g[4],g[5]);fr(A0,A1,g[5]-fw,g[5]);
    box(g[0]-0.05,g[1]-0.03,g[2]+0.05,g[3]+0.03,g[4]-0.05,g[4],colMat,false);
    const len=(A1-A0-2*fw)/2,h=g[5]-g[4]-fw;
    const win:Win={leaves:[],open:false,x:cx-7,z:cz-4.5};
    ([[A0+fw,alongX?'+x':'+z'],[A1-fw,alongX?'-x':'-z']] as [number,Dir][]).forEach(([a,cd])=>{
      const gr=new THREE.Group();if(alongX)gr.position.set(a-7,0,face-4.5);else gr.position.set(face-7,0,a-4.5);
      const geo=new THREE.BoxGeometry(len-0.01,h,0.03);const m=new THREE.Mesh(geo,glass);m.position.set(len/2,g[4]+h/2,0);gr.add(m);
      const ed=new THREE.LineSegments(new THREE.EdgesGeometry(geo),frameMat);ed.position.copy(m.position);gr.add(ed);
      const c=angW[cd];let d=angW[out]-c;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
      gr.rotation.y=c;win.leaves.push({g:gr,c,o:c+d*0.85,t:c});m.userData.win=win;winLeaves.push(m);scene.add(gr);});
    windows.push(win);});
  const mainWood=M(0x7a3a22),inWood=M(0x5a3322),wcDoor=M(0xdcdcdc);
  const sideGlass=new THREE.MeshStandardMaterial({color:0x9fd0f0,transparent:true,opacity:0.75,roughness:0.1});
  [[0.975,1.675],[3.475,4.175]].forEach(s=>{box(1.06,s[0],1.14,s[1],0,2.1,mainWood);
  box(1.04,s[0]+0.1,1.16,s[1]-0.1,0.35,1.15,sideGlass,true,frameMat);box(1.04,s[0]+0.1,1.16,s[1]-0.1,1.25,2.0,sideGlass,true,frameMat);});
  box(1.04,0.975,1.16,4.175,2.1,2.18,mainWood,false);
  const stepMat=M(0xbdb6aa);
  box(5.9,-0.42,7.0,0,-0.3,-0.15,stepMat);box(14,3.95,14.42,5.05,-0.3,-0.15,stepMat);
  const vz0=1.05,vz1=3.55,vh=2.8,bay=(vz1-vz0-0.2)/8;
  box(5.9,vz0,6.1,vz0+0.1,0,vh,darkWood);box(5.9,vz1-0.1,6.1,vz1,0,vh,darkWood);box(5.9,vz0,6.1,vz1,vh-0.12,vh,darkWood);
  box(5.92,vz0,6.1,vz1,0,0.65,darkWood);
  const deco=M(0xf2efe9),decoDark=M(0x2a2a2a),decoGlass=new THREE.MeshStandardMaterial({color:0xdfe8ee,transparent:true,opacity:0.6,roughness:0.1});
  for(let i=1;i<8;i++){const z=vz0+0.1+i*bay;box(5.92,z-0.04,6.08,z+0.04,0.65,vh-0.12,darkWood);}
  for(let j=0;j<8;j++){const a=vz0+0.1+j*bay,b=a+bay;const hs=j%2?[1.1,1.65,2.2]:[1.35,1.9,2.45];
  hs.forEach((h,k)=>{box(5.93,a,6.07,b,h,h+0.025,darkWood,false);
  const zc=(a+b)/2-4.5;if((j+k)%2===0){const o=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.045,0.2,12),k===1?decoGlass:deco);o.position.set(6.0-7,h+0.125,zc);scene.add(o);}
  else if((j+k)%3===0){const o=new THREE.Mesh(new THREE.SphereGeometry(0.06,12,10),decoDark);o.position.set(6.0-7,h+0.085,zc);scene.add(o);}});}
  box(5.45,0.95,5.92,3.65,0.25,0.62,darkWood);box(5.55,1.05,5.9,3.55,0,0.25,M(0x2a1a12),false);
  box(5.44,0.95,5.46,3.65,0.42,0.44,M(0x2a1a12),false);
  box(5.85,1.55,5.9,3.05,0.85,1.7,M(0x111111));box(5.845,1.58,5.85,3.02,0.88,1.67,M(0x1f3550),false);
  const wood=M(0x6b4430),fabric=M(0x2e2e30),cushion=M(0xd8d2c8),white=M(0xfafafa),blanket=M(0x9fb3c8),counter=M(0xd9bb8c),steel=new THREE.MeshStandardMaterial({color:0xc9ced3,roughness:0.3,metalness:0.6}),chrome=new THREE.MeshStandardMaterial({color:0xe6e9ec,roughness:0.15,metalness:0.9}),altar=M(0x8b2e2e),blue=M(0x6aa7d8),chairF=M(0x8e99a6),ceramic=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.25});
  box(2.47,0.2,4.47,1.0,0,0.42,fabric);box(2.47,0.2,4.47,0.4,0.42,0.85,fabric);
  box(2.7,0.42,3.0,0.72,0.42,0.72,cushion);box(3.4,0.42,3.7,0.72,0.42,0.72,cushion);
  box(3.08,1.58,4.28,2.28,0,0.42,darkWood);
  box(2.58,3.29,3.33,4.04,0,0.42,fabric);box(2.58,3.84,3.33,4.04,0.42,0.85,fabric);
  box(4.04,3.29,4.79,4.04,0,0.42,fabric);box(4.04,3.84,4.79,4.04,0.42,0.85,fabric);
  box(3.43,3.42,3.93,3.92,0,0.55,darkWood);
  box(6.05,2.1,7.65,3.0,0.72,0.77,wood);box(6.15,2.2,7.55,2.9,0,0.72,wood);
  [6.16,6.64,7.13].forEach(x=>{box(x,1.6,x+0.42,2.02,0,0.45,chairF);box(x,1.6,x+0.42,1.66,0.45,0.9,chairF);box(x,3.08,x+0.42,3.5,0,0.45,chairF);box(x,3.44,x+0.42,3.5,0.45,0.9,chairF);});
  box(7.89,0.2,9.95,0.8,0,0.85,counter);box(9.35,0.8,9.95,2.76,0,0.85,counter);
  box(7.89,0.2,9.95,0.8,0.85,0.88,M(0x2f2f33));box(9.35,0.8,9.95,2.76,0.85,0.88,M(0x2f2f33));
  box(8.0,0.26,8.8,0.72,0.88,0.9,M(0x0d0d0d));
  const ring=new THREE.MeshBasicMaterial({color:0x8a2a1a});
  [[8.2,0.49],[8.6,0.49]].forEach(p=>{const c=new THREE.Mesh(new THREE.RingGeometry(0.08,0.1,24),ring);c.rotation.x=-Math.PI/2;c.position.set(p[0]-7,0.905,p[1]-4.5);scene.add(c);});
  box(9.42,1.15,9.88,1.6,0.86,0.885,steel,false);box(9.42,1.65,9.88,2.1,0.86,0.885,steel,false);
  box(9.47,1.2,9.83,1.55,0.7,0.86,M(0x8d9298),false);box(9.47,1.7,9.83,2.05,0.7,0.86,M(0x8d9298),false);
  cyl(9.86,1.04,1.625,0.015,0.02,0.32,steel);box(9.72,1.6,9.88,1.65,1.17,1.2,steel,false);
  box(7.95,0.2,8.85,0.72,1.7,1.8,steel);box(8.05,0.2,8.75,0.6,1.8,1.95,steel);box(8.25,0.2,8.55,0.45,1.95,3.3,steel);
  box(8.1,0.6,8.7,0.63,1.72,1.74,new THREE.MeshBasicMaterial({color:0xfff6dd}),false);
  const cabMat=M(0xf3f0ea);
  box(9.6,1.05,9.95,1.08,1.5,2.25,cabMat);box(9.6,2.17,9.95,2.2,1.5,2.25,cabMat);
  box(9.6,1.05,9.95,2.2,2.22,2.25,cabMat);box(9.6,1.05,9.95,2.2,1.5,1.52,cabMat);box(9.93,1.08,9.95,2.17,1.52,2.22,cabMat);
  box(9.55,2.2,9.95,2.76,1.5,2.25,cabMat);box(9.545,2.25,9.55,2.71,1.55,2.2,M(0xe6e2da),false);
  const rackG=new THREE.Group();scene.add(rackG);
  const rackMat=new THREE.MeshStandardMaterial({color:0xdfe3e7,roughness:0.25,metalness:0.7});
  const wireMat=new THREE.LineBasicMaterial({color:0x9aa1a8});
  const rackParts:THREE.Object3D[]=[];
  function rb(x0:number,z0:number,x1:number,z1:number,y0:number,y1:number,mat:THREE.MeshStandardMaterial){const m=box(x0,z0,x1,z1,y0,y1,mat,false,null,rackG);rackParts.push(m);return m;}
  const fl=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.3,0.58,1.0)),wireMat);fl.position.set(9.775-7,1.86,1.625-4.5);rackG.add(fl);
  rb(9.63,1.13,9.92,2.12,1.57,1.59,rackMat);rb(9.63,1.13,9.92,2.12,1.88,1.9,rackMat);
  rb(9.62,1.12,9.64,2.13,1.57,2.15,rackMat);rb(9.62,1.12,9.92,1.14,1.57,2.15,rackMat);rb(9.62,2.11,9.92,2.13,1.57,2.15,rackMat);
  rb(9.6,1.1,9.63,2.15,2.1,2.14,cabMat);
  for(let i=0;i<9;i++){const p=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.012,24),M(0xffffff));p.rotation.x=Math.PI/2;p.position.set(9.78-7,1.73,1.25+i*0.085-4.5);rackG.add(p);rackParts.push(p);}
  for(let i=0;i<5;i++){const b=new THREE.Mesh(new THREE.SphereGeometry(0.07,16,10,0,Math.PI*2,0,Math.PI/2),M(0xe9edf2));b.position.set(9.78-7,1.92,1.3+i*0.17-4.5);rackG.add(b);rackParts.push(b);}
  const armL=box(9.7,1.09,9.75,1.11,1.6,2.0,rackMat,false),armR=box(9.7,2.14,9.75,2.16,1.6,2.0,rackMat,false);
  box(9.25,2.76,9.95,3.46,0,1.8,steel);box(7.32,0.2,7.82,0.7,0,1.1,blue);
  box(10.95,5.12,11.45,6.08,0.18,0.82,M(0x6b4430));box(10.95,5.12,10.96,6.08,0,0.18,M(0x3a2a20),false);
  box(10.95,5.1,11.5,6.1,0.82,0.86,M(0xf1efea));
  [5.36,5.84].forEach(z=>{cyl(11.24,0.92,z,0.17,0.13,0.12,ceramic);cyl(11.24,0.975,z,0.15,0.15,0.005,M(0xdfe6ea));
  cyl(11.02,1.02,z,0.014,0.018,0.32,chrome);box(11.02,z-0.012,11.16,z+0.012,1.16,1.18,chrome,false);});
  const mirror=new THREE.MeshStandardMaterial({color:0xcfdbe3,roughness:0.05,metalness:0.85});
  box(10.95,5.15,10.975,6.05,1.15,1.85,mirror);box(10.95,5.2,11.0,6.0,1.87,1.9,new THREE.MeshBasicMaterial({color:0xfff3d6}),false);
  function shower(xw:number,z:number){cyl(xw+0.05,1.5,z,0.016,0.016,1.2,chrome);
  box(xw+0.05,z-0.012,xw+0.33,z+0.012,2.09,2.11,chrome,false);cyl(xw+0.33,2.07,z,0.13,0.13,0.02,chrome);
  box(xw,z-0.09,xw+0.07,z+0.09,0.95,1.1,chrome,false);
  cyl(xw+0.08,1.25,z+0.09,0.025,0.018,0.22,chrome);
  box(xw+0.4,z-0.06,xw+0.52,z+0.06,0.021,0.025,M(0x9aa1a8),false);}
  shower(10.97,7.3);shower(12.445,7.3);
  box(10.97,6.6,11.12,7.0,1.0,1.02,chrome,false);box(12.445,6.6,12.595,7.0,1.0,1.02,chrome,false);
  const beds:Bed[]=[];
  function bed(x0:number,z0:number,x1:number,z1:number,head:'N'|'S'){beds.push({x0:x0-7,z0:z0-4.5,x1:x1-7,z1:z1-4.5,head,top:0.55});box(x0,z0,x1,z1,0,0.45,white);box(x0+0.02,z0+0.02,x1-0.02,z1-0.02,0.45,0.55,blanket);
  if(head==='N')box(x0,z0,x1,z0+0.1,0,1.0,wood);if(head==='S')box(x0,z1-0.1,x1,z1,0,1.0,wood);}
  bed(11.55,0.2,13.35,2.2,'N');box(11.1,0.2,11.55,0.65,0,0.5,wood);box(13.35,0.2,13.8,0.65,0,0.5,wood);
  box(10.05,0.2,11.05,0.7,0,0.75,wood);box(11.8,3.15,13.8,3.95,0,2.2,wood);
  bed(3.1,6.8,4.9,8.8,'S');box(2.65,8.35,3.1,8.8,0,0.5,wood);box(4.9,8.35,5.35,8.8,0,0.5,wood);
  box(5.4,8.3,6.4,8.8,0,0.75,wood);box(2.65,5.05,4.65,5.85,0,2.2,wood);
  bed(6.95,6.8,8.75,8.8,'S');box(6.5,8.35,6.95,8.8,0,0.5,wood);box(8.75,8.35,9.2,8.8,0,0.5,wood);
  box(9.65,8.2,10.85,8.8,0,0.75,wood);box(6.5,5.05,8.5,5.85,0,2.2,wood);
  box(1.59,5.96,2.55,7.88,0,1.2,altar);
  box(13.2,5.16,13.8,5.76,0,0.85,white);cyl(13.5,0.6,5.46,0.17,0.17,0.02,M(0x9aa1a8),Math.PI/2*0,Math.PI/2);
  [[10.97,12.25],[12.445,13.72]].forEach(w=>{box(w[0],8.2,w[0]+0.18,8.62,0,0.8,ceramic);
  const b=cyl(w[0]+0.42,0.2,8.41,0.19,0.16,0.4,ceramic);b.scale.set(1.3,1,1);});
  const glassP=new THREE.MeshStandardMaterial({color:0xbfe3f7,transparent:true,opacity:0.35});
  box(10.97,7.92,11.82,7.98,0,2.0,glassP);box(12.445,7.92,13.29,7.98,0,2.0,glassP);
  const doors:Door[]=[],clickables:THREE.Object3D[]=[];
  rackParts.forEach(p=>{p.userData.rack=true;clickables.push(p);});
  const ang:Record<Dir,number>={'+x':0,'-x':Math.PI,'+z':-Math.PI/2,'-z':Math.PI/2};
  const knobMat=M(0xd4af37);
  function door(hx:number,hz:number,len:number,cd:Dir,od:Dir,mat:THREE.Material):Door{const g=new THREE.Group();g.position.set(hx-7,0,hz-4.5);
  const geo=new THREE.BoxGeometry(len-0.02,2.1,0.045);const m=new THREE.Mesh(geo,mat);m.position.set(len/2,1.05,0);g.add(m);
  const ed=new THREE.LineSegments(new THREE.EdgesGeometry(geo),edgeMat);ed.position.copy(m.position);g.add(ed);
  const kn=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.18,0.1),knobMat);kn.position.set(len-0.1,1.0,0);g.add(kn);
  const c=ang[cd];let d=ang[od]-c;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
  g.rotation.y=c;const o:Door={g,c,o:c+d,t:c,open:false,len};m.userData.door=o;kn.userData.door=o;clickables.push(m,kn);doors.push(o);scene.add(g);return o;}
  door(1.1,1.675,0.9,'+z','-x',mainWood);door(1.1,3.475,0.9,'-z','-x',mainWood);
  door(6.0,0.1,0.88,'+x','+z',mainWood);door(13.9,4.1,0.8,'+z','-x',mainWood);
  door(1.42,5.0,0.8,'+x','+z',inWood);door(6.17,5.0,0.8,'-x','+z',inWood);door(9.85,5.0,0.8,'-x','+z',inWood);door(10.15,4.0,0.8,'+x','-z',inWood);
  const wcDoors:[Door,Door]=[door(12.24,6.25,0.7,'-x','+z',wcDoor),door(13.57,6.25,0.7,'-x','+z',wcDoor)];
  clickables.push(...winLeaves);
  const labels:THREE.Sprite[]=[];
  function label(t:string,x:number,z:number){const c=document.createElement('canvas');c.width=320;c.height=72;const g=c.getContext('2d')!;g.fillStyle='rgba(255,255,255,0.88)';g.beginPath();if(g.roundRect)g.roundRect(4,8,312,56,14);else g.rect(4,8,312,56);g.fill();g.fillStyle='#2c2c2a';g.font='500 30px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(t,160,37);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false}));s.scale.set(2.2,0.5,1);s.position.set(x-7,4.0,z-4.5);s.renderOrder=10;s.visible=false;scene.add(s);labels.push(s);}
  ([['Sảnh',-0.2,2.5],['Phòng khách',3.6,2.8],['Bếp + ăn',8.0,3.9],['P. ngủ 3',11.9,2.7],['Hành lang',12.0,4.5],['P. thờ',1.4,7.0],['P. ngủ 1',4.5,6.3],['P. ngủ 2',8.6,6.3],['Lavabo',12.4,5.6],['WC1',11.6,7.3],['WC2',13.1,7.3]] as [string,number,number][]).forEach(l=>label(l[0],l[1],l[2]));
  const roofG=new THREE.Group();scene.add(roofG);
  const roofMat=new THREE.MeshStandardMaterial({color:0x6f90bb,roughness:0.55,side:THREE.DoubleSide});
  const roofLine=new THREE.LineBasicMaterial({color:0x2a3f5c});
  const cutPlanes=[new THREE.Plane(new THREE.Vector3(-1,0,0),-6),new THREE.Plane(new THREE.Vector3(0,0,1),4.3)];
  const roofMatS=roofMat.clone();roofMatS.clippingPlanes=cutPlanes;roofMatS.clipIntersection=true;
  const roofLineS=roofLine.clone();roofLineS.clippingPlanes=cutPlanes;roofLineS.clipIntersection=true;
  const capMat=M(0x3f5f8a);
  const t=Math.tan(Math.PI/6);
  function cap(a:number[],b:number[]){const A=new THREE.Vector3(a[0],a[1]+0.05,a[2]),B=new THREE.Vector3(b[0],b[1]+0.05,b[2]);const len=A.distanceTo(B);
  const c=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,len,8),capMat);c.position.copy(A).add(B).multiplyScalar(0.5);
  c.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),B.clone().sub(A).normalize());roofG.add(c);}
  function hip(x0:number,x1:number,z0:number,z1:number,hl:boolean,hr:boolean,E:number,mat?:THREE.Material,lmat?:THREE.LineBasicMaterial){const zm=(z0+z1)/2,half=(z1-z0)/2,r=E+half*t,L=hl?x0+half:x0,R=hr?x1-half:x1;
  const P=(x:number,y:number,z:number)=>[x-7,y,z-4.5];
  const tri:number[]=[];const q=(a:number[],b:number[],c:number[])=>tri.push(...a,...b,...c);
  const A=P(x0,E,z0),B=P(x1,E,z0),C=P(x1,E,z1),D=P(x0,E,z1),RL=P(L,r,zm),RR=P(R,r,zm);
  q(A,B,RR);q(A,RR,RL);q(D,RL,RR);q(D,RR,C);q(A,RL,D);q(B,C,RR);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(tri,3));g.computeVertexNormals();
  roofG.add(new THREE.Mesh(g,mat||roofMat));roofG.add(new THREE.LineSegments(new THREE.EdgesGeometry(g,20),lmat||roofLine));
  cap(RL,RR);if(hl){cap(A,RL);cap(D,RL);}if(hr){cap(B,RR);cap(C,RR);}
  return {L,R,r,zm};}
  const main=hip(0.2,14.8,-0.8,9.8,true,true,E1);
  const tho=hip(-0.8,4.0,4.9,9.4,true,false,E2);
  const sanh=hip(-1.3,4.0,-0.3,5.3,true,false,E3,roofMatS,roofLineS);
  const fas=M(0xffffff);
  const fb=(x0:number,z0:number,x1:number,z1:number,E:number)=>box(x0,z0,x1,z1,E-0.24,E,fas,false,null,roofG);
  const sf=(x0:number,z0:number,x1:number,z1:number,E:number)=>box(x0,z0,x1,z1,E-0.26,E-0.24,fas,false,null,roofG);
  fb(0.2,-0.86,14.8,-0.8,E1);fb(0.2,9.8,14.8,9.86,E1);fb(14.8,-0.8,14.86,9.8,E1);fb(0.14,-0.8,0.2,-0.3,E1);fb(0.14,9.4,0.2,9.8,E1);
  sf(0.2,-0.8,14.8,0,E1);sf(0.2,9,14.8,9.8,E1);sf(14,-0.8,14.8,9.8,E1);
  fb(-0.86,4.9,-0.8,9.4,E2);fb(-0.8,9.4,0.2,9.46,E2);fb(-0.8,4.84,0,4.9,E2);
  sf(-0.8,4.9,0,9.4,E2);
  fb(-1.36,-0.3,-1.3,5.3,E3);fb(-1.3,-0.36,1.0,-0.3,E3);fb(-1.3,5.3,-0.8,5.36,E3);fb(0.94,-0.3,1.0,0,E3);
  sf(-1.3,-0.3,1.0,4.95,E3);
  box(-0.15,2.2,0.25,2.75,E3-0.27,E3-0.26,new THREE.MeshBasicMaterial({color:0xfff3c4}),false,null,roofG);
  const finMat=M(0x5677a3);
  function finial(x:number,y:number,z:number,h:number){const s=new THREE.Mesh(new THREE.SphereGeometry(0.14,16,12),finMat);s.position.set(x-7,y+0.17,z-4.5);roofG.add(s);
  const s2=new THREE.Mesh(new THREE.SphereGeometry(0.09,16,12),finMat);s2.position.set(x-7,y+0.42,z-4.5);roofG.add(s2);
  const c=new THREE.Mesh(new THREE.ConeGeometry(0.035,h,10),finMat);c.position.set(x-7,y+0.5+h/2,z-4.5);roofG.add(c);}
  finial(main.L,main.r,main.zm,1.0);finial(main.R,main.r,main.zm,1.0);finial(tho.L,tho.r,tho.zm,0.8);finial(sanh.L,sanh.r,sanh.zm,0.7);
  
  return { solids, floors, tiles, occluders, doors, wcDoors, windows, beds, labels, clickables, roof: roofG, rack: { group: rackG, armL, armR } };
}
