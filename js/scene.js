// Everything in the lab, built in REAL-LIFE metres inside one group (`lab`).
// The group is then scaled for the size the student picked (desk 1:7, half 1:2, life 1:1),
// so every distance, the ruler included, stays true to real life.
//
// Lab axes: +X is the firing direction (the muzzle points +X, the cannon recoils toward −X),
// +Y is up, and the student watches from the +Z side. x = 0 is the axle before firing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VARS, level } from './physics.js';
import { labelPlane, rulerTexture } from './ui3d.js';

export const MODEL_TO_REAL = 2.2;          // the model is about 0.45 of real size (real wheel ≈ 1.45 m across)
export const WHEEL_R = 0.33 * MODEL_TO_REAL;   // real wheel radius, m
export const BALL_R = 0.0585;              // 11.7 cm ball
export const MUZZLE = new THREE.Vector3(0.9, 1.1, 0);     // where the ball leaves the barrel (lab coords, cannon at rest)
export const VENT = new THREE.Vector3(-0.72, 1.24, 0);    // touch hole on top of the breech, where the lanyard is fixed
export const BACKSTOP_X = 2.55;            // front face of the sandbags
export const RULER_Z = 1.25;               // the ruler lies on the ground in front of the near wheel
export const RULER_CM = 150;
export const LEVEL_COLORS = [0xd4af6a, 0x4fb7d1, 0xc983de];
const TRAIL = { x0: -0.35, y0: 0.74, x1: -2.35, y1: 0.24 };   // top surface of the trail, for the weight blocks

export function buildLab(onProgress) {
  const lab = new THREE.Group(); lab.name = 'lab';
  const labels = [];   // floating text: kept a readable size whatever the lab's scale
  const addLabel = (parent, text, pos, opts = {}) => {
    const m = labelPlane(text, { wM: 1, ...opts }); m.position.copy(pos); m.renderOrder = 12;
    m.userData.worldW = opts.worldW || 1; parent.add(m); labels.push(m); return m;
  };

  // light for the model (passthrough has no light of its own)
  lab.add(new THREE.HemisphereLight(0xfff4e2, 0x4a4036, 1.4));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.0); key.position.set(-2, 5, 4); lab.add(key, key.target);

  // ── the cannon (moves when it recoils) ──
  const cannon = new THREE.Group(); cannon.name = 'cannon'; lab.add(cannon);
  const ready = new Promise((resolve, reject) => {
    new GLTFLoader().load('labs/cannon/cannon.glb', (g) => {
      const m = g.scene; m.scale.setScalar(MODEL_TO_REAL); cannon.add(m);
      const wheels = m.getObjectByName('Wheels');
      m.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; } });
      resolve({ model: m, wheels });
    }, (e) => onProgress?.(e.total ? e.loaded / e.total : 0), reject);
  });

  // weight blocks strapped to the trail (each +500 kg)
  const slope = Math.atan2(TRAIL.y0 - TRAIL.y1, TRAIL.x0 - TRAIL.x1);
  const trailY = (x) => TRAIL.y1 + (x - TRAIL.x1) * (TRAIL.y0 - TRAIL.y1) / (TRAIL.x0 - TRAIL.x1);
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x5b5e63, metalness: 0.6, roughness: 0.5 });
  const blocks = [-0.95, -1.45].map((x, i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.5), ironMat);
    b.position.set(x, trailY(x) + 0.15, 0); b.rotation.z = slope; b.visible = false; cannon.add(b);
    b.userData.label = addLabel(cannon, '+500 kg', new THREE.Vector3(x, trailY(x) + 0.55, 0.32), { worldW: 0.7 });
    b.userData.label.visible = false;
    return b;
  });

  // the red pointer: an arm from the axle down to the ruler, so students read the ruler at the axle
  const red = new THREE.MeshBasicMaterial({ color: 0xe2614b });
  {
    const a = new THREE.Vector3(0, WHEEL_R, 0.98), b = new THREE.Vector3(0, 0.03, RULER_Z - 0.06);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, a.distanceTo(b), 8), red);
    arm.position.copy(a).add(b).multiplyScalar(0.5); arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 12), red);
    tip.rotation.x = Math.PI; tip.position.set(0, 0.06, RULER_Z - 0.06);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.2).rotateX(-Math.PI / 2), red);
    line.position.set(0, 0.012, RULER_Z); cannon.add(arm, tip, line);
  }

  // ── the ground things (stay put) ──
  // ruler along the track
  const R = rulerTexture(RULER_CM);
  const rulerW = (RULER_CM + 2.5) / 100;
  const ruler = new THREE.Mesh(new THREE.PlaneGeometry(rulerW, rulerW / R.aspect).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: R.tex }));
  ruler.position.set(0.0125 - rulerW / 2, 0.006, RULER_Z + rulerW / R.aspect / 2 - 0.02); ruler.renderOrder = 2;
  ruler.name = 'ruler'; lab.add(ruler);
  // an invisible strip over the track, for pointing at it (prediction flag)
  const track = new THREE.Mesh(new THREE.PlaneGeometry(rulerW + 0.3, 1.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  track.position.set(ruler.position.x, 0.01, RULER_Z - 0.2); track.name = 'track'; lab.add(track);
  addLabel(lab, 'cm', new THREE.Vector3(0.18, 0.05, RULER_Z + 0.12), { worldW: 0.35, bg: null, color: '#efe2c4' });

  // chocks (blocked wheels): wedges behind both wheels
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 });
  const chockGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.42, 0); s.lineTo(0.42, 0.04); s.lineTo(0, 0.3); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false }); g.translate(0, 0, -0.1); return g; })();
  const chocks = [-0.88, 0.88].map((z) => { const c = new THREE.Mesh(chockGeo, wood); c.position.set(-WHEEL_R - 0.42 + 0.06, 0, z); c.visible = false; lab.add(c); return c; });

  // sandbag backstop
  const bagMat = new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 1 });
  const bagGeo = new THREE.CapsuleGeometry(0.17, 0.3, 4, 10).rotateZ(Math.PI / 2).scale(1, 0.75, 1);
  for (let row = 0; row < 6; row++) for (let i = 0; i < 3 - (row % 2); i++) {   // a short wall of sandbags across the line of fire
    const b = new THREE.Mesh(bagGeo, bagMat);
    b.position.set(BACKSTOP_X + 0.2 + (row % 2) * 0.04, 0.13 + row * 0.25, -0.62 + i * 0.62 + (row % 2) * 0.31);
    b.rotation.y = Math.PI / 2; lab.add(b);
  }

  // the cannonball (on display beside the cannon, then flying) and the powder bags
  const ballMats = Object.fromEntries(VARS.ball.map((l) => [l.id, new THREE.MeshStandardMaterial({ color: l.color, roughness: l.id === 'iron' ? 0.5 : 0.85, metalness: l.id === 'iron' ? 0.6 : 0 })]));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), ballMats.iron); lab.add(ball);
  const display = new THREE.Group(); display.position.set(1.15, 0, 1.05); lab.add(display);
  const shownBall = new THREE.Mesh(ball.geometry, ballMats.iron); shownBall.position.set(0, BALL_R, 0); display.add(shownBall);
  const ballLabel = { m: null };
  // Civil War powder came in cloth cartridge bags (wool flannel), tied at the top with twine; loose powder
  // stayed in a wooden keg. Both are drawn here from simple shapes, with a woven-cloth texture.
  const flannel = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#e2d7bd'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 64; i += 2) { g.fillStyle = `rgba(120,100,70,${0.05 + Math.random() * 0.07})`; g.fillRect(0, i, 64, 1); g.fillRect(i, 0, 1, 64); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); return t; })();
  const bagMat2 = new THREE.MeshStandardMaterial({ map: flannel, roughness: 1 });
  const bagGeo2 = new THREE.LatheGeometry([[0, 0], [0.052, 0], [0.062, 0.015], [0.064, 0.06], [0.062, 0.13], [0.05, 0.165], [0.022, 0.19], [0.016, 0.2], [0.026, 0.215], [0.03, 0.235], [0.018, 0.25], [0, 0.252]].map(([r, y]) => new THREE.Vector2(r, y)), 18);
  const twineMat = new THREE.MeshStandardMaterial({ color: 0x8f7650, roughness: 1 });
  const bags = [0, 1, 2].map((i) => {
    const b = new THREE.Group(); b.add(new THREE.Mesh(bagGeo2, bagMat2));
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.005, 6, 16).rotateX(Math.PI / 2), twineMat); tie.position.y = 0.198; b.add(tie);
    b.position.set(0.5 + i * 0.15, 0, 0); b.rotation.set((i - 1) * 0.05, i * 1.3, 0); display.add(b); return b; });
  { // the powder keg, with iron hoops
    const keg = new THREE.Group();
    const staves = new THREE.Mesh(new THREE.LatheGeometry([[0.0, 0], [0.17, 0], [0.2, 0.12], [0.205, 0.22], [0.2, 0.32], [0.17, 0.44], [0.0, 0.44]].map(([r, y]) => new THREE.Vector2(r, y)), 20),
      new THREE.MeshStandardMaterial({ color: 0x7a4f2a, roughness: 0.85 }));
    keg.add(staves);
    for (const y of [0.06, 0.15, 0.29, 0.38]) { const r = y < 0.22 ? 0.17 + (y / 0.12) * 0.03 : 0.2 - ((y - 0.32) / 0.12) * 0.03; const h = new THREE.Mesh(new THREE.TorusGeometry(Math.min(0.206, r + 0.004), 0.008, 6, 28).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2f2d2b, metalness: 0.5, roughness: 0.6 })); h.position.y = y; keg.add(h); }
    keg.position.set(1.15, 0, -0.05); display.add(keg);
  }
  const powderLabel = { m: null };

  // smoke (a few puffs)
  const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 4, 64, 64, 62); r.addColorStop(0, 'rgba(235,232,226,0.95)'); r.addColorStop(1, 'rgba(235,232,226,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const puffs = [...Array(10)].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; lab.add(s); return s; });

  // arrows (pushes): length = strength
  const arrow = (color, text) => {
    const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 12).rotateZ(-Math.PI / 2).translate(0.5, 0, 0), mat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 16).rotateZ(-Math.PI / 2), mat);
    shaft.renderOrder = head.renderOrder = 25; g.add(shaft, head);
    g.userData = { shaft, head, label: addLabel(g, text, new THREE.Vector3(0.5, 0.3, 0), { worldW: 1.2 }) };
    g.visible = false; lab.add(g);
    g.setLength = (L) => { shaft.scale.x = Math.max(0.001, L - 0.22); head.position.x = Math.max(0.12, L - 0.11); g.userData.label.position.x = L / 2; };
    g.setOpacity = (o) => { mat.opacity = o; g.userData.label.material.opacity = o; };
    return g;
  };
  // blue and orange (not red/green) so colour-blind students can tell the two pushes apart; each is labelled too
  const arrows = { ball: arrow(0x2f8fe8, 'push on ball'), cannon: arrow(0xf28c28, 'push on cannon'), friction: arrow(0xd8d8d8, 'friction') };

  // flags: the prediction (blue) and one faint flag per trial ("ghosts")
  const flag = (color, opacity = 1) => {
    const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 8).translate(0, 0.25, 0), m);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13).translate(-0.1, 0.43, 0), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: opacity < 1, opacity }));
    g.add(pole, cloth); g.visible = false; lab.add(g); return g;
  };
  const predFlag = flag(0x2f7de1); predFlag.position.z = RULER_Z;
  predFlag.userData.label = addLabel(predFlag, 'your prediction', new THREE.Vector3(0, 0.66, 0), { worldW: 0.9, bg: 'rgba(47,125,225,0.9)', border: null, color: '#fff' });
  const ghosts = [];
  const addGhost = (cm, levelIndex, n, text = String(n)) => {
    const g = flag(LEVEL_COLORS[levelIndex % LEVEL_COLORS.length], 0.55);
    g.position.set(-cm / 100, 0, RULER_Z - 0.08 - 0.06 * (n - 1)); g.scale.setScalar(0.75); g.visible = true;
    g.userData.label = text === String(n)
      ? addLabel(g, text, new THREE.Vector3(-0.1, 0.43, 0.01), { worldW: 0.18, bg: null, color: '#1a1612', border: null })
      : addLabel(g, text, new THREE.Vector3(0, 0.66, 0), { worldW: 0.8 });   // guided mode: the flag says which shot it was
    ghosts.push(g); return g;
  };
  const clearGhosts = () => { for (const g of ghosts) { lab.remove(g); const i = labels.indexOf(g.userData.label); if (i >= 0) labels.splice(i, 1); } ghosts.length = 0; };
  // the challenge's target line
  const target = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3fd46b }));
  target.position.set(0, 0.012, RULER_Z); target.visible = false; lab.add(target);
  target.userData.label = addLabel(target, 'target', new THREE.Vector3(0, 0.2, 0.3), { worldW: 0.5, bg: 'rgba(63,212,107,0.9)', border: null, color: '#10200f' });

  // the lanyard: a rope from the vent to a wooden handle that sits within the student's reach
  const ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0xd8c08a })); rope.frustumCulled = false; lab.add(rope);
  const handle = new THREE.Group(); handle.name = 'lanyard';
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.7, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.8 }));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.18, depthWrite: false }));
  handle.add(grip, glow); handle.userData = { grip, glow }; lab.add(handle);

  // ── updates driven by the app ──
  const api = {
    lab, cannon, ready, labels, ruler, track, chocks, blocks, ball, display, shownBall, bags, puffs, arrows, predFlag, ghosts, addGhost, clearGhosts, target, rope, handle,
    // show the choices on the objects: which ball, how many bags, weight blocks, chocks
    showSettings(st, T) {
      const lv = (k) => level(k, st[k]);
      shownBall.material = ballMats[st.ball]; ball.material = ballMats[st.ball];
      if (ballLabel.m) { display.remove(ballLabel.m); labels.splice(labels.indexOf(ballLabel.m), 1); }
      ballLabel.m = addLabel(display, T.levels[st.ball], new THREE.Vector3(-0.05, 0.32, 0), { worldW: 1.0 });
      const n = lv('powder').bags; bags.forEach((b, i) => { b.visible = i < n; });
      if (powderLabel.m) { display.remove(powderLabel.m); labels.splice(labels.indexOf(powderLabel.m), 1); }
      powderLabel.m = addLabel(display, T.levels[st.powder], new THREE.Vector3(0.65, 0.42, 0), { worldW: 1.0 });
      const k = lv('cannon').blocks; blocks.forEach((b, i) => { b.visible = i < k; b.userData.label.visible = i < k; });
      chocks.forEach((c) => { c.visible = st.wheels === 'blocked'; });
    },
    setLabelText(m, text) {   // re-draw a label with new text (language change)
      const fresh = labelPlane(text, { wM: 1 }); m.material.map.dispose(); m.material.map = fresh.material.map; m.geometry.dispose(); m.geometry = fresh.geometry; m.userData.text = text;
    },
    cannonX: 0,
    setCannonX(x, wheels) { cannon.position.x = x; api.cannonX = x; if (wheels) wheels.rotation.z = -x / WHEEL_R; },
    ventWorld() { return cannon.localToWorld(VENT.clone()); },
  };
  return api;
}
