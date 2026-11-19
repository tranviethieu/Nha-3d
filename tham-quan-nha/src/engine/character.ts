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
  shadow: THREE.Mesh;
}

/** Low-poly person, 1.70 m tall / slim ~60 kg build, origin at the feet, facing local +z. */
export function makeCharacter(scene: THREE.Scene): Character {
  const S = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const skin = S(0xe9bf9c), shirt = S(0x3d7cc9), pants = S(0x2f3a4a), shoe = S(0x1e1e1e), hair = S(0x2a1c14), eye = S(0x111111);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const add = (p: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m;
  };
  const limb = (x: number, y: number) => { const g = new THREE.Group(); g.position.set(x, y, 0); body.add(g); return g; };

  // Proportions: 1.70 m tall (top of hair), slim ~60 kg build
  const legL = limb(-0.08, 0.85), legR = limb(0.08, 0.85);
  // thigh + shin with a knee joint (needed to sit); hip to sole = 0.85
  const [kneeL, kneeR] = [legL, legR].map(l => {
    add(l, new THREE.BoxGeometry(0.12, 0.43, 0.14), pants, 0, -0.215, 0);
    const k = new THREE.Group(); k.position.set(0, -0.42, 0); l.add(k);
    add(k, new THREE.BoxGeometry(0.115, 0.38, 0.13), pants, 0, -0.19, 0);
    add(k, new THREE.BoxGeometry(0.12, 0.06, 0.24), shoe, 0, -0.40, 0.04);
    return k;
  });
  add(body, new THREE.BoxGeometry(0.32, 0.13, 0.18), pants, 0, 0.88, 0);
  add(body, new THREE.BoxGeometry(0.34, 0.46, 0.19), shirt, 0, 1.18, 0);
  add(body, new THREE.CylinderGeometry(0.045, 0.05, 0.07, 12), skin, 0, 1.44, 0);
  add(body, new THREE.SphereGeometry(0.11, 24, 18), skin, 0, 1.565, 0).scale.set(1, 1.1, 1);
  add(body, new THREE.SphereGeometry(0.117, 24, 14, 0, Math.PI * 2, 0, Math.PI / 1.8), hair, 0, 1.575, -0.008).scale.set(1, 1.08, 1.02);
  add(body, new THREE.SphereGeometry(0.015, 8, 8), eye, -0.04, 1.58, 0.1);
  add(body, new THREE.SphereGeometry(0.015, 8, 8), eye, 0.04, 1.58, 0.1);

  const armL = limb(-0.215, 1.38), armR = limb(0.215, 1.38);
  for (const a of [armL, armR]) {
    add(a, new THREE.BoxGeometry(0.09, 0.3, 0.11), shirt, 0, -0.13, 0);
    add(a, new THREE.BoxGeometry(0.075, 0.28, 0.09), skin, 0, -0.41, 0);
    add(a, new THREE.SphereGeometry(0.045, 10, 8), skin, 0, -0.58, 0);
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
  return { root, body, legL, legR, kneeL, kneeR, armL, armR, shadow };
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
  if (!onGround) {
    ch.legL.rotation.x = -0.35; ch.legR.rotation.x = 0.25;
    ch.armL.rotation.x = ch.armR.rotation.x = -0.5;
    ch.kneeL.rotation.x = 0.6; ch.kneeR.rotation.x = 0.3;
  }
}

/** Hip height above the feet origin; a seated character is placed so the hips rest on the seat. */
export const HIP = 0.85;
/** Reset every joint (for lying down / sitting). */
export function restPose(ch: Character, sit: boolean) {
  for (const l of [ch.legL, ch.legR, ch.kneeL, ch.kneeR, ch.armL, ch.armR]) l.rotation.set(0, 0, 0);
  ch.body.position.set(0, 0, 0); ch.body.rotation.set(0, 0, 0);
  if (sit) {
    ch.legL.rotation.x = ch.legR.rotation.x = -Math.PI / 2; // thighs forward
    ch.kneeL.rotation.x = ch.kneeR.rotation.x = Math.PI / 2; // shins down
    ch.armL.rotation.x = ch.armR.rotation.x = -0.45; // hands on the thighs
  }
}
