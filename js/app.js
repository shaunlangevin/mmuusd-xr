import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { UI, L } from './i18n.js';
import { drawMap, drawSigns, loadCuneiformFont } from './extras.js';
import { InfoPanel, ExtraPanel, Toolbar, Tracker, ClueCard, OptionsPanel, HintPanel, FreezePanel, markerTexture, labelPlane } from './ui3d.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const UP = new THREE.Vector3(0, 1, 0);
const TABLE_SCALE = 0.25;

// ═════════════ settings ═════════════════════════════════════════
// Priority: teacher console (later) > link settings (?lang=es&hunt=off&mode=seated&size=table&lock=1) > Options menu
const flag = (v, def) => (v == null ? def : !/^(0|off|false|no)$/i.test(v));
const S = {
  lang: params.get('lang') === 'es' ? 'es' : 'en',
  hunt: flag(params.get('progress') ?? params.get('hunt'), true),   // "Track my progress"
  clues: flag(params.get('detective') ?? params.get('clues'), false),   // Detective mode (hidden dots + clues)
  mode: params.get('mode') === 'seated' ? 'seated' : 'walk',
  size: params.get('size') === 'table' ? 'table' : 'life',
  lock: flag(params.get('lock'), false),
};
const t = () => UI[S.lang];
const tracking = () => S.hunt || S.clues;
const BOOL_KEYS = ['hunt', 'clues'];

// ═════════════ renderer / scene ═════════════════════════════════
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const BG = new THREE.Color(0x1b1814);
const FOG = new THREE.Fog(0x1b1814, 6, 14);
scene.background = BG; scene.fog = FOG;

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.02, 60);
const DESK_CAM = new THREE.Vector3(0.9, 1.5, 3.3);
camera.position.copy(DESK_CAM);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.15, 0);
controls.enableDamping = true; controls.minDistance = 0.8; controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.55;
controls.update();

scene.add(new THREE.HemisphereLight(0xfff1dc, 0x3a342c, 1.2));

const gallery = new THREE.Group();
scene.add(gallery);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28, 56, 56).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x2e2a25, roughness: 1 }));
gallery.add(floor);
const pool = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,226,170,0.38)'); grd.addColorStop(1, 'rgba(255,226,170,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.position.y = 0.003; gallery.add(m); return m;
})();
let backdrop = null;   // optional 360° image sphere

// everything that belongs to the artifact moves/turns/scales together
const root = new THREE.Group();
scene.add(root);
{
  const key = new THREE.DirectionalLight(0xfff0d8, 2.2); key.position.set(-1.4, 3.2, 2.6);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.9); fill.position.set(1.6, 2.4, -2.6);
  const tgt = new THREE.Object3D(); tgt.position.set(0, 1.1, 0);
  key.target = tgt; fill.target = tgt; root.add(key, fill, tgt);
}
function syncPool() { pool.position.set(root.position.x, 0.003, root.position.z); }

// ═════════════ 3D UI ════════════════════════════════════════════
// The reading panel and its picture travel together on one "rig" placed in front of the student
const rig = new THREE.Group(); scene.add(rig);
const panel = new InfoPanel(); rig.add(panel.mesh); panel.mesh.renderOrder = 32;
const extra = new ExtraPanel(); rig.add(extra.mesh); extra.mesh.renderOrder = 32;
const toolbar = new Toolbar(); toolbar.mesh.visible = false; scene.add(toolbar.mesh);
const tracker = new Tracker(); toolbar.mesh.add(tracker.mesh); tracker.mesh.position.set(0, 0.115, 0);
const clueCard = new ClueCard(); toolbar.mesh.add(clueCard.mesh); clueCard.mesh.position.set(0, 0.232, 0);
const options = new OptionsPanel(); scene.add(options.mesh); options.mesh.renderOrder = 33;
const hint = new HintPanel(); scene.add(hint.mesh);
// teacher freeze: a separate scene with only the message, so passthrough/the room is clear
const freezeScene = new THREE.Scene();
const freezePanel = new FreezePanel(); freezeScene.add(freezePanel.mesh);
let frozen = null;
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.15, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xd4af6a, transparent: true, opacity: 0.9, depthTest: false }));
reticle.renderOrder = 20; reticle.visible = false; scene.add(reticle);

// ═════════════ state ════════════════════════════════════════════
let EX = null;                    // exhibit data
let DOTS = [];
let model = null;
let markers = [];
let ruler = null;
const found = new Set();
const revealed = new Set();   // clue mode: dots that have been uncovered
let finishShown = false, pendingFinish = false;
let mode = 'desktop';             // 'desktop' | 'ar' | 'vr'
let placing = false, needsLayout = false, xrFrames = 0, activeCtrl = null;
let openIndex = -1, expanded = false;
const audioOK = { en: [], es: [] };
let audioFinish = { en: false, es: false };
const audio = new Audio(); let playing = false;
const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
let hasCuneiformFont = false;
const sizeScale = () => (S.size === 'table' ? TABLE_SCALE : 1);
const exPath = (f) => `exhibits/${EX.id}/${f}`;
const clipName = (i) => (i === 'finish' ? 'finish' : String(i + 1).padStart(2, '0'));

// ═════════════ exhibit loading ══════════════════════════════════
async function loadExhibit() {
  const index = await (await fetch('exhibits/index.json')).json();
  const id = params.get('exhibit') || index.default;
  EX = await (await fetch(`exhibits/${id}/exhibit.json`)).json();
  EX.id = id; EX.index = index;
  DOTS = EX.dots;
  hasCuneiformFont = await loadCuneiformFont();
  model = await loadModel(EX.model);
  root.add(model);
  computeAnchors();
  buildMarkers();
  buildRuler();
  if (EX.backdrop) loadBackdrop(exPath(EX.backdrop));
  checkAudio();
}

async function loadModel(m) {
  const H = m.heightMeters || 2;
  let obj;
  try {
    if (!m.file || m.file === 'standin') throw new Error('stand-in');
    const url = exPath(m.file);
    if (/\.stl$/i.test(m.file)) {
      const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
      const geo = await new STLLoader().loadAsync(url); geo.computeVertexNormals();
      obj = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.75 }));
    } else {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      obj = (await new GLTFLoader().loadAsync(url)).scene;
    }
  } catch (e) {
    if (e.message !== 'stand-in') console.warn('Model failed to load, using stand-in', e);
    const { buildStandInStele } = await import('./stele.js');
    obj = await buildStandInStele({ quality: params.get('quality') === 'low' ? 'low' : 'high' });
    EX.usingStandIn = true;
  }
  const pivot = new THREE.Group();
  if (m.upAxis === 'z') obj.rotation.x = -Math.PI / 2;
  pivot.add(obj);
  pivot.rotation.y = THREE.MathUtils.degToRad(m.rotationDeg || 0);
  const outer = new THREE.Group(); outer.add(pivot); outer.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(outer);
  pivot.scale.multiplyScalar(H / Math.max(1e-6, box.max.y - box.min.y));
  outer.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(outer);
  const c = box.getCenter(new THREE.Vector3());
  pivot.position.set(-c.x, -box.min.y, -c.z);
  outer.updateMatrixWorld(true);
  outer.userData.height = H;
  outer.userData.box = new THREE.Box3().setFromObject(outer);
  return outer;
}

// Each dot's spot on the surface: shoot a ray at the stone from the dot's direction
function computeAnchors() {
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.setScalar(1); root.updateMatrixWorld(true);
  const H = model.userData.height;
  for (const d of DOTS) {
    const a = THREE.MathUtils.degToRad(d.angle || 0), y = (d.h ?? 0.5) * H;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    raycaster.set(dir.clone().multiplyScalar(4).setY(y), dir.clone().negate()); raycaster.far = 5;
    const hit = raycaster.intersectObject(model, true)[0];
    if (hit) {
      d._p = hit.point.clone();
      d._n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : dir.clone();
      if (d._n.dot(dir) < 0.3) d._n.copy(dir);
    } else { d._p = dir.clone().multiplyScalar(0.3).setY(y); d._n = dir.clone(); }
  }
}

function buildMarkers() {
  markers = DOTS.map((d, i) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40),
      new THREE.MeshBasicMaterial({ map: markerTexture(i + 1, false), transparent: true }));
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.72, 40),
      new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.5, depthWrite: false }));
    m.add(halo); m.userData = { index: i, halo, hover: false }; m.renderOrder = 5;
    scene.add(m); return m;
  });
}
function refreshMarkerLooks() {
  markers.forEach((m, i) => {
    const f = tracking() && found.has(i);
    m.material.map = markerTexture(i + 1, f); m.material.needsUpdate = true;
    m.userData.halo.visible = !f;
  });
}

// height comparison: two poles beside the stone (shown with the "height" dot)
function buildRuler() {
  ruler = new THREE.Group(); ruler.visible = false; root.add(ruler);
  const box = model.userData.box;
  const x = box.min.x - 0.07, z0 = box.max.z * 0.6;   // right against the stone's front-left edge
  const pole = (h, color, dx) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.04), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 }));
    g.position.set(x + dx, h / 2, z0 - dx); ruler.add(g);
    for (let k = 0.5; k < h; k += 0.5) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      tick.position.set(x + dx, k, z0 - dx); ruler.add(tick);
    }
  };
  pole(model.userData.height, 0xd4af6a, 0);
  pole(1.4, 0x5fa8d8, -0.12);
  ruler.userData.labels = [];
  ruler.userData.x = x; ruler.userData.z = z0;
  setRulerLabels();
}
function setRulerLabels() {
  if (!ruler) return;
  ruler.userData.labels.forEach((l) => ruler.remove(l));
  const a = labelPlane(t().stoneH, 0.42), b = labelPlane(t().you, 0.42);
  a.position.set(ruler.userData.x, model.userData.height + 0.08, ruler.userData.z);
  b.position.set(ruler.userData.x - 0.12, 1.4 + 0.08, ruler.userData.z + 0.12);
  ruler.add(a, b); ruler.userData.labels = [a, b];
}

function loadBackdrop(url) {
  new THREE.TextureLoader().load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    backdrop = new THREE.Mesh(new THREE.SphereGeometry(20, 48, 32), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
    backdrop.scale.x = -1; backdrop.rotation.y = Math.PI;
    gallery.add(backdrop);
  });
}

async function checkAudio() {
  const head = async (u) => { try { const r = await fetch(u, { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch { return false; } };
  for (const lang of ['en', 'es']) {
    audioOK[lang] = await Promise.all(DOTS.map((_, i) => head(exPath(`audio/${lang}/${clipName(i)}.mp3`))));
    audioFinish[lang] = await head(exPath(`audio/${lang}/finish.mp3`));
  }
  if (openIndex >= 0) refreshInfo();
}
function hasAudio(i) { return i === 'finish' ? audioFinish[S.lang] : !!audioOK[S.lang][i]; }
function toggleAudio(i) {
  if (playing) { stopAudio(); refreshInfo(); return; }
  audio.src = exPath(`audio/${S.lang}/${clipName(i)}.mp3`);
  audio.currentTime = 0;
  audio.play().then(() => { playing = true; refreshInfo(); }).catch((e) => console.warn('audio', e));
}
function stopAudio() { audio.pause(); playing = false; }
audio.addEventListener('ended', () => { playing = false; refreshInfo(); });

// ═════════════ markers per frame ═════════════════════════════════
function updateMarkers(time) {
  const show = !placing && root.visible && !options.mesh.visible;
  const k = sizeScale();
  const base = mode === 'desktop' ? 0.085 : (k < 1 ? 0.04 : 0.075);
  markers.forEach((m, i) => {
    const d = DOTS[i];
    tmpV.copy(d._p).applyMatrix4(root.matrixWorld);
    tmpV2.copy(d._n).transformDirection(root.matrixWorld);
    m.position.copy(tmpV).addScaledVector(tmpV2, 0.05 * k + 0.012);
    m.visible = show && (!S.clues || revealed.has(i) || found.has(i));
    if (!m.visible) return;
    m.quaternion.copy(camera.quaternion);
    const pop = m.userData.popAt ? Math.max(0, 1 - (time - m.userData.popAt) / 600) : 0;   // little bounce when revealed
    m.scale.setScalar(base * (m.userData.hover ? 1.25 : 1) * (openIndex === i ? 1.2 : 1) * (1 + 0.8 * Math.sin(pop * Math.PI)));
    m.userData.halo.material.opacity = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(time * 0.004 + i));
  });
  if (ruler && ruler.visible) ruler.userData.labels.forEach((l) => l.quaternion.copy(camera.quaternion));
}

// ═════════════ clue mode ════════════════════════════════════════
// Dots stay hidden; one clue at a time. Pointing near the right spot uncovers the dot.
function currentClue() { if (!S.clues) return -1; for (let i = 0; i < DOTS.length; i++) if (!found.has(i)) return i; return -1; }
function reveal(i) {
  if (revealed.has(i)) return;
  revealed.add(i); markers[i].userData.popAt = performance.now();
}
// is this ray pointing close to the current clue's spot (on the side facing the student)?
function rayNearClue(ray) {
  const i = currentClue(); if (i < 0) return -1;
  const d = DOTS[i];
  const P = d._p.clone().applyMatrix4(root.matrixWorld);
  const N = d._n.clone().transformDirection(root.matrixWorld);
  if (N.dot(ray.origin.clone().sub(P)) <= 0) return -1;            // that spot faces away
  const r = Math.max(0.07, (d.clueRadius || 0.2) * sizeScale());   // metres (exhibit.json can set clueRadius per dot)
  return ray.distanceToPoint(P) < r ? i : -1;
}
function refreshClue() {
  const i = currentClue(), tt = t();
  const show = S.clues && i >= 0 && root.visible;
  const tuck = show && openIndex !== -1 && mode !== 'desktop';   // hide the clue while a panel is being read
  if (show) clueCard.set({ label: tt.clueOf(i + 1, DOTS.length), text: L(DOTS[i].clue, S.lang), hint: tt.hint });
  clueCard.mesh.visible = show && !tuck;
  const el = $('clue');
  el.hidden = !show || mode !== 'desktop';
  if (show) { $('clue-label').textContent = tt.clueOf(i + 1, DOTS.length); $('clue-text').textContent = L(DOTS[i].clue, S.lang);
    $('clue-hint').textContent = tt.hint; $('clue-help').textContent = tt.clueHelp; }
}
function useHint() { const i = currentClue(); if (i >= 0) reveal(i); }
$('clue-hint').onclick = useHint;

// ═════════════ opening a dot ════════════════════════════════════
function openInfo(i) {
  const n = DOTS.length;
  if (pendingFinish) { pendingFinish = false; return showFinish(); }
  i = ((i % n) + n) % n;
  if (openIndex !== i) { stopAudio(); expanded = false; }
  openIndex = i;
  if (tracking() && !found.has(i)) {
    found.add(i); revealed.add(i); refreshMarkerLooks(); refreshTracker(); refreshClue();
    if (found.size === n && !finishShown) pendingFinish = true;
  }
  if (ruler) ruler.visible = DOTS[i].id === 'height' || DOTS[i].extra === 'height';
  options.mesh.visible = false;
  refreshInfo(true);
}

function infoState() {
  if (openIndex === 'finish') {
    const f = EX.finish;
    return { dot: { title: f.title, text: f.text, think: f.think }, lang: S.lang, badge: '★', single: true,
      hasAudio: hasAudio('finish'), playing, hasMore: false, expanded: false };
  }
  const d = DOTS[openIndex];
  return {
    dot: d, index: openIndex, lang: S.lang, expanded, playing, found: tracking() && found.has(openIndex), single: S.clues,
    hasAudio: hasAudio(openIndex), hasMore: !!(d.more || (d.law && d.law.original)),
    lawCredit: EX.lawCredit, credit: d.id === 'height' ? L(EX.model.credit, S.lang) : '',
  };
}

function refreshInfo(reposition = false) {
  if (openIndex === -1) return;
  if (mode === 'desktop') return showCard();
  panel.show(infoState());
  const d = openIndex === 'finish' ? null : DOTS[openIndex];
  if (d && (d.extra === 'map' || d.extra === 'signs')) extra.showCanvas(extraCanvas(d.extra));
  else extra.mesh.visible = false;
  layoutRigChildren();
  if (reposition) placeRig(d && markers[openIndex] ? markers[openIndex].position : null, true);
  else tuckToolbar(false);
  refreshClue();
}

const extraCache = {};
function extraCanvas(kind) {
  const key = kind + S.lang;
  if (!extraCache[key]) {
    const c = document.createElement('canvas'); c.width = 1000; c.height = kind === 'map' ? 760 : 560;
    if (kind === 'map') drawMap(c, S.lang); else drawSigns(c, S.lang, hasCuneiformFont);
    extraCache[key] = c;
  }
  return extraCache[key];
}

// ── panel layout ─────────────────────────────────────────────
// Panels go to a "reading spot" about 0.85 m in front of the student (never measured from the stone),
// pushed sideways if that spot would be inside the stone. The picture sits beside the reading panel,
// and the toolbar tucks underneath, so nothing overlaps.
const sizeOf = (p) => ({ w: p.mW, h: p.mW * p.usedH / p.canvas.width });
function layoutRigChildren() {
  const ps = sizeOf(panel);
  if (extra.mesh.visible) {
    const es = sizeOf(extra), gap = 0.03, T = es.w + ps.w + gap;
    panel.mesh.position.set(T / 2 - ps.w / 2, 0, 0);
    extra.mesh.position.set(-T / 2 + es.w / 2, (ps.h - es.h) / 2, 0.05);
    extra.mesh.rotation.set(0, 0.22, 0);
  } else panel.mesh.position.set(0, 0, 0);
  panel.mesh.rotation.set(0, 0, 0);
}
// how far a point is outside the stone (negative = inside it)
function stoneClearance(pt) {
  if (!model) return 1;
  const b = model.userData.box, k = root.scale.x;
  const r = (Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2) * k + 0.05;
  if (pt.y > root.position.y + model.userData.height * k + 0.1) return 1;
  return Math.hypot(pt.x - root.position.x, pt.z - root.position.z) - r;
}
function readingSpot(aimAt, halfW) {
  const C = camera.position.clone();
  // mostly where the student is looking, partly toward the dot they opened
  let dir = headForward();
  if (aimAt) { const td = aimAt.clone().sub(C).setY(0); if (td.lengthSq() > 1e-4) dir.multiplyScalar(0.6).addScaledVector(td.normalize(), 0.4); }
  dir.normalize();
  if (aimAt && halfW < 0.5) dir.applyAxisAngle(UP, -0.12);   // nudge right so the dot itself stays in view
  const pref = halfW > 0.5 ? 0.95 : 0.85;
  // Stay in view (at most ~17° off to either side). Use the direction that lets the panel sit
  // furthest out while still in front of the stone; if the student is hugging the stone,
  // keep it close (0.45 m) anyway — panels draw on top, so they stay readable.
  let best = null;
  for (const ang of [0, -0.3, 0.3]) {
    const v = dir.clone().applyAxisAngle(UP, ang);
    const right = new THREE.Vector3().crossVectors(v, UP).normalize();
    for (let d = pref; d >= 0.449; d -= 0.05) {
      const p = C.clone().addScaledVector(v, d);
      if ([-1, -0.5, 0, 0.5, 1].every((t) => stoneClearance(p.clone().addScaledVector(right, t * halfW)) > 0)) {
        if (!best || d > best.d + 0.12) best = { p, d, pref };   // only turn sideways if it helps a lot
        break;
      }
    }
  }
  return best || { p: C.clone().addScaledVector(dir, 0.45), d: 0.45, pref };
}
let rigGoal = null, rigAway = 0;
function placeRig(aimAt, instant) {
  const ps = sizeOf(panel);
  const halfW = extra.mesh.visible ? (ps.w + sizeOf(extra).w + 0.03) / 2 : ps.w / 2;
  const spot = readingSpot(aimAt, halfW);
  const k = spot.d / spot.pref;               // closer panels shrink, so they look the same size
  rig.scale.setScalar(k);
  const goal = spot.p;
  goal.y = Math.max(camera.position.y - 0.15 * k, (ps.h * k) / 2 + 0.12);
  rigAway = 0;
  if (instant) { rigGoal = null; rig.position.copy(goal); rig.lookAt(camera.position.x, goal.y, camera.position.z); }
  else rigGoal = goal;
  tuckToolbar(instant);
}
// toolbar (with its tracker) sits just below the open panel
function tuckGoal() {
  const ps = sizeOf(panel);
  const C = camera.position;
  const toUser = C.clone().sub(rig.position).setY(0).normalize();
  const k = rig.scale.x;
  return rig.position.clone().addScaledVector(toUser, 0.06 * k).setY(rig.position.y - (ps.h / 2 + 0.19) * k);
}
function tuckToolbar(instant) {
  if (!panel.mesh.visible || !toolbar.mesh.visible) return;
  toolbar.mesh.scale.setScalar(rig.scale.x);
  toolbarGoal = tuckGoal();
  if (instant) { toolbar.mesh.position.copy(toolbarGoal); toolbar.mesh.lookAt(camera.position); toolbarGoal = null; }
}
// if the student walks away or turns around, the open panel glides back in front of them
function followRig(dt) {
  if (!panel.mesh.visible) { rigGoal = null; rigAway = 0; return; }
  const C = camera.position, fwd = headForward();
  const to = rig.position.clone().sub(C).setY(0);
  const dist = to.length();
  const off = dist > 0.01 && fwd.dot(to.normalize()) < Math.cos(THREE.MathUtils.degToRad(60));
  rigAway = (dist > 1.6 || off) && !rigGoal ? rigAway + dt : 0;
  if (rigAway > 1.2) placeRig(null, false);
  if (rigGoal) {
    rig.position.lerp(rigGoal, 1 - Math.exp(-dt * 5));
    rig.lookAt(C.x, rig.position.y, C.z);
    toolbarGoal = tuckGoal();
    if (rig.position.distanceTo(rigGoal) < 0.01) rigGoal = null;
  }
}

function closeInfo() {
  stopAudio();
  openIndex = -1; expanded = false;
  panel.hide(); extra.mesh.visible = false; $('card').hidden = true; rigGoal = null;
  if (DOTS.length) refreshClue();
  if (ruler) ruler.visible = false;
  if (pendingFinish) { pendingFinish = false; showFinish(); }
}
function showFinish() {
  finishShown = true; openIndex = 'finish'; expanded = false;
  if (ruler) ruler.visible = false;
  refreshInfo(true);
}

// ── desktop card (HTML) ──
function showCard() {
  const st = infoState(), d = st.dot, tt = t();
  const card = $('card'); card.hidden = false;
  $('card-num').textContent = st.badge ?? st.index + 1;
  $('card-num').classList.toggle('found', !!st.found);
  $('card-title').textContent = L(d.title, S.lang);
  $('card-body').textContent = L(d.text, S.lang);
  const facts = $('card-facts'); facts.innerHTML = '';
  (d.facts || []).forEach((f) => { const dt = document.createElement('dt'); dt.textContent = L(f.k, S.lang);
    const dd = document.createElement('dd'); dd.textContent = L(f.v, S.lang); facts.append(dt, dd); });
  facts.hidden = !d.facts;
  $('card-law').hidden = !d.law;
  if (d.law) { $('card-plain-label').textContent = tt.plain; $('card-plain').textContent = L(d.law.plain, S.lang); }
  const ex = $('card-extra'); ex.innerHTML = '';
  if (d.extra === 'map' || d.extra === 'signs') { const c = extraCanvas(d.extra); const img = new Image(); img.src = c.toDataURL(); img.alt = ''; ex.append(img); }
  ex.hidden = !ex.childElementCount;
  const more = $('card-more'); more.hidden = !st.expanded;
  $('card-more-text').textContent = L(d.more, S.lang); $('card-more-text').hidden = !d.more;
  $('card-orig').hidden = !(d.law && d.law.original);
  if (d.law && d.law.original) {
    $('card-orig-label').textContent = tt.original;
    $('card-orig-text').textContent = '“' + d.law.original + '”';
    $('card-orig-src').textContent = `— ${L(d.law.source, S.lang)}, ${L(EX.lawCredit, S.lang)}`;
  }
  $('card-credit').textContent = st.credit || ''; $('card-credit').hidden = !st.credit;
  $('card-think-label').textContent = tt.think;
  $('card-think').textContent = L(d.think, S.lang);
  $('card-listen').hidden = !st.hasAudio; $('card-listen').textContent = playing ? tt.stop : tt.listen;
  $('card-moreBtn').hidden = !st.hasMore; $('card-moreBtn').textContent = st.expanded ? tt.less : tt.more;
  $('card-prev').hidden = $('card-next').hidden = !!st.single;
  $('card-prev').textContent = tt.back; $('card-next').textContent = tt.next; $('card-close').textContent = tt.close;
}
$('card-close').onclick = closeInfo;
$('card-prev').onclick = () => openInfo(openIndex - 1);
$('card-next').onclick = () => openInfo(openIndex + 1);
$('card-listen').onclick = () => toggleAudio(openIndex);
$('card-moreBtn').onclick = () => { expanded = !expanded; refreshInfo(); };

// ═════════════ tracker / toolbar / options ═══════════════════════
function refreshTracker() {
  const n = DOTS.length;
  tracker.set(found, n, S.lang);
  tracker.mesh.visible = tracking();
  const el = $('tracker');
  el.hidden = !tracking() || mode !== 'desktop';
  $('help').hidden = mode !== 'desktop' || !el.hidden;   // the tracker takes the help line's spot
  el.innerHTML = '';
  const label = document.createElement('span'); label.textContent = t().found(found.size, n); el.append(label);
  for (let i = 0; i < n; i++) { const b = document.createElement('b'); b.textContent = found.has(i) ? '✓' : i + 1; if (found.has(i)) b.className = 'on'; el.append(b); }
}
function refreshToolbar() {
  const items = ['left', 'right'];
  if (!S.lock) { items.push('move', 'options', 'exit'); }
  else if (S.mode === 'walk' && S.size === 'life') items.push('move');
  toolbar.set(items, S.lang);
}

function onToolbar(id) {
  if (!id) return;
  if (id === 'left') root.rotation.y += Math.PI / 8;
  if (id === 'right') root.rotation.y -= Math.PI / 8;
  if (id === 'move') { if (S.mode === 'seated') placeSeated(); else startPlacing(); }
  if (id === 'options') openOptions();
  if (id === 'exit') renderer.xr.getSession()?.end();
}

function openOptions() {
  closeInfo();
  options.show(S);
  const os = sizeOf(options);
  const spot = readingSpot(null, os.w / 2), k = spot.d / spot.pref, p = spot.p;
  options.mesh.scale.setScalar(k);
  p.y = Math.max(camera.position.y - 0.12 * k, (os.h * k) / 2 + 0.12);
  options.mesh.position.copy(p);
  options.mesh.lookAt(camera.position.x, p.y, camera.position.z);
}
function onOptions(id) {
  if (!id) return;
  if (id === 'done') { options.mesh.visible = false; return; }
  const [k, v] = id.split(':');
  setSetting(k, BOOL_KEYS.includes(k) ? v === 'on' : v);
  options.show(S);
}

// One place where every setting change goes (Options menu, start screen, or later the teacher console)
function setSetting(k, v) {
  if (S[k] === v) return;
  S[k] = v;
  if (k === 'lang') {
    stopAudio(); setRulerLabels(); refreshStartScreen(); refreshInfo(); if (placing) startPlacing(true);
  }
  if (k === 'hunt' || k === 'clues') { refreshMarkerLooks(); if (k === 'clues') closeInfo(); }
  if (k === 'size') {
    root.scale.setScalar(sizeScale());
    if (renderer.xr.isPresenting) { if (S.mode === 'seated' || mode === 'vr') placeSeated(); else startPlacing(); }
  }
  if (k === 'mode' && renderer.xr.isPresenting) {
    if (S.mode === 'seated') placeSeated(); else if (mode === 'ar') startPlacing(); else layoutToolbar();
  }
  if (k === 'lock') refreshStartScreen();
  refreshToolbar(); refreshTracker(); refreshClue(); refreshStartScreen();
}

// ═════════════ placement ════════════════════════════════════════
function faceUser() {
  const C = camera.position;
  root.rotation.set(0, Math.atan2(C.x - root.position.x, C.z - root.position.z), 0);
}
function headForward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize(); }

// seated: stand the stone up in front of the student without pointing
function placeSeated() {
  placing = false; reticle.visible = false; hint.mesh.visible = false;
  const d = S.size === 'table' ? 0.8 : 1.6;
  root.position.copy(camera.position).setY(S.size === 'table' ? Math.max(0, camera.position.y - 0.75) : 0).addScaledVector(headForward(), d);
  faceUser(); root.visible = true; syncPool(); layoutToolbar(); refreshClue(); runPendingDot();
}
function startPlacing(textOnly = false) {
  if (!textOnly) { placing = true; closeInfo(); options.mesh.visible = false; }
  hint.setText(S.size === 'table' ? t().placeTable : t().placeWalk);
  hint.mesh.visible = placing;
}
function finishPlacing(target) {
  placing = false; reticle.visible = false; hint.mesh.visible = false;
  root.position.copy(target); faceUser(); root.visible = true; syncPool(); layoutToolbar(); refreshClue(); runPendingDot();
}

function layoutToolbar() {
  toolbar.mesh.scale.setScalar(1);
  toolbarGoal = null; awayTime = 0;
  const C = camera.position.clone(), fwd = headForward();
  const left = new THREE.Vector3().crossVectors(UP, fwd).normalize();
  if (S.mode === 'seated' || placing) {
    toolbar.mesh.position.copy(C).addScaledVector(fwd, 0.85).addScaledVector(left, 0.1).setY(C.y - 0.55);
  } else {
    const S0 = root.position.clone();
    const toUser = C.clone().sub(S0).setY(0);
    const dist = toUser.length(); toUser.normalize();
    const l2 = new THREE.Vector3().crossVectors(UP, toUser.clone().negate()).normalize();
    const small = S.size === 'table';
    toolbar.mesh.position.copy(S0).addScaledVector(toUser, Math.min(dist * 0.6, small ? 0.45 : 1.0)).addScaledVector(l2, small ? 0 : 0.62);
    toolbar.mesh.position.y = small ? Math.max(S0.y + 0.12, 0.55) : 0.95;
  }
  toolbar.mesh.lookAt(C);
}

// toolbar comes back to the student when they walk away from it
let awayTime = 0, toolbarGoal = null;
function followToolbar(dt) {
  if (!toolbar.mesh.visible || placing) { awayTime = 0; toolbarGoal = null; return; }
  if (panel.mesh.visible) {   // tucked under the open panel
    awayTime = 0;
    if (toolbarGoal) { toolbar.mesh.position.lerp(toolbarGoal, 1 - Math.exp(-dt * 6)); toolbar.mesh.lookAt(camera.position);
      if (toolbar.mesh.position.distanceTo(toolbarGoal) < 0.01) toolbarGoal = null; }
    return;
  }
  const C = camera.position, fwd = headForward();
  const toBar = toolbar.mesh.position.clone().sub(C).setY(0);
  const dist = toBar.length();
  const behind = dist > 0.01 && fwd.dot(toBar.normalize()) < -0.2;
  awayTime = (dist > 2.0 || behind) && !toolbarGoal ? awayTime + dt : 0;
  if (awayTime > 1.5) {
    awayTime = 0;
    const left = new THREE.Vector3().crossVectors(UP, fwd).normalize();
    toolbarGoal = C.clone().addScaledVector(fwd, 0.75).addScaledVector(left, 0.2).setY(C.y - 0.5);
    toolbar.mesh.scale.setScalar(1);
  }
  if (toolbarGoal) {
    toolbar.mesh.position.lerp(toolbarGoal, 1 - Math.exp(-dt * 5));
    toolbar.mesh.lookAt(C);
    if (toolbar.mesh.position.distanceTo(toolbarGoal) < 0.01) toolbarGoal = null;
  }
}

// ═════════════ controllers & hands ═══════════════════════════════
const controllers = [];
const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i);
  const line = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }));
  line.scale.z = 3; c.add(line);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
  dot.visible = false; scene.add(dot);
  c.userData = { line, dot, src: null, hitSrc: null, target: null };
  c.addEventListener('connected', (e) => onConnected(c, e.data));
  c.addEventListener('disconnected', () => {
    c.userData.hitSrc?.cancel?.(); c.userData.hitSrc = null; c.userData.src = null;
    if (activeCtrl === c) activeCtrl = null;
  });
  c.addEventListener('selectstart', () => { activeCtrl = c; });
  c.addEventListener('select', () => onSelect(c));
  scene.add(c); controllers.push(c);
}
function onConnected(c, src) {
  c.userData.src = src;
  c.userData.line.visible = src.targetRayMode === 'tracked-pointer';
  if (!activeCtrl || src.handedness === 'right') activeCtrl = c;
  const session = renderer.xr.getSession();
  if (mode === 'ar' && session?.requestHitTestSource) {
    session.requestHitTestSource({ space: src.targetRaySpace }).then((h) => { c.userData.hitSrc = h; }).catch(() => {});
  }
}
function setRayFrom(c) {
  tmpM.identity().extractRotation(c.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
  raycaster.far = 10;
}
function uiTargets() {
  const out = [];
  for (const p of [options, panel, toolbar]) if (p.mesh.visible) out.push(p.mesh);
  if (toolbar.mesh.visible && clueCard.mesh.visible && !options.mesh.visible) out.push(clueCard.mesh);
  if (!options.mesh.visible) for (const m of markers) if (m.visible) out.push(m);
  return out;
}
function uiHit(c) { setRayFrom(c); return raycaster.intersectObjects(uiTargets(), false)[0] || null; }

function onSelect(c) {
  if (!renderer.xr.isPresenting || frozen) return;
  const hit = uiHit(c);
  if (hit) {
    const o = hit.object;
    if (o === options.mesh) return onOptions(options.buttonAt(hit.uv));
    if (o === toolbar.mesh) return onToolbar(toolbar.buttonAt(hit.uv));
    if (o === panel.mesh) return onPanelButton(panel.buttonAt(hit.uv));
    if (o === clueCard.mesh) { if (clueCard.buttonAt(hit.uv) === 'hint') useHint(); return; }
    if (o.userData.index !== undefined) return openInfo(o.userData.index);
  }
  if (placing && c.userData.target) return finishPlacing(c.userData.target.clone());
  if (S.clues && !panel.mesh.visible) { setRayFrom(c); const i = rayNearClue(raycaster.ray); if (i >= 0) { reveal(i); openInfo(i); } }
}
function onPanelButton(id) {
  if (id === 'close') closeInfo();
  else if (id === 'next') openInfo(openIndex + 1);
  else if (id === 'prev') openInfo(openIndex - 1);
  else if (id === 'listen') toggleAudio(openIndex);
  else if (id === 'more') { expanded = !expanded; refreshInfo(); }
}

function findTarget(c, frame) {
  const ref = renderer.xr.getReferenceSpace();
  if (frame && c.userData.hitSrc && ref) {
    for (const r of frame.getHitTestResults(c.userData.hitSrc)) {
      const pose = r.getPose(ref); if (!pose) continue;
      tmpM.fromArray(pose.transform.matrix);
      if (new THREE.Vector3(0, 1, 0).transformDirection(tmpM).y > 0.85) return new THREE.Vector3().setFromMatrixPosition(tmpM);
    }
  }
  setRayFrom(c);
  const { origin, direction } = raycaster.ray;
  if (direction.y < -0.05) { const d = -origin.y / direction.y; if (d > 0 && d < 8) return origin.clone().addScaledVector(direction, d); }
  return null;
}

function xrUpdate(frame, dt) {
  xrFrames++;
  if (needsLayout && xrFrames > 3) {
    needsLayout = false;
    if (S.mode === 'seated') placeSeated();
    else if (mode === 'vr') { root.position.copy(camera.position).setY(0).addScaledVector(headForward(), 2.0); faceUser(); syncPool(); layoutToolbar(); }
    else { startPlacing(); layoutToolbar(); }
  }
  for (const c of controllers) {
    const u = c.userData;
    if (!u.src) { u.dot.visible = false; u.uiHit = null; continue; }
    const hit = uiHit(c);
    u.line.scale.z = hit ? hit.distance : 3; u.dot.visible = !!hit; if (hit) u.dot.position.copy(hit.point);
    u.uiHit = hit;
  }
  if (S.clues && !placing) for (const c of controllers) { if (!c.userData.src) continue; setRayFrom(c); const i = rayNearClue(raycaster.ray); if (i >= 0) reveal(i); }
  const hits = controllers.map((c) => c.userData.uiHit).filter(Boolean);
  for (const m of markers) m.userData.hover = hits.some((h) => h.object === m);
  for (const p of [toolbar, panel, options]) {
    if (!p.mesh.visible) continue;
    const h = hits.find((x) => x.object === p.mesh);
    p.setHover(h ? p.buttonAt(h.uv) : null);
  }
  if (placing) {
    const c = activeCtrl?.userData.src ? activeCtrl : controllers.find((x) => x.userData.src);
    for (const x of controllers) x.userData.target = x.userData.src ? findTarget(x, frame) : null;
    const target = c?.userData.target;
    reticle.visible = !!target;
    if (target) {
      reticle.position.copy(target).y += 0.004; reticle.scale.setScalar(S.size === 'table' ? 0.5 : 1);
      root.visible = true; root.position.copy(target); faceUser();
    }
    hint.mesh.position.copy(camera.position).addScaledVector(headForward(), 1.1).setY(camera.position.y + 0.12);
    hint.mesh.lookAt(camera.position);
  } else {
    for (const c of controllers) {
      const gp = c.userData.src?.gamepad;
      const x = gp && gp.axes.length >= 4 ? gp.axes[2] : 0;
      if (Math.abs(x) > 0.25) root.rotation.y -= x * dt * 1.4;
    }
  }
  followRig(dt);
  followToolbar(dt);
  if (frozen) {   // keep the teacher's message in front of the student
    const goal = camera.position.clone().addScaledVector(headForward(), 1.2).setY(camera.position.y - 0.05);
    freezePanel.mesh.position.lerp(goal, xrFrames < 5 ? 1 : 1 - Math.exp(-dt * 4));
    freezePanel.mesh.lookAt(camera.position);
  }
}

// ═════════════ desktop mouse ════════════════════════════════════
const pointer = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (mode !== 'desktop' || !downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
  if (moved > 6) return;
  const m = pickMarker(e); if (m) return openInfo(m.userData.index);
  if (S.clues) { const i = rayNearClue(raycaster.ray); if (i >= 0) { reveal(i); openInfo(i); } }   // tap near the spot (iPad)
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (mode !== 'desktop') return;
  const m = pickMarker(e);
  markers.forEach((x) => (x.userData.hover = x === m));
  if (S.clues) { const i = rayNearClue(raycaster.ray); if (i >= 0) reveal(i); }
  renderer.domElement.style.cursor = m ? 'pointer' : 'grab';
});
function pickMarker(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(markers.filter((m) => m.visible), false)[0];
  return hit ? hit.object : null;
}

// ═════════════ sessions ═════════════════════════════════════════
async function enterXR(type) {
  if (renderer.xr.isPresenting) return;
  const init = type === 'ar'
    ? { requiredFeatures: ['local-floor'], optionalFeatures: ['hit-test', 'hand-tracking'] }
    : { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] };
  try {
    const session = await navigator.xr.requestSession(type === 'ar' ? 'immersive-ar' : 'immersive-vr', init);
    mode = type;
    session.addEventListener('end', onSessionEnd);
    await renderer.xr.setSession(session);
    onSessionStart();
  } catch (e) {
    console.error(e); mode = 'desktop';
    setStatus(`${type === 'ar' ? 'Passthrough' : 'VR'}: ${e.message || e}`);
  }
}
function onSessionStart() {
  $('overlay').hidden = true; $('card').hidden = true; $('help').hidden = true; $('tracker').hidden = true; $('clue').hidden = true; $('freeze').hidden = true;
  controls.enabled = false;
  closeInfo(); options.mesh.visible = false;
  root.scale.setScalar(sizeScale());
  toolbar.mesh.visible = true; refreshToolbar(); refreshTracker();
  if (mode === 'ar') {
    scene.background = null; scene.fog = null; gallery.visible = false;
    renderer.setClearColor(0x000000, 0);
    root.visible = false;
  } else {
    scene.background = BG; scene.fog = FOG; gallery.visible = true; root.visible = true;
  }
  placing = false; hint.mesh.visible = false;
  needsLayout = true; xrFrames = 0;
}
function onSessionEnd() {
  mode = 'desktop'; placing = false;
  scene.background = BG; scene.fog = FOG; gallery.visible = true;
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.setScalar(1); root.visible = true; syncPool();
  toolbar.mesh.visible = false; hint.mesh.visible = false; reticle.visible = false; options.mesh.visible = false;
  closeInfo();
  controls.enabled = true;
  camera.position.copy(DESK_CAM); camera.quaternion.identity();
  controls.target.set(0, 1.15, 0); controls.update();
  onResize();
  $('overlay').hidden = false; $('help').hidden = false;
  refreshTracker(); refreshClue(); $('freeze').hidden = !frozen;
}

// ═════════════ teacher console (optional, read-only) ═════════════
// Settings sent from the teacher's Chromebook. Only *changes* are applied, so a student's own
// Options choice stays until the teacher changes that same setting.
const ROOM = (params.get('room') || '').toLowerCase();
let roomStatus = null, lastRemote = {}, lastDotAt = 0, pendingDot = -1;
function applyRemote(r) {
  const changed = (k) => r[k] !== undefined && r[k] !== lastRemote[k];
  if (changed('exhibit') && r.exhibit !== EX.id && (EX.index.exhibits || []).some((e) => e.id === r.exhibit)) {
    const p = new URLSearchParams(location.search); p.set('exhibit', r.exhibit); location.search = p.toString(); return;
  }
  if (changed('lang')) setSetting('lang', r.lang);
  if (changed('progress')) setSetting('hunt', r.progress);
  if (changed('detective')) setSetting('clues', r.detective);
  if (changed('mode')) setSetting('mode', r.mode);
  if (changed('size')) setSetting('size', r.size);
  if (changed('lock')) { setSetting('lock', r.lock); if (r.lock) options.mesh.visible = false; }
  lastRemote = { ...r };
  if (r.dot && r.dotAt > lastDotAt) { lastDotAt = r.dotAt; pendingDot = r.dot - 1; runPendingDot(); }
  setFrozen(r.freeze || null);
}
function runPendingDot() {
  const i = pendingDot;
  if (i < 0 || i >= DOTS.length || frozen) return;
  if (renderer.xr.isPresenting && (placing || !root.visible)) return;   // try again once the stone is placed
  pendingDot = -1;
  if (S.clues) reveal(i);
  openInfo(i);
}
function setFrozen(kind) {
  if (kind === frozen) return;
  frozen = kind;
  if (kind) {
    stopAudio();
    const tt = t();
    freezePanel.set(tt.freezeFrom, tt.freeze[kind]);
    $('freeze-from').textContent = tt.freezeFrom; $('freeze-text').textContent = tt.freeze[kind];
  }
  $('freeze').hidden = !kind || renderer.xr.isPresenting;
  if (!kind) runPendingDot();
}

// ═════════════ start screen ═════════════════════════════════════
let xrSupport = { ar: false, vr: false, checked: false };
function setStatus(s) { $('status').textContent = s; }
function refreshStartScreen() {
  if (!EX) return;
  const tt = t();
  document.documentElement.lang = S.lang;
  document.title = L(EX.title, S.lang);
  $('title').textContent = L(EX.title, S.lang);
  $('subtitle').textContent = L(EX.subtitle, S.lang);
  $('btn-ar').textContent = tt.enterAR; $('btn-vr').textContent = tt.enterVR; $('btn-ql-label').textContent = tt.enterQL;
  $('help').textContent = matchMedia('(pointer: coarse)').matches ? tt.helpTouch : tt.help;
  $('settings').hidden = S.lock;
  document.querySelectorAll('[data-set]').forEach((b) => {
    const [k, v] = b.dataset.set.split(':');
    const cur = BOOL_KEYS.includes(k) ? (S[k] ? 'on' : 'off') : S[k];
    b.classList.toggle('sel', cur === v);
    b.textContent = { 'lang:en': 'English', 'lang:es': 'Español', 'hunt:on': tt.on, 'hunt:off': tt.off, 'clues:on': tt.on, 'clues:off': tt.off,
      'mode:walk': tt.walk, 'mode:seated': tt.seated }[b.dataset.set];
  });
  $('lbl-lang').textContent = tt.optLang; $('lbl-hunt').textContent = tt.optHunt; $('lbl-clues').textContent = tt.optClues; $('lbl-mode').textContent = tt.optMode;
  // exhibit picker (only if there is more than one)
  const pick = $('exhibit-pick');
  const list = EX.index.exhibits || [];
  pick.hidden = S.lock || list.length < 2;
  if (!pick.hidden && !pick.childElementCount) {
    for (const e of list) { const o = document.createElement('option'); o.value = e.id; o.textContent = L(e.title, S.lang); o.selected = e.id === EX.id; pick.append(o); }
    pick.onchange = () => { const p = new URLSearchParams(location.search); p.set('exhibit', pick.value); location.search = p.toString(); };
  }
  if (xrSupport.checked) {
    if (xrSupport.quickLook) setStatus(tt.ipad);
    else if (!window.isSecureContext) setStatus(tt.needHttps);
    else if (xrSupport.ar) setStatus(tt.ready);
    else if (xrSupport.vr) setStatus(tt.noAR);
    else setStatus(tt.desktop);
  }
  $('room-status').hidden = !ROOM;
  if (ROOM) $('room-status').textContent = tt.classroom(ROOM, roomStatus || 'connecting');
  if (frozen) { freezePanel.set(tt.freezeFrom, tt.freeze[frozen]); $('freeze-from').textContent = tt.freezeFrom; $('freeze-text').textContent = tt.freeze[frozen]; }
  if (openIndex !== -1 && mode === 'desktop') showCard();
  if (DOTS.length) refreshTracker();
}
document.querySelectorAll('[data-set]').forEach((b) => {
  b.onclick = () => { const [k, v] = b.dataset.set.split(':'); setSetting(k, BOOL_KEYS.includes(k) ? v === 'on' : v); };
});

// ═════════════ boot ═════════════════════════════════════════════
function onResize() {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

let lastT = 0;
renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(0.1, (time - lastT) / 1000 || 0); lastT = time;
  if (renderer.xr.isPresenting) xrUpdate(frame, dt); else controls.update();
  updateMarkers(time);
  if (frozen) freezeScene.background = mode === 'ar' ? null : BG;
  renderer.render(frozen ? freezeScene : scene, camera);
});

(async function boot() {
  setStatus(t().loading);
  try { await loadExhibit(); }
  catch (e) { console.error(e); setStatus('Could not load the exhibit: ' + (e.message || e)); return; }
  refreshToolbar(); refreshTracker(); refreshMarkerLooks(); refreshClue();
  $('btn-ar').onclick = () => enterXR('ar');
  $('btn-vr').onclick = () => enterXR('vr');
  if (window.isSecureContext && 'xr' in navigator) {
    const [ar, vr] = await Promise.all([
      navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
      navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
    ]);
    xrSupport = { ar, vr, checked: true };
  } else xrSupport.checked = true;
  $('btn-ar').disabled = !xrSupport.ar; $('btn-vr').disabled = !xrSupport.vr;
  // iPad / iPhone: Safari has no WebXR, but it can open a USDZ copy in Apple's AR Quick Look
  const ql = document.createElement('a').relList?.supports?.('ar');
  if (ql && EX.usdz && !xrSupport.ar) {
    xrSupport.quickLook = true;
    $('btn-ql').href = exPath(EX.usdz);
    $('btn-ql').hidden = false;
    $('btn-ar').hidden = true;
    $('btn-vr').hidden = !xrSupport.vr;
    document.querySelector('[data-set="mode:walk"]').closest('.row').hidden = true;   // not used on iPad
  }
  refreshStartScreen();
  if (ROOM) {
    import('./classroom.js')
      .then((m) => m.listen(ROOM, applyRemote, (st) => { roomStatus = st; refreshStartScreen(); }))
      .catch((e) => { console.warn('classroom', e); roomStatus = 'error'; refreshStartScreen(); });
  }
  window.__steleReady = true;
  // hooks for automated testing (harmless in normal use)
  window.__dbg = {
    THREE, camera, controls, root, markers, clueCard, applyRemote, freezePanel, isFrozen: () => frozen, rigState: () => ({ rigGoal: rigGoal && rigGoal.toArray(), rigAway, xrFrames }), currentClue, useHint, revealed, toolbar, panel, options, extra, tracker, S, setSetting, openInfo, closeInfo,
    state: () => ({ mode, placing, S: { ...S }, openIndex, expanded, found: [...found], finishShown, clue: currentClue(), revealed: [...revealed],
      panel: panel.mesh.visible, extra: extra.mesh.visible, options: options.mesh.visible, toolbarItems: toolbar.items,
      ruler: !!ruler?.visible, root: root.position.toArray().map((v) => +v.toFixed(2)), scale: +root.scale.x.toFixed(2),
      rotY: +root.rotation.y.toFixed(2), audio: { ...audioOK }, playing }),
  };
})();
