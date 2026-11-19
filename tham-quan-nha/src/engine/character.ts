import * as THREE from 'three';

export interface Character {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** Skirt, hinged at the waist: hangs while walking, lies over the thighs when sitting. */
  skirt: THREE.Group;
  shadow: THREE.Mesh;
}

/** The visitor: a cartoon-style schoolgirl, 1.70 m tall: big head and eyes, dark hair with a full fringe and a red
 *  bow, white short-sleeved shirt with a navy sailor collar and red ribbon, navy pleated skirt, white knee socks,
 *  brown shoes. Origin at the feet, facing local +z. Joint layout (hip 0.85, knee 0.43, shoulder 1.32) is what the
 *  walk / sit / lie poses expect. */
export function makeCharacter(scene: THREE.Scene): Character {
  const S = (c: number, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
  const skin = S(0xf6d2b8, 0.55), shirt = S(0xfafafa, 0.7), navy = S(0x24345e, 0.7), red = S(0xd23a3a, 0.5);
  const sock = S(0xffffff, 0.75), shoe = S(0x5a3420, 0.4), hair = S(0x2b1a12, 0.45);
  const white = S(0xffffff, 0.3), iris = S(0x6b3b1f, 0.25), pupil = S(0x1b0f08, 0.3), dark = S(0x1e130d, 0.6);
  const mouth = S(0xb8485c, 0.5), blush = new THREE.MeshStandardMaterial({ color: 0xff9a9a, roughness: 0.8, transparent: true, opacity: 0.5 });
  navy.side = THREE.DoubleSide; // open-ended skirt / collar: show their insides
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const add = (p: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); p.add(m); return m;
  };
  const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 14);
  const ball = (r: number, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
  const joint = (p: THREE.Object3D, x: number, y: number) => { const g = new THREE.Group(); g.position.set(x, y, 0); p.add(g); return g; };

  // legs: thighs, white knee socks, brown shoes
  const legL = joint(body, -0.068, 0.85), legR = joint(body, 0.068, 0.85);
  const [kneeL, kneeR] = [legL, legR].map(l => {
    add(l, cap(0.056, 0.3), skin, 0, -0.21, 0);
    const k = joint(l, 0, -0.42);
    add(k, cap(0.047, 0.3), sock, 0, -0.2, 0);
    add(k, new THREE.TorusGeometry(0.047, 0.008, 6, 16), sock, 0, -0.03, 0).rotation.x = Math.PI / 2; // sock cuff
    add(k, cap(0.045, 0.12), shoe, 0, -0.395, 0.035).rotation.x = Math.PI / 2;                      // rounded shoe
    return k;
  });

  // shirt (lathe: waist, chest, shoulders), sailor collar with a red ribbon
  const torso = new THREE.LatheGeometry([[0.115, 0], [0.122, 0.1], [0.138, 0.2], [0.13, 0.27], [0.085, 0.315], [0.04, 0.335]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 28);
  add(body, torso, shirt, 0, 1.0, 0, 1.05, 1, 0.74);
  add(body, new THREE.CylinderGeometry(0.075, 0.155, 0.075, 28, 1, true), navy, 0, 1.285, -0.004, 1.05, 1, 0.78);
  add(body, new THREE.TorusGeometry(0.135, 0.005, 6, 28), white, 0, 1.257, -0.004, 1.06, 0.78, 1).rotation.x = Math.PI / 2; // collar stripe
  for (const sx of [-1, 1]) add(body, new THREE.ConeGeometry(0.035, 0.07, 10), red, sx * 0.03, 1.235, 0.098).rotation.set(0, 0, sx * Math.PI / 2.4);
  add(body, ball(0.018), red, 0, 1.237, 0.1);                                                              // ribbon knot
  for (const sx of [-1, 1]) add(body, new THREE.BoxGeometry(0.022, 0.07, 0.008), red, sx * 0.014, 1.19, 0.098).rotation.z = sx * 0.25; // tails

  // pleated skirt, hinged at the waist
  const skirt = joint(body, 0, 1.0);
  const sk = new THREE.CylinderGeometry(0.122, 0.235, 0.4, 48, 2, true), pos = sk.attributes.position;
  for (let i = 0; i < pos.count; i++) { // pleats: push every other fold out, more toward the hem
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i), a = Math.atan2(z, x), t = (0.2 - y) / 0.4;
    const f = 1 + Math.max(0, Math.cos(a * 16)) * 0.07 * (0.3 + t);
    pos.setXYZ(i, x * f, y, z * f);
  }
  sk.computeVertexNormals();
  add(skirt, sk, navy, 0, -0.2, 0, 1, 1, 0.82);

  // neck and big cartoon head
  add(body, new THREE.CylinderGeometry(0.034, 0.04, 0.09, 14), skin, 0, 1.375, 0);
  add(body, ball(0.145, 32, 24), skin, 0, 1.545, 0, 1, 1.02, 0.97);
  for (const sx of [-1, 1]) {
    const ex = sx * 0.052;
    add(body, ball(0.03), white, ex, 1.528, 0.124, 0.82, 1.15, 0.35);           // eye white
    add(body, ball(0.023), iris, ex, 1.524, 0.132, 0.82, 1.1, 0.35);            // big brown iris
    add(body, ball(0.012), pupil, ex, 1.522, 0.137, 0.85, 1.1, 0.3);
    add(body, ball(0.0065), white, ex + sx * -0.008 + 0.004, 1.536, 0.141);   // catch lights
    add(body, ball(0.0035), white, ex + 0.006, 1.513, 0.14);
    add(body, new THREE.BoxGeometry(0.058, 0.009, 0.01), dark, ex, 1.562, 0.128).rotation.z = sx * 0.1;   // upper lash line (outer end a little lower: gentle look)
    add(body, new THREE.BoxGeometry(0.014, 0.004, 0.006), dark, ex + sx * 0.031, 1.562, 0.124).rotation.z = sx * -0.5; // lash flick
    add(body, new THREE.BoxGeometry(0.036, 0.0045, 0.006), hair, ex, 1.597, 0.13).rotation.z = sx * -0.04; // soft, level brows
    add(body, ball(0.024), blush, sx * 0.088, 1.49, 0.112, 1.2, 0.7, 0.35);   // cheeks
  }
  add(body, ball(0.0075), skin, 0, 1.497, 0.141, 0.8, 1, 0.8);                // nose
  add(body, new THREE.TorusGeometry(0.017, 0.0042, 6, 14, Math.PI), mouth, 0, 1.474, 0.133).rotation.z = Math.PI; // smile

  // hair: crown, back of the head, full fringe, side locks, long fall down the back, red bow
  add(body, new THREE.SphereGeometry(0.155, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.6), hair, 0, 1.548, -0.003, 1, 1.02, 0.98);
  add(body, new THREE.SphereGeometry(0.156, 32, 16, Math.PI, Math.PI, 0, Math.PI / 1.45), hair, 0, 1.548, -0.006, 1, 1.02, 0.99);
  add(body, new THREE.SphereGeometry(0.153, 28, 8, Math.PI * 0.12, Math.PI * 0.76, 0.32, 0.72), hair, 0, 1.548, 0.004, 1, 1.02, 0.98);
  for (const sx of [-1, 1]) add(body, cap(0.034, 0.26), hair, sx * 0.128, 1.43, 0.03, 1, 1, 0.75);
  add(body, cap(0.115, 0.36), hair, 0, 1.3, -0.085, 1.22, 1, 0.5);
  for (const sx of [-1, 1]) add(body, ball(0.04), red, sx * 0.045, 1.66, -0.12, 1.1, 0.75, 0.45).rotation.z = sx * 0.3;
  add(body, ball(0.016), red, 0, 1.655, -0.13);

  // arms: puffed white sleeves, slender arms, hands
  const armL = joint(body, -0.168, 1.32), armR = joint(body, 0.168, 1.32);
  for (const a of [armL, armR]) {
    add(a, ball(0.052), shirt, 0, -0.04, 0, 1, 1.05, 0.92);
    add(a, cap(0.033, 0.18), skin, 0, -0.17, 0);
    add(a, cap(0.03, 0.2), skin, 0, -0.38, 0);
    add(a, ball(0.035), skin, 0, -0.54, 0.005, 0.8, 1.2, 0.6);
  }

  // soft blob shadow (cheaper and more robust than shadow maps for ~400 meshes)
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
  }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow, root);
  return { root, body, legL, legR, kneeL, kneeR, armL, armR, skirt, shadow };
}

/** Walk / run / jump pose. `speed` in m/s, `phase` advances with time. */
export function poseCharacter(ch: Character, speed: number, phase: number, onGround: boolean, now: number) {
  const k = Math.min(1, speed / 1.7);
  const sw = Math.sin(phase) * (0.25 + 0.35 * Math.min(1, speed / 3.6)) * k;
  ch.legL.rotation.x = sw; ch.legR.rotation.x = -sw;
  ch.armL.rotation.x = -sw * 0.9; ch.armR.rotation.x = sw * 0.9;
  // the knee bends while the leg swings back
  ch.kneeL.rotation.x = Math.max(0, sw) * 1.1 + 0.05 * k; ch.kneeR.rotation.x = Math.max(0, -sw) * 1.1 + 0.05 * k;
  ch.body.position.y = Math.abs(Math.cos(phase)) * 0.035 * k + Math.sin(now / 600) * 0.004;
  ch.body.rotation.x = 0.06 * Math.min(1, speed / 3.6);
  ch.skirt.rotation.x = -Math.abs(sw) * 0.25; // the hem swings forward a little with each step
  if (!onGround) {
    ch.skirt.rotation.x = -0.2;
    ch.legL.rotation.x = -0.35; ch.legR.rotation.x = 0.25;
    ch.armL.rotation.x = ch.armR.rotation.x = -0.5;
    ch.kneeL.rotation.x = 0.6; ch.kneeR.rotation.x = 0.3;
  }
}

/** Hip height above the feet origin; a seated character is placed so the hips rest on the seat. */
export const HIP = 0.85;
/** Reset every joint (for lying down / sitting). */
export function restPose(ch: Character, sit: boolean) {
  for (const l of [ch.legL, ch.legR, ch.kneeL, ch.kneeR, ch.armL, ch.armR, ch.skirt]) l.rotation.set(0, 0, 0);
  ch.body.position.set(0, 0, 0); ch.body.rotation.set(0, 0, 0);
  if (sit) {
    ch.legL.rotation.x = ch.legR.rotation.x = -Math.PI / 2; // thighs forward
    ch.kneeL.rotation.x = ch.kneeR.rotation.x = Math.PI / 2; // shins down
    ch.armL.rotation.x = ch.armR.rotation.x = -0.45; // hands on the thighs
    ch.skirt.rotation.x = -1.3; // skirt laid over the thighs
  }
}
