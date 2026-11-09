// MMUUSD Labs: Cannon Recoil Lab (Grade 6, Forces and Motion, MS-PS2-2).
// WebXR passthrough on Quest 3, with a preview on any screen. No student data: nothing is sent or saved.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { UI } from './i18n.js';
import { LabPanel, Loupe, moveKnobTexture, grabBarTexture } from './ui3d.js';
import { buildLab, MUZZLE, BACKSTOP_X, BALL_R, RULER_Z, RULER_CM, VENT, WHEEL_R } from './scene.js';
import { VARS, VAR_KEYS, DEFAULTS, level, shot, trial, challengeTarget, onTheLine, G } from './physics.js';
import { unlockAudio, boom } from './audio.js';
import { handGrabbing } from './grab.js';
import { configured as consoleOn } from './classroom.js';
import { GROUPS, DEFAULT_ROOM } from './firebase-config.js';
import { readHeadset, saveHeadset } from './headset.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const UP = new THREE.Vector3(0, 1, 0);
const flag = (v, def) => (v == null ? def : !/^(0|off|false|no)$/i.test(v));

// ═════════════ settings (from the ArborXR link, then the student's own choices) ═════════════
// ?lang=en|es  ?sizes=desk,half,life  ?size=desk  ?lock=ball|cannon|powder|wheels  ?text=big  ?calm=on  ?number=on  ?fire=button  ?start=plan  ?debug=1
const SIZE_SCALE = { desk: 1 / 7, half: 0.5, life: 1 };
const allowed = (params.get('sizes') || 'desk,half,life').split(',').map((s) => s.trim()).filter((s) => s in SIZE_SCALE);
let SIZES = allowed.length ? allowed : ['desk'];
const S = {
  lang: params.get('lang') === 'es' ? 'es' : 'en',
  size: SIZES.includes(params.get('size')) ? params.get('size') : SIZES[0],
  lock: VAR_KEYS.includes(params.get('lock')) ? params.get('lock') : null,
  big: params.get('text') === 'big',
  calm: flag(params.get('calm'), matchMedia('(prefers-reduced-motion: reduce)').matches),
  num: flag(params.get('number'), false),
  lanyard: params.get('fire') !== 'button',
};
const DEBUG = params.get('debug') === '1';
// what the link asked for: the teacher console can change these, and "Default" on the console brings them back
const LINK = { ...S, sizes: [...SIZES], path: params.get('path') === 'full' ? 'full' : 'guided', start: params.get('start') === 'plan' ? 'plan' : 'try' };
const T = () => UI[S.lang];
const labScale = () => SIZE_SCALE[S.size];

// ═════════════ renderer / scene ═════════════
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const BG = new THREE.Color(0x24211d);
scene.background = BG;
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.02, 80);
scene.add(camera);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 1.5; controls.maxDistance = 14;
// preview/VR floor
const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4d5a3a, roughness: 1 }));
ground.position.y = -0.002; scene.add(ground);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));

const L = buildLab((f) => { const s = $('status'); if (s && f < 1) s.textContent = `${Math.round(f * 100)}%`; });
const lab = L.lab; scene.add(lab);
let model = null, wheels = null;

// ═════════════ panels ═════════════
const panel = new LabPanel(); scene.add(panel.mesh); panel.mesh.renderOrder = 32;
const hint = new LabPanel(400); hint.mesh.visible = false; scene.add(hint.mesh); hint.mesh.renderOrder = 33;
const loupe = new Loupe(); scene.add(loupe.mesh); loupe.mesh.renderOrder = 31;
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.15, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xd4af6a, transparent: true, opacity: 0.9, depthTest: false }));
reticle.renderOrder = 20; reticle.visible = false; scene.add(reticle);

// ═════════════ lab state ═════════════
// Two paths. The default is GUIDED: one sentence and one big button at a time, about 8 minutes, so students can work
// without constant help: Try it → which push was bigger? → compare two settings (predict, fire, record) → explain.
// The teacher switches on the full investigation (plan, 3 trials per level, table, challenge) with ?path=full.
let PATH = LINK.path;           // the teacher console can switch it (that starts the lab over)
let START = PATH === 'full' && LINK.start === 'plan' ? 'plan' : 'try';   // ?path=full&start=plan skips "Try it" and the 3rd-law question (day 2)
let frozen = null;             // a message from the teacher console: eyes | wait | remove | done | paused
let phase = START;             // try | q3 | watch | answer | plan | test | explain | challenge
let confirmRestart = false;
let optionsOpen = false;
let q3Answer = null;
let settings = { ...DEFAULTS };
let planKey = S.lock;          // the variable being tested
const test = { levelIdx: 0, data: {}, predCm: null, predFor: null, arrows: false };
// guided comparison: two shots, the lightest and heaviest setting of one variable (the cannon unless the link locks another)
const GD = { key: S.lock || 'cannon', i: 0, results: [] };
const gLevels = () => { const ls = VARS[GD.key]; return [ls[0], ls[ls.length - 1]]; };
const gLevel = () => gLevels()[GD.i];
const gSettings = () => ({ ...DEFAULTS, [GD.key]: gLevel().id });
let awaitRecord = false;       // after a measured shot: "Record your results"; the next shot waits for "I recorded it"
const ch = { target: null, last: null, result: null };
let lastShot = null;           // the most recent shot (for slow motion)
let rand = Math.random;        // tests can swap in a repeatable one
let anim = null;               // { kind: 'live'|'replay', t, rec, playing }
let triesFired = 0;
let mode = 'desktop';          // desktop | ar | vr
let placing = false, needsLayout = false, xrFrames = 0;

const levels = (k) => VARS[k];
const curLevel = () => levels(planKey)[test.levelIdx];
const rows = () => test.data;
const countFor = (id) => (rows()[id] || []).length;
const allRowsDone = () => planKey && levels(planKey).every((l) => countFor(l.id) >= 3);
function settingsForTest() { const s = { ...DEFAULTS }; if (planKey) s[planKey] = curLevel().id; return s; }
const predKey = () => (phase === 'test' ? curLevel().id : phase === 'gcomp' ? 'g' + GD.i : null);   // which shot the flag belongs to
const predicted = () => predKey() !== null && test.predFor === predKey();
const canPredict = () => !awaitRecord && ((phase === 'test' && countFor(curLevel().id) < 3) || (phase === 'gcomp' && GD.results.length === GD.i));
function canFireNow() {   // the shot that's allowed right now (the lanyard only shows when it is)
  if (awaitRecord || frozen) return false;
  if (phase === 'try' || phase === 'challenge') return true;
  if (phase === 'test') return predicted() && countFor(curLevel().id) < 3;
  if (phase === 'gcomp') return predicted() && GD.results.length === GD.i;
  return false;
}

// ═════════════ the panel: what it shows in each phase ═════════════
function panelSpec() {
  const t = T();
  if (optionsOpen) return optionsSpec();
  const kicker = t.labTitle;
  const busy = !!anim && anim.kind === 'live';
  if (anim && anim.kind === 'replay') return replaySpec();
  const fireRow = (enabled = true) => ({ row: [{ id: 'fire', label: triesFired ? t.fireAgain : t.fire, primary: true, disabled: busy || !enabled }], h: 96 });
  const optRow = { row: [{ id: 'options', label: '⚙ ' + t.options, w: 1 }], h: 70, after: 0 };
  switch (phase) {
    case 'try': return { kicker, title: t.tryTitle, blocks: [...(mode === 'desktop' ? [{ p: t.tryBodyScreen }] : S.lanyard ? [{ p: t.tryBody }] : []), { p: t.tryHint, style: 'dim' }, fireRow(), optRow] };
    case 'q3': return { kicker, title: t.q3Title, blocks: [{ p: t.q3Body },
      { row: [{ id: 'q3:ball', label: t.q3Ball }, { id: 'q3:cannon', label: t.q3Cannon }, { id: 'q3:same', label: t.q3Same }], h: 96 }, optRow] };
    case 'answer': return { kicker, title: q3Answer === 'same' ? t.ansRight : t.ansSurprise, blocks: [{ p: t.ansBody }, { p: t.ansThink, style: 'em' },
      { row: [{ id: 'replay', label: '⟲ ' + t.slowmo, w: 1 }, PATH === 'full' ? { id: 'toPlan', label: t.toPlan + ' ▶', primary: true, w: 1.4 } : { id: 'toCompare', label: t.gNext, primary: true, w: 1.4 }], h: 92 }, optRow] };
    case 'gcomp': return guidedSpec();
    case 'gexplain': return { kicker, title: t.gExplainTitle, blocks: [{ p: t.gExplainBody }, { p: t.gExplainWrite, style: 'dim' },
      { row: [{ id: 'replay', label: '⟲ ' + t.slowmo, w: 1, disabled: busy || !lastShot }, { id: 'gDone', label: t.gDoneBtn, primary: true, w: 1.4 }], h: 96 }, optRow] };
    case 'gdone': return { kicker, title: t.gDoneTitle, blocks: [{ p: t.gDoneBody }, { row: [{ id: 'again', label: '⟲ ' + t.tryAgain, primary: true }], h: 96 }, optRow] };
    case 'plan': return planSpec();
    case 'test': return testSpec();
    case 'explain': return { kicker, title: t.explainTitle, blocks: [{ p: t.explainBody }, { p: t.wordBank, style: 'label', after: 8 }, { chips: t.words }, { p: t.newQuestion, style: 'em' },
      { row: [{ id: 'testOther', label: t.testOther }, { id: 'challenge', label: t.challenge + ' ▶', primary: true }], h: 92 }, optRow] };
    case 'challenge': return challengeSpec();
  }
  return { kicker, title: '', blocks: [] };
}
function guidedSpec() {
  const t = T(), k = GD.key, lv = gLevel(), returning = anim && anim.kind === 'return';
  const blocks = [{ p: t.gShot(GD.i + 1, `${t.vars[k]}: ${t.levels[lv.id]}`), style: 'gold' }];
  const optRow = { row: [{ id: 'options', label: '⚙ ' + t.options }], h: 70, after: 0 };
  if (awaitRecord) {   // "Record your results", then one button
    const cm = Math.round(GD.results[GD.i]);
    blocks.push({ p: t.recBody(t.levels[lv.id]) });
    if (S.num) blocks.push({ p: t.recNum(cm), style: 'big' });
    blocks.push({ row: [{ id: 'recorded', label: t.recorded, primary: true }], h: 100 }, optRow);
    return { kicker: t.labTitle, title: t.recTitle, blocks };
  }
  if (GD.i === 1) blocks.push({ p: t.gChanged[k] });
  const screen = mode === 'desktop';
  if (returning) blocks.push({ p: t.rollingBack, style: 'em' });
  else if (!predicted()) blocks.push({ p: screen ? t.stepPredictScreen : t.stepPredict, style: 'em' });
  else blocks.push({ p: screen || !S.lanyard ? t.stepFireScreen : t.stepFire, style: 'em' });
  blocks.push({ row: [{ id: 'fire', label: t.fire, primary: true, disabled: !(predicted() && !(anim && anim.kind !== 'return')) }], h: 100 }, optRow);
  return { kicker: t.labTitle, title: t.gTitle[k], blocks };
}
function planSpec() {
  const t = T(), blocks = [];
  if (S.lock) blocks.push({ p: t.lockedAsk });
  else {
    blocks.push({ p: t.planAsk });
    blocks.push({ row: VAR_KEYS.map((k) => ({ id: 'plan:' + k, label: t.vars[k], sel: planKey === k })), h: 88 });
  }
  if (planKey) {
    const kept = VAR_KEYS.filter((k) => k !== planKey).map((k) => `${t.vars[k]}: ${t.levels[DEFAULTS[k]]}`);
    blocks.push({ kv: [[t.willChange, `${t.varsThe[planKey]} (${levels(planKey).map((l) => t.levels[l.id]).join(', ')})`], [t.willMeasure, t.measureWhat], [t.keptSame, kept.join(' · ')]] });
    blocks.push({ p: t.notebook, style: 'dim' });
    blocks.push({ p: t.roles, style: 'dim' });
    blocks.push({ row: [{ id: 'startTest', label: t.startTesting + ' ▶', primary: true }], h: 92 });
  }
  blocks.push({ row: [{ id: 'options', label: '⚙ ' + t.options }], h: 70, after: 0 });
  return { kicker: t.labTitle, title: t.planTitle, blocks };
}
function tableBlock() {
  const t = T();
  return { table: {
    title: t.tableTitle,
    head: [t.vars[planKey], t.trial(1), t.trial(2), t.trial(3), t.average],
    rows: levels(planKey).map((l) => [t.levels[l.id], ...[0, 1, 2].map((i) => { const v = (rows()[l.id] || [])[i]; return v == null ? '' : S.num ? String(Math.round(v)) : '✓'; }), t.youCalc]),
    current: test.levelIdx,
  } };
}
function testStep() {
  const t = T(), n = countFor(curLevel().id);
  if (awaitRecord) return t.recFull(n) + (S.num && lastShot ? ' ' + t.recNum(Math.round(lastShot.cm)) : '');
  if (anim && anim.kind === 'return') return t.rollingBack;
  if (allRowsDone()) return t.allDone;
  if (n >= 3) return t.stepRowDone + ' ' + t.stepPick;
  const screen = mode === 'desktop', fireStep = screen || !S.lanyard ? t.stepFireScreen : t.stepFire;
  if (test.predFor !== curLevel().id) return screen ? t.stepPredictScreen : t.stepPredict;
  if (lastShot && lastShot.forLevel === curLevel().id && lastShot.n === n && n > 0 && !anim) return t.stepRead(n) + ' ' + (n < 3 ? fireStep : '');
  return fireStep;
}
function testSpec() {
  const t = T(), busy = !!anim && anim.kind !== 'return';
  const lvRow = { row: levels(planKey).map((l, i) => ({ id: 'level:' + i, label: (countFor(l.id) >= 3 ? '✓ ' : '') + t.levels[l.id], sel: i === test.levelIdx, disabled: busy || awaitRecord })), h: 84 };
  const canFire = !busy && canFireNow();
  const actRow = awaitRecord
    ? { row: [{ id: 'recorded', label: t.recorded, primary: true, w: 1.6 }, { id: 'replay', label: '⟲ ' + t.slowmo, disabled: busy || !lastShot }], h: 92 }
    : { row: [{ id: 'fire', label: t.fire, primary: true, disabled: !canFire, w: 1.2 }, { id: 'replay', label: '⟲ ' + t.slowmo, disabled: busy || !lastShot }, { id: 'arrows', label: test.arrows ? t.arrowsOn : t.arrowsOff, sel: test.arrows }], h: 88 };
  return { kicker: t.labTitle, title: awaitRecord ? t.recTitle : `${t.testing} ${t.vars[planKey]}`, blocks: [
    lvRow,
    { p: testStep(), style: 'em' },
    actRow,
    tableBlock(),
    { row: [{ id: 'backPlan', label: '◀ ' + t.back, disabled: awaitRecord }, { id: 'explain', label: t.explain + ' ▶', primary: allRowsDone() && !awaitRecord, disabled: awaitRecord }], h: 80 },
    { row: [{ id: 'options', label: '⚙ ' + t.options }], h: 70, after: 0 },
  ] };
}
function challengeSpec() {
  const t = T(), busy = !!anim && anim.kind !== 'return', blocks = [{ p: t.chBody(ch.target.cm) }];
  for (const k of VAR_KEYS) {
    blocks.push({ p: t.vars[k], style: 'label', after: 6 });
    blocks.push({ row: levels(k).map((l) => ({ id: `set:${k}:${l.id}`, label: t.levels[l.id], sel: settings[k] === l.id, disabled: busy })), h: 70, after: 10 });
  }
  if (ch.result) {
    const cm = Math.round(ch.result.cm), o = ch.result.hit ? 'Hit' : ch.result.cm > ch.target.cm ? 'Far' : 'Short';
    blocks.push({ p: S.num ? t['ch' + o](cm) : t['ch' + o + 'NoNum'], style: ch.result.hit ? 'good' : 'bad' });
  }
  blocks.push({ row: [{ id: 'fire', label: t.fire, primary: true, disabled: busy }, { id: 'replay', label: '⟲ ' + t.slowmo, disabled: busy || !lastShot }, { id: 'newTarget', label: t.newTarget, disabled: busy }], h: 88 });
  blocks.push({ row: [{ id: 'backExplain', label: '◀ ' + t.back }, { id: 'options', label: '⚙ ' + t.options }], h: 70, after: 0 });
  return { kicker: t.labTitle, title: t.chTitle, blocks };
}
function replaySpec() {
  const t = T(), a = anim;
  const playing = a.playing;
  const looking = a.arrows && a.looked && !playing && Math.abs(a.t - LOOK_T) < 0.01;
  return { kicker: t.labTitle, title: t.replayTitle, blocks: [
    { p: looking ? t.lookArrows : phase === 'watch' ? t.watchBody : realTimeText(), style: looking ? 'em' : phase === 'watch' ? 'body' : 'gold' },
    ...(phase === 'watch' || looking ? [{ p: realTimeText(), style: 'gold' }] : []),
    { row: [{ id: 'rp:restart', label: '⟲ ' + t.restart }, { id: 'rp:back', label: '◀ ' + t.back }, { id: 'rp:toggle', label: playing ? t.pause : t.play + ' ▶', primary: true }, { id: 'rp:step', label: t.step + ' ▶' }], h: 92 },
    { row: [{ id: 'rp:done', label: t.done }], h: 84, after: 0 },
  ] };
}
function realTimeText() { return T().realTime(anim ? replayRealTime(anim.t).toFixed(3) : '0.000'); }
function optionsSpec() {
  const t = T(), blocks = [];
  blocks.push({ p: t.lang, style: 'label', after: 6 });
  blocks.push({ row: [{ id: 'lang:en', label: 'English', sel: S.lang === 'en' }, { id: 'lang:es', label: 'Español', sel: S.lang === 'es' }], h: 80 });
  if (SIZES.length > 1) {
    blocks.push({ p: t.size, style: 'label', after: 6 });
    blocks.push({ row: SIZES.map((s) => ({ id: 'size:' + s, label: t.sizes[s], sel: S.size === s })), h: 80 });
    blocks.push({ p: t.sizeNotes[S.size], style: 'dim' });
  }
  blocks.push({ p: t.supports, style: 'label', after: 6 });
  blocks.push({ row: [{ id: 'acc:big', label: t.bigText, sel: S.big }, { id: 'acc:calm', label: t.calm, sel: S.calm }, { id: 'acc:num', label: t.number, sel: S.num }], h: 80 });
  if (mode !== 'desktop') blocks.push({ row: [{ id: 'move', label: t.move }, { id: 'exit', label: t.exit }], h: 80 });
  blocks.push({ row: [{ id: 'restart', label: confirmRestart ? t.restartSure : '⟲ ' + t.startOver, sel: confirmRestart }], h: 80 });
  blocks.push({ row: [{ id: 'closeOptions', label: t.close, primary: true }], h: 84 });
  blocks.push({ p: t.credit, style: 'dim', after: 0 });
  return { kicker: t.labTitle, title: t.options, blocks };
}
function refresh() {
  const z0 = panel.zoom;
  panel.setZoom(S.big ? 1.3 : 1);
  panel.show(panelSpec());
  if (mode !== 'desktop' && dock && panel.zoom !== z0) layoutPanel(false, false);   // Bigger text: find a new dock for the bigger panel
  document.body.classList.toggle('big-text', S.big);
}

// ═════════════ button handling ═════════════
function onButton(id) {
  if (!id || frozen || !panel.buttons.some((b) => b.id === id && !b.disabled)) return;   // only what the panel shows right now
  unlockAudio();
  const [a, b, c] = id.split(':');
  if (a !== 'restart') confirmRestart = false;
  if (a === 'options') { optionsOpen = true; return refresh(); }
  if (a === 'closeOptions') { optionsOpen = false; return refresh(); }
  if (a === 'restart') { if (!confirmRestart) { confirmRestart = true; return refresh(); } return startOver(); }
  if (a === 'lang') { S.lang = b; relabel(); syncPage(); return refresh(); }
  if (a === 'size') { setSize(b); return refresh(); }
  if (a === 'acc') { S[b] = !S[b]; syncPage(); updateLoupe(); return refresh(); }
  if (a === 'move') { optionsOpen = false; refresh(); return replace(); }
  if (a === 'exit') { forgetHandle(); renderer.xr.getSession()?.end(); return; }
  if (a === 'fire') return fire();
  if (a === 'q3') { q3Answer = b; phase = 'watch'; return startReplay(true); }
  if (a === 'replay') return startReplay(phase === 'answer' || phase === 'gexplain' || test.arrows || phase === 'challenge');
  if (a === 'toCompare') return startCompare();
  if (a === 'recorded') return recorded();
  if (a === 'gDone') { phase = 'gdone'; return refresh(); }
  if (a === 'again') return startOver();
  if (a === 'rp') return replayControl(b);
  if (a === 'toPlan') { phase = 'plan'; resetShots(); return refresh(); }
  if (a === 'plan') { planKey = b; return refresh(); }
  if (a === 'startTest') return startTest();
  if (a === 'level') { if (awaitRecord) return; test.levelIdx = +b; test.predCm = null; test.predFor = null; L.predFlag.visible = false; loupe.mesh.visible = false; applySettings(settingsForTest()); rollBack(); return refresh(); }
  if (a === 'arrows') { test.arrows = !test.arrows; return refresh(); }
  if (a === 'backPlan') { phase = 'plan'; resetShots(); return refresh(); }
  if (a === 'explain') { phase = 'explain'; resetShots(); return refresh(); }
  if (a === 'testOther') { phase = 'plan'; if (!S.lock) planKey = null; test.data = {}; return refresh(); }
  if (a === 'challenge' || a === 'newTarget') return startChallenge();
  if (a === 'backExplain') { phase = 'explain'; resetShots(); L.target.visible = false; applySettings({ ...DEFAULTS }); return refresh(); }
  if (a === 'set') { settings[b] = c; applySettings(settings); ch.result = null; rollBack(); return refresh(); }
}
// "Start over": a fresh lab for the next pair (the table and predictions are cleared; nothing was saved anyway)
function startOver() {
  confirmRestart = false; optionsOpen = false;
  anim = null; smoke = null; L.puffs.forEach((p) => { p.visible = false; });
  phase = START; q3Answer = null; planKey = S.lock; triesFired = 0; awaitRecord = false; GD.i = 0; GD.results = [];
  test.levelIdx = 0; test.data = {}; test.predCm = null; test.predFor = null; test.arrows = false;
  ch.target = null; ch.result = null;
  applySettings({ ...DEFAULTS });
  resetShots(); L.target.visible = false;
  refresh();
}
function startCompare() {
  phase = 'gcomp'; GD.i = 0; GD.results = []; awaitRecord = false; test.predCm = null; test.predFor = null;
  resetShots(); applySettings(gSettings()); refresh();
}
// "I recorded it": the crew rolls the cannon back to the start line, ready for the next shot
function recorded() {
  awaitRecord = false; loupe.mesh.visible = false;
  if (phase === 'gcomp') {
    if (GD.i === 0) { GD.i = 1; test.predCm = null; test.predFor = null; L.predFlag.visible = false; applySettings(gSettings()); }
    else { phase = 'gexplain'; L.predFlag.visible = false; }
  }
  if (!rollBack()) refresh();
}
function startTest() {
  phase = 'test'; test.levelIdx = 0; test.data = {}; test.predCm = null; test.predFor = null;
  resetShots(); applySettings(settingsForTest()); refresh();
}
function startChallenge() {
  let tg; do { tg = challengeTarget(rand); } while (ch.target && tg.cm === ch.target.cm);
  ch.target = tg; ch.result = null;
  phase = 'challenge'; resetShots();
  settings = { ...DEFAULTS }; applySettings(settings);
  L.target.position.x = -tg.cm / 100; L.target.visible = true;
  refresh();
}
function resetShots() {
  anim = null; lastShot = null; L.clearGhosts(); L.predFlag.visible = false; loupe.mesh.visible = false;
  hideArrows(); L.ball.visible = false; L.target.visible = phase === 'challenge';
  rollBack();
}
// Before every shot the cannon goes back to the start line (0 on the ruler), the way a gun crew pushed it back
// "into battery" after it recoiled. It rolls there (wheels turning), so students see every shot start from 0.
function rollBack(then = null) {
  if (Math.abs(L.cannonX) < 0.003) { L.setCannonX(0, wheels); if (then) then(); return false; }
  loupe.mesh.visible = false; L.ball.visible = false; hideArrows();
  const from = L.cannonX;
  anim = { kind: 'return', t: 0, from, dur: Math.min(1.4, 0.5 + Math.abs(from) * 0.8), then };
  refresh();
  return true;
}
function applySettings(st) { settings = { ...st }; L.showSettings(settings, T()); sizeLabels(); }
function relabel() {
  const t = T();
  L.setLabelText(L.arrows.ball.userData.label, t.pushBall); L.setLabelText(L.arrows.cannon.userData.label, t.pushCannon);
  L.setLabelText(L.arrows.friction.userData.label, settings.wheels === 'blocked' ? t.groundPush : t.friction);
  L.setLabelText(L.predFlag.userData.label, t.predicted); L.setLabelText(L.target.userData.label, t.target);
  L.showSettings(settings, t);
  sizeLabels();
}

// ═════════════ firing ═════════════
function fire() {
  if (!canFireNow()) return;
  if (anim && anim.kind === 'return') { anim.then = fireNow; return; }   // Fire during the roll-back: it fires as soon as it's at 0
  if (anim) return;
  if (rollBack(fireNow)) return;   // back to the start line first, then fire
  fireNow();
}
let shotStartX = 0;
function fireNow() {
  shotStartX = L.cannonX;
  const st = phase === 'test' ? settingsForTest() : phase === 'gcomp' ? gSettings() : { ...settings };
  const r = trial(st, rand);
  lastShot = { st, r, cm: r.d * 100, forLevel: phase === 'test' ? curLevel().id : null, n: 0 };
  L.setCannonX(0, wheels); hideArrows(); loupe.mesh.visible = false;
  anim = { kind: 'live', t: 0, rec: lastShot, playing: true, smoked: false };
  boom({ calm: S.calm, size: r.bags });
  triesFired++;
  refresh();
}
function shotDone(rec) {
  const cm = rec.cm;
  if (phase === 'try') { phase = 'q3'; }
  else if (phase === 'test') {
    const id = curLevel().id; (test.data[id] = test.data[id] || []).push(cm);
    rec.n = test.data[id].length;
    L.addGhost(cm, test.levelIdx, rec.n); sizeLabels();
    awaitRecord = true;
  } else if (phase === 'gcomp') {
    GD.results[GD.i] = cm;
    L.addGhost(cm, GD.i, 1, T().levels[gLevel().id]); sizeLabels();
    awaitRecord = true;
  } else if (phase === 'challenge') {
    ch.result = { cm, hit: onTheLine(cm, ch.target.cm) };
    L.addGhost(cm, 0, L.ghosts.length + 1); sizeLabels();
  }
  if (phase === 'test' || phase === 'challenge' || phase === 'gcomp') { loupe.mesh.visible = true; updateLoupe(); }
  refresh();
}
function updateLoupe() { if (lastShot) loupe.set(Math.max(0, -L.cannonX * 100), S.num, phase === 'test' || phase === 'gcomp' ? test.predCm : phase === 'challenge' ? ch.target?.cm : null, phase === 'challenge' ? '#2fae5a' : '#2f7de1'); }
function hideArrows() { for (const a of Object.values(L.arrows)) a.visible = false; }

// After the ball hits the sandbags it loses almost all its speed, bounces back a little, falls under gravity,
// thumps onto the ground, bounces once or twice and rolls to a stop. (Real time τ seconds after it hits.)
const BALL_HIT = { x: BACKSTOP_X - BALL_R, y: MUZZLE.y };
const BALL_PATH = (() => {   // pre-computed, 1/240 s steps, about 2 s
  const pts = [], dt = 1 / 240; let x = BALL_HIT.x, y = BALL_HIT.y, vx = -0.7, vy = 0, rolling = false;
  for (let i = 0; i < 480; i++) {
    pts.push([x, y]);
    if (!rolling) {
      vy -= G * dt; x += vx * dt; y += vy * dt;
      if (y <= BALL_R) { y = BALL_R; vy = -vy * 0.28; vx *= 0.7; if (vy < 0.25) { rolling = true; vy = 0; } }
    } else { const s = Math.sign(vx); vx -= s * 1.6 * dt; if (Math.sign(vx) !== s) vx = 0; x += vx * dt; }
  }
  return pts;
})();
const ballAt = (tau) => BALL_PATH[Math.max(0, Math.min(BALL_PATH.length - 1, Math.round(tau * 240)))];
const BALL_SETTLE = 1.6;   // seconds until it lies still
// cannon position during the roll (real time τ seconds after the push)
function rollX(r, tau) { const a = r.mu * G, tt = Math.min(tau, r.tStop); return -(r.vCannon * tt - 0.5 * a * tt * tt); }

// Slow motion uses ONE clock for everything, so the ball and the cannon start moving at the same instant (the
// powder pushes both at once). The first 1/70 s (the push inside the barrel and the ball's flight) is slowed about
// 160 times; then the clock speeds up smoothly to 4 times slower than real life for the cannon's roll. The cannon is
// hundreds of times heavier than the ball, so while the ball flies it has only just started to move.
const RP = { pause: 0.6, fast: 2.4, ramp: 1.2, slow: 4 };
const TAU_FAST = 0.015, PUSH_T = 0.01;              // real seconds: the very slow part; how long the powder pushes
const R0 = TAU_FAST / RP.fast, R1 = 1 / RP.slow;      // real seconds per replay second, before and after the ramp
function tauOf(t) {   // the real-world time a replay moment shows
  if (t <= RP.pause) return 0;
  let u = t - RP.pause;
  if (u <= RP.fast) return R0 * u;
  u -= RP.fast;
  if (u <= RP.ramp) return TAU_FAST + R0 * u + (R1 - R0) * u * u / (2 * RP.ramp);
  return TAU_FAST + (R0 + R1) * RP.ramp / 2 + R1 * (u - RP.ramp);
}
const PUSH_END_T = RP.pause + PUSH_T / R0;          // replay time when the ball leaves the muzzle
const LOOK_T = RP.pause + 0.7 * PUSH_T / R0;         // replay pauses here (arrows on) so students can compare the pushes
const hitTau = (r) => PUSH_T + (BALL_HIT.x - MUZZLE.x) / r.vBall;
function replayLen(r) { const end = Math.max(r.tStop, hitTau(r) + BALL_SETTLE); let t = RP.pause; while (tauOf(t) < end) t += 0.05; return t + 0.8; }
const replayRealTime = (t) => tauOf(t);
function showPushArrows(cx, ballX, o) {
  const A = L.arrows, Lp = 1.1;
  A.ball.visible = A.cannon.visible = true; A.ball.setLength(Lp); A.cannon.setLength(Lp);
  A.ball.setOpacity(o); A.cannon.setOpacity(o);
  A.ball.position.set(ballX + 0.12, MUZZLE.y + 0.32, 0); A.ball.rotation.set(0, 0, 0);
  A.cannon.position.set(cx + VENT.x - 0.05, MUZZLE.y + 0.32, 0); A.cannon.rotation.set(0, 0, Math.PI);
}
function showFriction(cx, blocked) { const A = L.arrows.friction; A.visible = true; A.setOpacity(1); A.setLength(blocked ? 1.0 : 0.55); A.position.set(cx - WHEEL_R * 0.2, 0.12, 1.02); }
function poseReplay(t, rec, withArrows) {
  const r = rec.r, tau = tauOf(t), cx = rollX(r, tau), th = hitTau(r);
  L.ball.visible = t > RP.pause;
  if (tau < PUSH_T) { const f = tau / PUSH_T; L.ball.position.set(cx - 0.55 + (MUZZLE.x + 0.55) * f * f, MUZZLE.y, 0); }   // inside the barrel
  else if (tau < th) L.ball.position.set(Math.min(BALL_HIT.x, rollX(r, PUSH_T) + MUZZLE.x + r.vBall * (tau - PUSH_T)), MUZZLE.y, 0);
  else { const [bx, by] = ballAt(tau - th); L.ball.position.set(bx, by, 0); }
  L.setCannonX(cx, wheels);
  hideArrows();
  if (!withArrows) return;
  // the two pushes: full size while the powder pushes, then they fade slowly so students can still compare them
  if (t >= RP.pause && t < PUSH_END_T + 2.5) {
    const o = t < PUSH_END_T ? 1 : 1 - (t - PUSH_END_T) / 2.5;
    showPushArrows(cx, tau < PUSH_T ? L.ball.position.x : rollX(r, PUSH_T) + MUZZLE.x, Math.max(0.15, o));
  }
  if (tau > PUSH_T && tau < r.tStop) showFriction(cx, rec.st.wheels === 'blocked');   // friction slows the rolling cannon
}

function startReplay(withArrows) {
  if (!lastShot || (anim && anim.kind !== 'replay')) return;
  anim = { kind: 'replay', t: 0, rec: lastShot, playing: true, arrows: withArrows };
  loupe.mesh.visible = false;
  refresh();
}
function replayControl(cmd) {
  if (!anim || anim.kind !== 'replay') return;
  const len = replayLen(anim.rec.r), step = 1 / 15;
  if (cmd === 'restart') { anim.t = 0; anim.playing = true; }
  else if (cmd === 'toggle') { if (anim.t >= len) anim.t = 0; anim.playing = !anim.playing; }
  else if (cmd === 'step') { anim.playing = false; anim.t = Math.min(len, anim.t + step); }
  else if (cmd === 'back') { anim.playing = false; anim.t = Math.max(0, anim.t - step); }
  else if (cmd === 'done') return endReplay();
  poseReplay(anim.t, anim.rec, anim.arrows);
  refresh();
}
function endReplay() {
  const rec = anim?.rec; anim = null; hideArrows();
  if (rec) { const [bx, by] = ballAt(BALL_SETTLE); L.ball.position.set(bx, by, 0); }
  if (rec) L.setCannonX(rollX(rec.r, rec.r.tStop), wheels);
  if (phase === 'watch') phase = 'answer';
  if (rec && (phase === 'test' || phase === 'challenge' || (phase === 'gcomp' && awaitRecord))) { loupe.mesh.visible = true; updateLoupe(); }
  refresh();
}

let panelTick = 0;
function updateAnim(dt) {
  if (!anim) return;
  if (anim.kind === 'return') {
    anim.t += dt;
    const f = Math.min(1, anim.t / anim.dur), e = f * f * (3 - 2 * f);
    L.setCannonX(anim.from * (1 - e), wheels);
    if (f >= 1) { const then = anim.then; anim = null; L.setCannonX(0, wheels); if (then) then(); else refresh(); }
    return;
  }
  if (anim.kind === 'live') {
    const r = anim.rec.r;
    anim.t += dt;
    // ball: a streak from the muzzle to the sandbags for a moment, then it lies at their foot
    L.ball.visible = true;
    if (anim.t < 0.03) L.ball.position.set(MUZZLE.x + (BALL_HIT.x - MUZZLE.x) * (anim.t / 0.03), MUZZLE.y, 0);
    else { const [bx, by] = ballAt(anim.t - 0.03); L.ball.position.set(bx, by, 0); }
    L.setCannonX(rollX(r, anim.t), wheels);
    hideArrows();
    if (test.arrows && phase === 'test') {
      if (anim.t < 2.2) showPushArrows(L.cannonX, MUZZLE.x + 0.1, anim.t < 1.2 ? 1 : 1 - (anim.t - 1.2));   // the pushes stay up for 2 s, fading
      if (anim.t < r.tStop) showFriction(L.cannonX, anim.rec.st.wheels === 'blocked');
    }
    if (!S.calm && !anim.smoked) { anim.smoked = true; startSmoke(); }
    if (anim.t > Math.max(r.tStop, BALL_SETTLE) + 0.2) { const rec = anim.rec; anim = null; hideArrows(); shotDone(rec); }   // the ball stays where it landed
  } else if (anim.kind === 'replay') {
    if (anim.playing) {
      anim.t += dt;
      const len = replayLen(anim.rec.r);
      if (anim.t >= len) { anim.t = len; anim.playing = false; }
      if (!S.calm && anim.t - dt < PUSH_END_T && anim.t >= PUSH_END_T) startSmoke();
      if (anim.arrows && !anim.looked && anim.t >= LOOK_T) { anim.t = LOOK_T; anim.playing = false; anim.looked = true; }   // stop on the pushes
      poseReplay(anim.t, anim.rec, anim.arrows);
      if ((panelTick += dt) > 0.5 || !anim.playing) { panelTick = 0; refresh(); }
    }
  }
}
// smoke puffs
let smoke = null;
function startSmoke() { smoke = { t: 0 }; L.puffs.forEach((p, i) => { p.visible = true; p.userData.v = new THREE.Vector3(0.6 + Math.random() * 1.4, 0.15 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8); p.position.copy(MUZZLE); p.userData.delay = i * 0.02; }); }
function updateSmoke(dt) {
  if (!smoke) return;
  smoke.t += dt;
  for (const p of L.puffs) {
    const tt = Math.max(0, smoke.t - p.userData.delay);
    p.position.copy(MUZZLE).addScaledVector(p.userData.v, 1 - Math.exp(-tt * 2)); p.position.x += L.cannonX * 0.3;
    p.scale.setScalar(0.25 + tt * 0.6);
    p.material.opacity = Math.max(0, 0.85 * (1 - tt / 2.2));
  }
  if (smoke.t > 2.4) { L.puffs.forEach((p) => { p.visible = false; }); smoke = null; }
}

// ═════════════ sizes, labels, layout ═════════════
const LABEL_W = { desk: 0.085, half: 0.22, life: 0.34 };   // world width of a "worldW = 1" label, per size
function sizeLabels() {
  const s = lab.scale.x, k = mode === 'desktop' ? 0.55 : LABEL_W[S.size];
  for (const l of L.labels) {
    let ps = 1; let p = l.parent; while (p && p !== lab) { ps *= p.scale.x; p = p.parent; }
    l.scale.setScalar(l.userData.worldW * k / s / ps);
  }
}
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
function faceLabels() {   // labels turn to face the student (yaw only), whatever their parent's rotation
  camera.getWorldPosition(_w);
  for (const l of L.labels) {
    if (!l.visible) continue;
    l.getWorldPosition(_v);
    const yaw = Math.atan2(_w.x - _v.x, _w.z - _v.z);
    l.parent.getWorldQuaternion(_q).invert();
    l.quaternion.setFromAxisAngle(UP, yaw).premultiply(_q);
  }
}
function setSize(s) {
  if (!SIZES.includes(s) || s === S.size) return;
  S.size = s; syncPage();
  if (mode === 'desktop') return layoutDesktop();
  lab.scale.setScalar(labScale()); sizeLabels();
  replace();
}
function headForward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize(); }
// put the lab in front of a seated student (desk size): a little below eye level, the side of the cannon toward them
function placeDesk() {
  placing = false; reticle.visible = false; hint.mesh.visible = false;
  const C = camera.position, f = headForward();
  const r = new THREE.Vector3().crossVectors(f, UP).normalize();
  const spot = C.clone().addScaledVector(f, 0.62).addScaledVector(r, -0.1).setY(Math.max(0.3, C.y - 0.5));
  setLabAt(spot);
}
function setLabAt(spot) {
  const C = camera.position;
  const yaw = Math.atan2(C.x - spot.x, C.z - spot.z);   // lab +Z toward the student
  lab.rotation.set(0, yaw, 0);
  lab.scale.setScalar(labScale());
  // centre the whole setup (trail end to sandbags, about x = −0.4) on the spot
  const off = new THREE.Vector3(-0.35 * labScale(), 0, 0).applyAxisAngle(UP, yaw);
  lab.position.copy(spot).sub(off);
  lab.visible = true;
  sizeLabels(); layoutPanel(true); layoutHandle();
  wantAnchor = true;
}
function startPlacing() { placing = true; hint.show({ blocks: [{ p: T().placeFloor, style: 'em', after: 0 }] }); hint.mesh.visible = true; lab.visible = false; dropAnchor(); }
function replace() { if (mode === 'desktop') return; if (S.size === 'desk') placeDesk(); else startPlacing(); }
// The main panel is docked like a whiteboard ABOVE the lab, so it never covers the cannon while students watch:
// we find how high the lab reaches in the student's view and put the panel's bottom edge just above that.
// If that would be too high to read comfortably (life size, close up), it docks beside the lab on the right.
// It only moves again when the student walks somewhere else (or the lab is placed again).
let panelGoal = null, dockedFrom = null;
const LAB_SAMPLES = (() => {   // points around the whole setup, in lab (real-life) metres: trail end with recoil … sandbags, arrows on top
  const pts = [];
  for (const x of [-3.8, -2.4, -1.2, 0, 0.9, 2.0, 3.0]) for (const z of [-1.0, 1.4]) for (const y of [0, 1.5, 1.8]) pts.push(new THREE.Vector3(x, y, z));
  return pts;
})();
// dock = where the panel's bottom edge sits ("above") or its top edge ("side"); the panel grows away from that
// edge when its content changes, so buttons never slide around under the student's pointer.
let dock = null;
function panelDock() {
  const C = camera.position, desk = S.size === 'desk';
  const centre = lab.localToWorld(new THREE.Vector3(-0.35, 0.4, 0.2));
  const u = centre.clone().sub(C).setY(0).normalize();                        // looking at the lab
  const d = desk ? 0.78 : S.size === 'half' ? 1.05 : 1.15;                    // how far away the panel floats
  const tallest = panel.mW * 1050 / panel.canvas.width * panel.zoom * panel.base;   // the tallest screen
  const halfW = Math.atan((panel.mW * panel.zoom * panel.base) / 2 / d);
  let top = -Infinity, right = 0;
  for (const q of LAB_SAMPLES) {
    const w = lab.localToWorld(q.clone()), v = w.clone().sub(C), h = Math.hypot(v.x, v.z);
    top = Math.max(top, Math.atan2(v.y, h));
    const vh = v.setY(0).normalize(), side = -Math.atan2(new THREE.Vector3().crossVectors(u, vh).y, u.dot(vh));   // + = to the right
    right = Math.max(right, side);
  }
  for (const gap of [0.09, 0.05]) {   // bottom edge just above the lab (with room for the grab bar if it fits)
    const bottom = Math.max(-0.3, top + gap);
    const topOfTallest = Math.atan2(d * Math.sin(bottom) + tallest, d * Math.cos(bottom));
    if (topOfTallest < 0.62) {   // above the lab, straight ahead, low enough to read comfortably
      return { kind: 'above', p: C.clone().add(u.clone().multiplyScalar(d * Math.cos(bottom))).setY(C.y + d * Math.sin(bottom)) };
    }
  }
  const yaw = Math.min(1.25, right + 0.08 + halfW);                            // otherwise beside it, on the right
  const dir = u.clone().applyAxisAngle(UP, -yaw);
  return { kind: 'side', p: C.clone().addScaledVector(dir, d).setY(C.y + 0.2) };
}
// for tests: does the panel overlap the lab in the student's view? (angular boxes, radians)
function angBox(points) {
  const C = camera.position, centre = lab.localToWorld(new THREE.Vector3(-0.35, 0.4, 0.2)), u = centre.clone().sub(C).setY(0).normalize();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const w of points) {
    const v = w.clone().sub(C), h = Math.hypot(v.x, v.z), el = Math.atan2(v.y, h);
    const vh = v.setY(0).normalize(), side = -Math.atan2(new THREE.Vector3().crossVectors(u, vh).y, u.dot(vh));
    x0 = Math.min(x0, side); x1 = Math.max(x1, side); y0 = Math.min(y0, el); y1 = Math.max(y1, el);
  }
  return { x0, x1, y0, y1 };
}
function panelOverlap() {
  const labB = angBox(LAB_SAMPLES.map((q) => lab.localToWorld(q.clone())));
  panel.mesh.updateMatrixWorld(true);
  const W = panel.mW / 2, H = panel.mW * panel.canvas.height / panel.canvas.width / 2;
  const pb = angBox([[-W, -H], [W, -H], [-W, H], [W, H]].map(([x, y]) => panel.mesh.localToWorld(new THREE.Vector3(x, y, 0))));
  const ox = Math.min(labB.x1, pb.x1) - Math.max(labB.x0, pb.x0), oy = Math.min(labB.y1, pb.y1) - Math.max(labB.y0, pb.y0);
  return { overlap: ox > 0.01 && oy > 0.01, dock: dock?.kind, lab: labB, panel: pb };
}
function panelPosFromDock() {
  const h = panel.heightM();
  if (dock.kind === 'user') { const p = lab.localToWorld(dock.pl.clone()); return p.setY(p.y + h / 2); }   // put there by the student (bottom edge, kept with the lab)
  return dock.p.clone().setY(dock.p.y + (dock.kind === 'above' ? h / 2 : -h / 2));
}
// reset = false keeps a spot the student chose with the grab bar
function layoutPanel(instant, reset = true) {
  if (mode === 'desktop') return;
  panel.setBase(S.size === 'desk' ? 0.72 : 0.95);
  if (!reset && dock?.kind === 'user') return;
  dock = panelDock(); dockedFrom = camera.position.clone().setY(0);
  panelGoal = instant ? null : true;
  if (instant) panel.mesh.position.copy(panelPosFromDock());
  panel.mesh.lookAt(camera.position);
}
function followPanel(dt) {
  if (mode === 'desktop') return;
  panel.mesh.visible = lab.visible && !placing;
  if (!lab.visible || !dock) return;
  const C = camera.position;
  if (dock.kind !== 'user' && dockedFrom && C.clone().setY(0).distanceTo(dockedFrom) > 0.6) layoutPanel(false);   // the student walked: dock again from here
  const goal = panelPosFromDock();
  if (panelGoal) {   // gliding to a new dock
    panel.mesh.position.lerp(goal, 1 - Math.exp(-dt * (S.calm ? 2.5 : 5)));
    if (panel.mesh.position.distanceTo(goal) < 0.01) panelGoal = null;
  } else panel.mesh.position.copy(goal);
  panel.mesh.lookAt(C);
}
// the lanyard handle: always within reach, in front of the student and a little to the right
let handleLocal = new THREE.Vector3(1.0, 0.9, 2.2);
function layoutHandle() {
  if (mode === 'desktop') { handleLocal.set(-0.1, 0.95, 1.75); }
  else {
    const C = camera.position, f = headForward(), r = new THREE.Vector3().crossVectors(f, UP).normalize();
    const desk = S.size === 'desk';
    const w = C.clone().addScaledVector(f, desk ? 0.34 : 0.42).addScaledVector(r, desk ? 0.02 : 0.12).setY(C.y - (desk ? 0.3 : 0.42));
    handleLocal = lab.worldToLocal(w.clone());
  }
  L.handle.position.copy(handleLocal);
  const s = (mode === 'desktop' ? 0.4 : S.size === 'desk' ? 0.06 : 0.085) / lab.scale.x;   // world size: 6–12 cm long grip
  L.handle.scale.setScalar(s);
}
function updateRope() {
  const v = L.cannon.position.clone().add(VENT), h = L.handle.position;
  const pos = L.rope.geometry.attributes.position; pos.setXYZ(0, v.x, v.y, v.z); pos.setXYZ(1, h.x, h.y, h.z); pos.needsUpdate = true;
  const showHandle = S.lanyard && !optionsOpen && (canFireNow() || !!pull);
  L.handle.visible = L.rope.visible = showHandle;
  L.handle.userData.glow.visible = showHandle && !anim && !S.calm ? true : showHandle && !anim;
  L.handle.userData.glow.material.opacity = handleNear || pull ? 0.45 : S.calm ? 0.16 : 0.12 + 0.1 * Math.sin(performance.now() / 300);
}
// loupe: floats over the stopping point, facing the student
function placeLoupe() {
  if (!loupe.mesh.visible) return;
  const p = lab.localToWorld(new THREE.Vector3(L.cannonX, 0, RULER_Z));
  const up = mode === 'desktop' ? 0.45 : { desk: 0.07, half: 0.2, life: 0.32 }[S.size];
  p.y += up;
  loupe.mesh.position.copy(p);
  loupe.mesh.scale.setScalar(mode === 'desktop' ? 3 : { desk: 0.75, half: 1.3, life: 1.8 }[S.size]);
  loupe.mesh.lookAt(camera.getWorldPosition(_w));
}

// ═════════════ moving the lab and the panel by hand ═════════════
// A round knob with four arrows sits in front of the lab, on its left: grab it (grip, trigger, pinch or a fist; or point
// and pull the trigger from a distance) and slide the lab. It keeps facing the student and is pinned again where it's let go.
// A dotted bar under the panel moves the panel the same way; it then stays in that spot beside the lab.
const KNOB_LOCAL = new THREE.Vector3(-2.2, 0, 1.8);   // lab metres: front left, clear of the ruler and the lanyard
const knob = new THREE.Mesh(new THREE.CircleGeometry(0.04, 40), new THREE.MeshBasicMaterial({ map: moveKnobTexture(), transparent: true, depthTest: false, depthWrite: false }));
knob.renderOrder = 26; knob.visible = false; scene.add(knob);
const knobTarget = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
knob.add(knobTarget);
const knobStem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]),
  new THREE.LineBasicMaterial({ color: 0xd4af6a, transparent: true, opacity: 0.5 }));
knobStem.visible = false; scene.add(knobStem);
const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.031), new THREE.MeshBasicMaterial({ map: grabBarTexture(), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
bar.renderOrder = 33; bar.visible = false; scene.add(bar);
const barTarget = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.07), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
bar.add(barTarget);
const BAR_GAP = 0.03;   // metres between the panel's bottom edge and the bar's centre
let grab = null;        // { kind: 'lab' | 'panel', c (controller) | hand, ray, start, at0, … }
const knobWorld = () => knob.getWorldPosition(new THREE.Vector3());
const barWorld = () => bar.getWorldPosition(new THREE.Vector3());
const canMoveLab = () => knob.visible && !pull && !placing && !grab;
const canMovePanel = () => bar.visible && !pull && !placing && !grab;
const knobHit = () => (canMoveLab() ? raycaster.intersectObject(knobTarget, false)[0] : null);
const barHit = () => (canMovePanel() ? raycaster.intersectObject(barTarget, false)[0] : null);
function placeMovers() {
  const xr = mode !== 'desktop';
  knob.visible = xr && lab.visible && !placing && !optionsOpen && (!anim || anim.kind !== 'live') || grab?.kind === 'lab';
  knobStem.visible = knob.visible && S.size !== 'desk';
  if (knob.visible) {
    const g = lab.localToWorld(KNOB_LOCAL.clone());
    knob.position.copy(g).setY(S.size === 'desk' ? g.y + 0.045 : lab.position.y + 0.85);   // desk: just above the desk; floor sizes: waist height
    knob.scale.setScalar(S.size === 'desk' ? 0.9 : 1.4);
    knob.lookAt(camera.position);
    knobStem.position.copy(knob.position); knobStem.scale.y = knob.position.y - lab.position.y;
    const hot = grab?.kind === 'lab' || moverNear === 'lab';
    knob.material.color.setScalar(hot ? 1.25 : 1);
  }
  bar.visible = xr && panel.mesh.visible;
  if (bar.visible) {
    panel.mesh.updateMatrixWorld();
    const q = panel.mesh.getWorldQuaternion(new THREE.Quaternion());
    bar.quaternion.copy(q);
    bar.position.copy(panel.mesh.position).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(q), -(panel.heightM() / 2 + BAR_GAP));
    bar.scale.setScalar(panel.base);
    bar.material.color.setScalar(grab?.kind === 'panel' || moverNear === 'panel' ? 1.25 : 1);
  }
}
// where the grabbing controller or hand is (for a ray grab: where its ray meets the grab plane or sphere)
function grabPoint(g) {
  if (g.hand) return jointPos(g.hand, 'middle-finger-metacarpal') || jointPos(g.hand, 'wrist') || g.last;
  if (!g.ray) return ctrlPos(g.c);
  setRayFrom(g.c);
  const { origin, direction } = raycaster.ray;
  if (g.kind === 'lab') {   // slide along the level the knob was grabbed at
    if (direction.y > -0.02) return g.last;   // pointing at or above the horizon: hold still
    const d = (g.at0.y - origin.y) / direction.y;
    return d > 0 && d < 12 ? origin.clone().addScaledVector(direction, d) : g.last;
  }
  return origin.clone().addScaledVector(direction, g.dist);   // the panel stays at the same distance along the ray
}
function startGrab(kind, src, ray, hit) {
  unlockAudio();
  const g = { kind, ray: !!ray, labPos: lab.position.clone(), labYaw: lab.rotation.y, knob0: knobWorld(), bar0: barWorld() };
  if (src.isXRHand || src.joints) g.hand = src; else g.c = src;
  if (ray) { g.dist = hit.distance; g.at0 = hit.point.clone(); }
  g.start = g.ray ? hit.point.clone() : grabPoint(g); g.last = g.start.clone();
  if (kind === 'lab') { dropAnchor(); g.knobGround = lab.localToWorld(KNOB_LOCAL.clone()); }
  grab = g;
}
function updateGrab() {
  if (!grab) return;
  const g = grab, p = grabPoint(g); g.last = p;
  const delta = p.clone().sub(g.start);
  if (g.kind === 'lab') {
    if (S.size !== 'desk' || g.ray) delta.y = 0;   // floor sizes stay on the floor; desk size can be lifted onto a real desk by hand
    const s = labScale(), want = g.knobGround.clone().add(delta);
    // keep the side of the cannon toward the student (turn about the knob, so it stays in the hand)
    const C = camera.position;
    const centre = want.clone().add(new THREE.Vector3(-0.35 - KNOB_LOCAL.x, 0, -KNOB_LOCAL.z).multiplyScalar(s).applyAxisAngle(UP, lab.rotation.y));
    if (Math.hypot(C.x - centre.x, C.z - centre.z) > 0.3) {
      const yaw = Math.atan2(C.x - centre.x, C.z - centre.z);
      let dy = yaw - lab.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      lab.rotation.y += dy * 0.25;
    }
    lab.position.copy(want).sub(new THREE.Vector3(KNOB_LOCAL.x, 0, KNOB_LOCAL.z).multiplyScalar(s).applyAxisAngle(UP, lab.rotation.y));
    lab.position.y = Math.max(0, g.labPos.y + delta.y);
  } else {
    const C = camera.position, barAt = g.bar0.clone().add(delta);
    const v = barAt.clone().sub(C), d = v.length();   // keep it readable: 35 cm to 2.5 m away
    if (d < 0.35 || d > 2.5) barAt.copy(C).addScaledVector(v.normalize(), Math.min(2.5, Math.max(0.35, d)));
    const bottom = barAt.clone().setY(barAt.y + BAR_GAP);
    dock = { kind: 'user', pl: lab.worldToLocal(bottom) };
    panelGoal = null; panel.mesh.position.copy(panelPosFromDock()); panel.mesh.lookAt(C);
  }
}
function endGrab() {
  const g = grab; if (!g) return;
  grab = null;
  if (g.kind === 'lab') { wantAnchor = true; layoutPanel(false); layoutHandle(); lastHead = null; }
}
let moverNear = null;

// ═════════════ input: controllers, hands and mouse ═════════════
const raycaster = new THREE.Raycaster();
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
  c.addEventListener('disconnected', () => { c.userData.hitSrc?.cancel?.(); c.userData.hitSrc = null; c.userData.src = null; });
  c.addEventListener('selectstart', () => onSelectStart(c));
  c.addEventListener('selectend', () => onSelectEnd(c));
  c.addEventListener('squeezestart', () => onSqueezeStart(c));   // the grip button
  c.addEventListener('squeezeend', () => onSqueezeEnd(c));
  scene.add(c); controllers.push(c);
}
// tracked hands: students can grab the lanyard handle with a closed hand (a fist), not only pinch it
const hands = [0, 1].map((i) => { const h = renderer.xr.getHand(i); h.userData = { grabbing: false }; scene.add(h); return h; });
const REACH = 0.15;   // metres: how close a hand or controller must be to the handle to grab it directly
const handleWorld = () => L.handle.getWorldPosition(new THREE.Vector3());
const canPull = () => L.handle.visible && idleOrRollingBack() && !placing && !optionsOpen;
const ctrlPos = (c) => new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
function startPull(getPos) { pull = { getPos, start: getPos().clone() }; }
function onSqueezeStart(c) {   // the grip button: the lanyard, the panel's bar or the lab's knob, up close or by pointing
  if (!renderer.xr.isPresenting || frozen || grab || pull) return;
  unlockAudio(); setRayFrom(c);
  const at = ctrlPos(c);
  if (canPull() && (at.distanceTo(handleWorld()) < REACH || handleHit())) { startPull(() => ctrlPos(c)); pull.c = c; return; }
  if (canMovePanel() && at.distanceTo(barWorld()) < REACH) return startGrab('panel', c, false);
  if (canMoveLab() && at.distanceTo(knobWorld()) < REACH) return startGrab('lab', c, false);
  const bh = barHit(); if (bh) return startGrab('panel', c, true, bh);
  const kh = knobHit(); if (kh) return startGrab('lab', c, true, kh);
}
function onSqueezeEnd(c) {
  if (pull && pull.c === c) { pull = null; L.handle.position.copy(handleLocal); }
  if (grab && grab.c === c) endGrab();
}
const jointPos = (h, name) => { const j = h.joints && h.joints[name]; return j && j.visible !== false ? j.getWorldPosition(new THREE.Vector3()) : null; };
function updateHands() {
  let near = false, mover = null;
  for (const h of hands) {
    const names = ['wrist', 'middle-finger-metacarpal', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip'];
    const J = {}; for (const n of names) { const p = jointPos(h, n); if (p) J[n] = p; }
    const palm = J['middle-finger-metacarpal'] || J.wrist;
    if (!palm) { h.userData.grabbing = false; continue; }
    const g = handGrabbing(J, h.userData.grabbing), was = h.userData.grabbing; h.userData.grabbing = g;
    const close = canPull() && palm.distanceTo(handleWorld()) < REACH;
    near = near || close;
    if (g && !was && close && !pull && !grab) { unlockAudio(); startPull(() => jointPos(h, 'middle-finger-metacarpal') || jointPos(h, 'wrist') || palm); pull.hand = h; }
    else if (g && !was && !pull && !grab) {   // a fist at the panel's bar or the lab's knob moves it
      if (canMovePanel() && palm.distanceTo(barWorld()) < REACH) startGrab('panel', h, false);
      else if (canMoveLab() && palm.distanceTo(knobWorld()) < REACH) startGrab('lab', h, false);
    }
    if (!g && was && pull && pull.hand === h) { pull = null; L.handle.position.copy(handleLocal); }
    if (!g && was && grab && grab.hand === h) endGrab();
    if (!grab) { if (canMovePanel() && palm.distanceTo(barWorld()) < REACH) mover = 'panel'; else if (canMoveLab() && palm.distanceTo(knobWorld()) < REACH) mover = 'lab'; }
  }
  for (const c of controllers) {
    if (!c.userData.src || c.userData.src.targetRayMode !== 'tracked-pointer') continue;
    const at = ctrlPos(c);
    if (canPull() && at.distanceTo(handleWorld()) < REACH) near = true;
    else if (canMovePanel() && at.distanceTo(barWorld()) < REACH) mover = 'panel';
    else if (canMoveLab() && at.distanceTo(knobWorld()) < REACH) mover = 'lab';
  }
  handleNear = near; moverNear = mover;
}
let handleNear = false;
function onConnected(c, src) {
  c.userData.src = src;
  c.userData.line.visible = src.targetRayMode === 'tracked-pointer';
  const session = renderer.xr.getSession();
  if (mode === 'ar' && session?.requestHitTestSource) session.requestHitTestSource({ space: src.targetRaySpace }).then((h) => { c.userData.hitSrc = h; }).catch(() => {});
}
const tmpM = new THREE.Matrix4();
function setRayFrom(c) {
  tmpM.identity().extractRotation(c.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
  raycaster.far = 12;
}
const panelHit = () => raycaster.intersectObject(panel.mesh, false)[0] || null;
const idleOrRollingBack = () => !anim || anim.kind === 'return';
const handleHit = () => (L.handle.visible && idleOrRollingBack() ? raycaster.intersectObject(L.handle.userData.glow, false)[0] : null);
const trackHit = () => (canPredict() && idleOrRollingBack() ? raycaster.intersectObject(L.track, false)[0] : null);
let pull = null, drag = null;   // pulling the lanyard; dragging the prediction flag
let heightMoved = 0;
function onSelectStart(c) {
  if (!renderer.xr.isPresenting || frozen) return;
  unlockAudio();
  setRayFrom(c);
  if (grab) return;
  const bh = barHit(); if (bh) return startGrab('panel', c, true, bh);
  const ph = panel.mesh.visible ? panelHit() : null;
  if (ph) { c.userData.pressed = panel.buttonAt(ph.uv); return; }
  if (placing) { if (c.userData.target) finishPlacing(c.userData.target.clone()); return; }
  if (canPull() && (handleHit() || ctrlPos(c).distanceTo(handleWorld()) < REACH)) { startPull(() => ctrlPos(c)); pull.c = c; return; }
  const kh = knobHit(); if (kh) return startGrab('lab', c, true, kh);
  if (canMoveLab() && ctrlPos(c).distanceTo(knobWorld()) < REACH) return startGrab('lab', c, false);
  const th = trackHit(); if (th) { drag = { c }; setPrediction(th.point); }
}
function onSelectEnd(c) {
  if (c.userData.pressed !== undefined) {
    setRayFrom(c); const ph = panelHit(); const id = ph ? panel.buttonAt(ph.uv) : null;
    const was = c.userData.pressed; c.userData.pressed = undefined;
    if (id && id === was) onButton(id);
    return;
  }
  if (pull && pull.c === c) { pull = null; L.handle.position.copy(handleLocal); }
  if (drag && drag.c === c) drag = null;
  if (grab && grab.c === c) endGrab();
}
function setPrediction(worldPoint) {
  if (frozen) return;
  const p = lab.worldToLocal(worldPoint.clone());
  const cm = Math.max(0, Math.min(RULER_CM, Math.round(-p.x * 100)));
  test.predCm = cm; test.predFor = predKey();
  L.predFlag.position.set(-cm / 100, 0, RULER_Z + 0.06); L.predFlag.visible = true; sizeLabels();
  loupe.mesh.visible = false;
  refresh();
}
function updatePull() {
  if (!pull) return;
  const now = pull.getPos();
  L.handle.position.copy(lab.worldToLocal(now.clone()));
  if (now.distanceTo(pull.start) > 0.12) {   // a firm tug (12 cm) fires the cannon
    pull = null; L.handle.position.copy(handleLocal);
    fire();   // (it only fires when a shot is allowed: prediction placed, results recorded)
  }
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
  if (direction.y < -0.05) { const d = -origin.y / direction.y; if (d > 0 && d < 10) return origin.clone().addScaledVector(direction, d); }
  return null;
}
function finishPlacing(target) { placing = false; reticle.visible = false; hint.mesh.visible = false; setLabAt(target); }

function xrUpdate(frame, dt) {
  xrFrames++;
  if (needsLayout && xrFrames > 3) { needsLayout = false; replace(); layoutPanel(true); }
  anchorTick(frame);
  if (frozen) {   // only the teacher's message, in front of the student; the lab waits
    for (const c of controllers) { c.userData.dot.visible = false; c.userData.line.visible = false; }
    const goal = camera.position.clone().addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), 1.1);
    freezePanel.mesh.position.lerp(goal, xrFrames < 5 ? 1 : 1 - Math.exp(-dt * 4));
    freezePanel.mesh.lookAt(camera.position);
    return;
  }
  for (const c of controllers) c.userData.line.visible = true;
  for (const c of controllers) {
    const u = c.userData; if (!u.src) { u.dot.visible = false; continue; }
    setRayFrom(c);
    const hit = panel.mesh.visible ? panelHit() : null;
    const other = hit ? null : barHit() || knobHit() || handleHit() || trackHit();
    const h = hit || other;
    u.line.scale.z = h ? h.distance : 3; u.dot.visible = !!h; if (h) u.dot.position.copy(h.point);
    u.panelHit = hit;
    if (drag && drag.c === c) { const th = raycaster.intersectObject(L.track, false)[0]; if (th) setPrediction(th.point); }
  }
  const hits = controllers.map((c) => c.userData.panelHit).filter(Boolean);
  panel.setHover(hits[0] ? panel.buttonAt(hits[0].uv) : null);
  if (placing) {
    for (const x of controllers) x.userData.target = x.userData.src ? findTarget(x, frame) : null;
    const c = controllers.find((x) => x.userData.target);
    reticle.visible = !!c;
    if (c) { reticle.position.copy(c.userData.target).y += 0.004; }
    hint.mesh.position.copy(camera.position).addScaledVector(headForward(), 1.0).setY(camera.position.y + 0.05);
    hint.mesh.lookAt(camera.position);
  } else if (S.size === 'desk') {   // desk size: the right thumbstick raises or lowers the lab to sit on the real desk
    let moved = false;
    for (const c of controllers) { const gp = c.userData.src?.gamepad; const y = gp && gp.axes.length >= 4 ? gp.axes[3] : 0; if (Math.abs(y) > 0.3) { lab.position.y -= y * dt * 0.25; moved = true; } }
    if (moved) heightMoved = performance.now();
    else if (heightMoved && performance.now() - heightMoved > 600) { heightMoved = 0; wantAnchor = true; }   // pin the new height
  }
  updateHands();
  updatePull();
  updateGrab();
  followPanel(dt);
  placeMovers();
}

// mouse / touch on the preview
const pointer = new THREE.Vector2();
function pointerRay(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
}
let downAt = null, mouseDrag = false;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (mode !== 'desktop') return;
  downAt = [e.clientX, e.clientY]; pointerRay(e);
  const th = !panelHit() && trackHit(); if (th) { mouseDrag = true; controls.enabled = false; setPrediction(th.point); }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (mode !== 'desktop') return;
  pointerRay(e);
  const ph = panelHit(); panel.setHover(ph ? panel.buttonAt(ph.uv) : null);
  if (mouseDrag) { const th = raycaster.intersectObject(L.track, false)[0]; if (th) setPrediction(th.point); }
  renderer.domElement.style.cursor = ph && panel.buttonAt(ph.uv) || handleHit() || trackHit() ? 'pointer' : 'grab';
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (mode !== 'desktop' || !downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
  if (mouseDrag) { mouseDrag = false; controls.enabled = true; return; }
  if (moved > 6) return;
  unlockAudio(); pointerRay(e);
  const ph = panelHit(); if (ph) return onButton(panel.buttonAt(ph.uv));
  if (handleHit()) fire();
});

// ═════════════ anchors: keep the lab fixed to the real room ═════════════
// An anchor is a spot the headset tracks in the real room, so the lab stays on the same desk or patch of floor
// even when the headset recentres. Taking the headset off (to write) can make it lose an anchor for good, so,
// as in the artifact viewer, each anchor is also saved on the headset ("persistent anchor") and restored from
// that copy if it stops being tracked for 2 seconds. Only the anchor's random reference code is kept, and only
// in memory for this visit: nothing is written to the browser's storage.
let anchor = null, anchorLast = null, wantAnchor = false, anchorGen = 0;
let anchorHandle = null, anchorLostAt = 0, anchorWait = null;
const dbg = { anchor: 'none', saved: false, restores: 0, replaced: 0 };
function forgetHandle() {   // tidy up the saved copy on the headset
  const h = anchorHandle; anchorHandle = null; dbg.saved = false;
  if (h) renderer.xr.getSession()?.deletePersistentAnchor?.(h).catch(() => {});
}
function dropAnchor() {
  anchorGen++; wantAnchor = false; anchorWait = null;
  if (anchor) { try { anchor.delete(); } catch { /* gone */ } }
  anchor = null; anchorLast = null; anchorLostAt = 0; forgetHandle(); dbg.anchor = 'none';
}
async function makeAnchor(frame) {
  wantAnchor = false;
  const ref = renderer.xr.getReferenceSpace();
  if (mode !== 'ar' || !frame?.createAnchor || !ref || typeof XRRigidTransform === 'undefined') return;
  dropAnchor();
  const gen = anchorGen, q = new THREE.Quaternion().setFromAxisAngle(UP, lab.rotation.y), P = lab.position;
  try {
    const a = await frame.createAnchor(new XRRigidTransform({ x: P.x, y: P.y, z: P.z }, { x: q.x, y: q.y, z: q.z, w: q.w }), ref);
    if (gen !== anchorGen) { a.delete(); return; }
    anchor = a; anchorLast = null; dbg.anchor = 'ok';
    if (a.requestPersistentHandle) {
      try { const h = await a.requestPersistentHandle(); if (gen === anchorGen) { anchorHandle = h; dbg.saved = true; } else renderer.xr.getSession()?.deletePersistentAnchor?.(h).catch(() => {}); }
      catch (e) { console.warn('could not save the anchor', e); }
    }
  } catch (e) { console.warn('anchor not available', e); dbg.anchor = 'failed'; }
}
function followAnchor(frame) {
  if (!anchor || placing || !frame) return;
  const ref = renderer.xr.getReferenceSpace();
  const lost = () => { if (!anchorLostAt) anchorLostAt = performance.now(); };
  if (frame.trackedAnchors && !frame.trackedAnchors.has(anchor)) return lost();
  const pose = ref && frame.getPose(anchor.anchorSpace, ref); if (!pose) return lost();
  anchorLostAt = 0;
  const tp = pose.transform.position, o = pose.transform.orientation;
  const now = { p: new THREE.Vector3(tp.x, tp.y, tp.z), yaw: new THREE.Euler().setFromQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w), 'YXZ').y };
  if (anchorWait) {   // restored from the saved copy: put the lab exactly where it was
    anchorWait = null; dbg.restores++;
    lab.position.copy(now.p); lab.rotation.set(0, now.yaw, 0); lab.visible = true;
    hint.mesh.visible = false; layoutPanel(true, false); layoutHandle();
  } else if (anchorLast) {
    const dy = now.yaw - anchorLast.yaw;
    if (now.p.distanceTo(anchorLast.p) > 0.002 || Math.abs(dy) > 0.002) {   // the room "moved" (recentred): move the lab and panel with it
      for (const obj of [lab, panel.mesh]) {
        const rel = obj.position.clone().sub(anchorLast.p).applyAxisAngle(UP, dy);
        obj.position.copy(now.p).add(rel); obj.rotation.y += dy;
      }
      if (dock?.p) { dock.p.copy(now.p).add(dock.p.clone().sub(anchorLast.p).applyAxisAngle(UP, dy)); }
      dockedFrom = camera.position.clone().setY(0);   // dock again only after the student really walks from here
      panelGoal = null;
      lastHead = null;
    }
  }
  anchorLast = now;
}
// the anchor stopped being tracked for 2 s (the headset slept): reload it from the saved copy
function recoverAnchor() {
  const h = anchorHandle, session = renderer.xr.getSession();
  anchorGen++; anchor = null; anchorLast = null; anchorLostAt = 0;   // leave the lost anchor alone
  if (!h || !session?.restorePersistentAnchor) { anchorHandle = null; return replaceIfUnpinned('anchor lost'); }
  const gen = anchorGen;
  anchorWait = { at: performance.now() };
  session.restorePersistentAnchor(h).then((a) => {
    if (gen !== anchorGen) { a.delete(); return; }
    anchor = a; anchorLast = null; dbg.anchor = 'restored';
  }).catch((e) => { console.warn('saved anchor could not be restored', e); if (gen === anchorGen) { anchorWait = null; anchorHandle = null; replaceIfUnpinned('restore failed'); } });
}
// safety net: nothing is holding the lab and the view jumped (recentred), so place it again in front of the student
function replaceIfUnpinned() {
  if (mode !== 'ar' || anchor || anchorWait || placing || needsLayout || !lab.visible || grab) return;
  dbg.replaced++; replace();
}
let lastHead = null;
function checkHeadJump() {
  const C = camera.position;
  if (lastHead && xrFrames > 10 && C.distanceTo(lastHead) > 0.35) replaceIfUnpinned('jump');
  lastHead = (lastHead || new THREE.Vector3()).copy(C);
}
function anchorTick(frame) {
  if (wantAnchor) makeAnchor(frame);
  followAnchor(frame);
  if (anchor && anchorLostAt && !anchorWait && !placing && performance.now() - anchorLostAt > 2000) recoverAnchor();
  if (anchorWait && performance.now() - anchorWait.at > 6000) { anchorWait = null; anchorHandle = null; replace(); }   // not found: place again
  checkHeadJump();
}

// ═════════════ sessions ═════════════
async function enterXR(type) {
  if (renderer.xr.isPresenting) return;
  unlockAudio();
  const init = type === 'ar'
    ? { requiredFeatures: ['local-floor'], optionalFeatures: ['hit-test', 'hand-tracking', 'anchors'] }
    : { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] };
  try {
    const session = await navigator.xr.requestSession(type === 'ar' ? 'immersive-ar' : 'immersive-vr', init);
    mode = type;
    session.addEventListener('end', onSessionEnd);
    await renderer.xr.setSession(session);
    onSessionStart();
  } catch (e) { console.error(e); mode = 'desktop'; $('status').textContent = `${type === 'ar' ? 'Passthrough' : 'VR'}: ${e.message || e}`; }
}
function onSessionStart() {
  $('start').hidden = true; $('menu').hidden = true;
  controls.enabled = false;
  if (panel.mesh.parent !== scene) scene.add(panel.mesh);
  if (mode === 'ar') { scene.background = null; ground.visible = false; renderer.setClearColor(0x000000, 0); }
  else { scene.background = BG; ground.visible = true; }
  lab.visible = false; needsLayout = true; xrFrames = 0; anchor = null; anchorLast = null; wantAnchor = false; anchorGen++;
  anchorHandle = null; anchorLostAt = 0; anchorWait = null; lastHead = null;
  renderer.xr.getReferenceSpace()?.addEventListener?.('reset', () => replaceIfUnpinned('reset'));
  renderer.xr.getSession()?.addEventListener?.('visibilitychange', () => { lastHead = null; });
  setFrozen(frozen); refresh();
}
function onSessionEnd() {
  mode = 'desktop'; placing = false; pull = null; drag = null; grab = null; knob.visible = knobStem.visible = bar.visible = false;
  anchor = null; anchorLast = null; wantAnchor = false; anchorGen++; anchorHandle = null; anchorWait = null;
  scene.background = BG; ground.visible = true; reticle.visible = false; hint.mesh.visible = false;
  controls.enabled = true; layoutDesktop(); onResize(); refresh();
  $('start').hidden = false; setFrozen(frozen);
}

// ═════════════ preview on a screen (Chromebook, projector) ═════════════
function layoutDesktop() {
  lab.position.set(0, 0, 0); lab.rotation.set(0, 0, 0); lab.scale.setScalar(1); lab.visible = true;
  camera.position.set(-0.9, 2.9, 5.6); controls.target.set(-0.5, 0.35, 0.4); controls.update();
  camera.add(panel.mesh); panel.mesh.position.set(0, 0, -1.3); panel.mesh.rotation.set(0, 0, 0);
  sizeLabels(); layoutHandle(); placeDesktopPanel();
}
function placeDesktopPanel() {   // the panel sits on the right of the screen
  if (panel.mesh.parent !== camera) return;
  const dist = 1.3, h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), w = h * camera.aspect;
  if (panel.base !== 1) panel.setBase(1);
  const pw = panel.mW * panel.zoom;
  const narrow = camera.aspect < 1.1;
  const s = narrow ? Math.min(1, (w * 0.96) / pw) : Math.min(1, (h * 0.95) / (panel.heightM() || 1), (w * 0.42) / pw);
  panel.mesh.scale.x = panel.zoom * s; panel.mesh.scale.y = panel.zoom * s * panel.usedH / panel.canvas.height;
  const top = h / 2 - 0.02;
  panel.mesh.position.set(narrow ? 0 : w / 2 - pw * s / 2 - 0.02, top - panel.heightM() * s / 2, -dist);
}
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  placeDesktopPanel();
}
window.addEventListener('resize', onResize);

// ═════════════ the 2D start page ═════════════
function syncPage() {
  const t = T();
  document.documentElement.lang = S.lang;
  document.body.classList.toggle('big-text', S.big);
  $('title').textContent = t.labTitle; $('kicker').textContent = t.labSub; $('intro').textContent = t.intro;
  $('l-lang').textContent = t.language; $('l-size').textContent = t.size; $('l-acc').textContent = t.supports;
  $('btn-ar').textContent = t.enterAR; $('btn-vr').textContent = t.enterVR; $('btn-preview').textContent = t.preview;
  $('credit').textContent = t.credit; $('privacy').textContent = ROOM ? t.privacyConsole : t.privacy;
  syncHeadsetRow(t);
  document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('sel', b.dataset.lang === S.lang));
  const sz = $('size-seg'); sz.innerHTML = '';
  for (const s of SIZES) { const b = document.createElement('button'); b.textContent = t.sizes[s]; b.classList.toggle('sel', s === S.size); b.onclick = () => { setSize(s); syncPage(); refresh(); }; sz.appendChild(b); }
  $('size-row').hidden = SIZES.length < 2; $('size-note').textContent = t.sizeNotes[S.size];
  const acc = $('acc-seg'); acc.innerHTML = '';
  for (const k of ['big', 'calm', 'num']) { const b = document.createElement('button'); b.textContent = t[{ big: 'bigText', calm: 'calm', num: 'number' }[k]]; b.classList.toggle('sel', S[k]); b.onclick = () => { S[k] = !S[k]; syncPage(); updateLoupe(); refresh(); placeDesktopPanel(); }; acc.appendChild(b); }
  $('menu').textContent = '☰ ' + t.labTitle;
}
// headset number (only when the teacher console is on): the sticker number decides which teacher page this headset follows
let pickingHeadset = false;
function syncHeadsetRow(t) {
  $('hs-row').hidden = !consoleOn() || roomOff || !!roomParam;
  if ($('hs-row').hidden) { $('status').dataset.console = ''; return; }
  $('l-hs').textContent = t.headset;
  const g = groupOf(HEADSET), picking = HEADSET == null || pickingHeadset;
  const now = $('hs-now'); now.innerHTML = '';
  if (!picking) {
    now.append(t.headsetIs(HEADSET, g?.name) + ' · ');
    const ch = document.createElement('a'); ch.href = '#'; ch.textContent = t.change; ch.style.color = 'var(--gold)';
    ch.onclick = (e) => { e.preventDefault(); pickingHeadset = true; syncPage(); }; now.append(ch);
  }
  const seg = $('hs-seg'); seg.innerHTML = ''; seg.hidden = !picking;
  for (const gr of GROUPS) for (let n = gr.first; n <= gr.last; n++) {
    const b = document.createElement('button'); b.textContent = String(n); b.dataset.hs = n; b.classList.toggle('sel', n === HEADSET);
    b.onclick = () => { pickingHeadset = false; setHeadset(n); }; seg.appendChild(b);
  }
  $('hs-note').textContent = [picking ? t.headsetHint : '', t.consoleStatus[roomStatus] || ''].filter(Boolean).join(' ');
}
document.querySelectorAll('[data-lang]').forEach((b) => { b.onclick = () => { S.lang = b.dataset.lang; relabel(); syncPage(); refresh(); placeDesktopPanel(); }; });
$('btn-ar').onclick = () => enterXR('ar');
$('btn-vr').onclick = () => enterXR('vr');
$('btn-preview').onclick = () => { unlockAudio(); $('start').hidden = true; $('menu').hidden = false; };
$('menu').onclick = () => { $('start').hidden = false; $('menu').hidden = true; };
async function checkXR() {
  const ar = await navigator.xr?.isSessionSupported?.('immersive-ar').catch(() => false);
  const vr = !ar && await navigator.xr?.isSessionSupported?.('immersive-vr').catch(() => false);
  $('btn-ar').hidden = !ar; $('btn-vr').hidden = !vr;
  $('noxr').hidden = !!(ar || vr); $('noxr').textContent = T().noXR;
}

// ═════════════ teacher console (optional, read-only) ═════════════
// The headset only LISTENS to a tiny settings record for its room; it never sends anything. Only changes are applied,
// so a student's own choices (language, size, supports) stay until the teacher changes that same setting.
const freezeScene = new THREE.Scene();
const freezePanel = new LabPanel(560); freezeScene.add(freezePanel.mesh);
const roomParam = (params.get('room') || '').toLowerCase();
const roomOff = /^(off|none)$/.test(roomParam);
const groupOf = (n) => (n == null ? null : GROUPS.find((g) => n >= g.first && n <= g.last) || null);
const validHeadset = (v) => v != null && /^1?[0-9]$/.test(String(v)) && !!groupOf(+v);
let HEADSET = consoleOn() ? readHeadset(params.get('headset'), validHeadset) : null;
const roomFor = () => (roomOff || !consoleOn() ? '' : roomParam || groupOf(HEADSET)?.room || DEFAULT_ROOM);
let ROOM = roomFor(), roomStatus = consoleOn() && ROOM ? 'connecting' : 'off', roomSub = null;
let remote = {}, want = null, restartSeen = null;

async function startListening() {
  if (!ROOM) return;
  const room = ROOM;
  try {
    const mod = await import('./classroom.js');
    const sub = await mod.listen(room, (r) => { if (room === ROOM) applyRoom(r); }, (st) => { if (room === ROOM) { roomStatus = st; syncPage(); } });
    if (room !== ROOM) sub?.stop(); else roomSub = sub;
  } catch (e) { console.warn('classroom', e); roomStatus = 'error'; syncPage(); }
}
function setHeadset(n) {
  if (!validHeadset(n)) return;
  HEADSET = +n; saveHeadset(n);
  const r = roomFor();
  if (r !== ROOM) { roomSub?.stop(); roomSub = null; ROOM = r; remote = {}; restartSeen = null; roomStatus = 'connecting'; startListening(); }
  else applyRoom(remote);   // same room: this headset's own supports or pause may differ
  syncPage();
}
// what the room asks of THIS headset: the room-wide supports, plus any set for its number
function wanted(r) {
  const mine = (HEADSET != null && r.access?.[HEADSET]) || '';
  return { big: r.bigText === true || mine.includes('b'), calm: r.calm === true || mine.includes('c'), num: r.num === true || mine.includes('n'),
    lanyard: !(r.fireButton === true || mine.includes('f')), lang: mine.includes('s') ? 'es' : r.lang || null };
}
function applyRoom(r) {
  const changed = (k) => JSON.stringify(r[k]) !== JSON.stringify(remote[k]);
  let restart = false;
  if (changed('path') || changed('start') || changed('variable')) {
    const path = r.path || LINK.path, start = path === 'full' && (r.start || LINK.start) === 'plan' ? 'plan' : 'try', lock = r.variable || LINK.lock;
    if (path !== PATH || start !== START || lock !== S.lock) { PATH = path; START = start; S.lock = lock; GD.key = lock || 'cannon'; restart = true; }
  }
  if (changed('sizes')) {
    SIZES = r.sizes && r.sizes.length ? r.sizes : [...LINK.sizes];
    if (!SIZES.includes(S.size)) setSize(SIZES[0]);
  }
  // supports and language: only what changed since the last message (a support turned off goes back to the link's setting)
  const w = wanted(r), prev = want || wanted({});
  for (const k of ['big', 'calm', 'num', 'lanyard']) if (w[k] !== prev[k]) S[k] = w[k] === wanted({})[k] ? LINK[k] : w[k];
  if (w.lang !== prev.lang || (want === null && w.lang)) { S.lang = w.lang || LINK.lang; relabel(); }
  want = w;
  // "Start over" for everyone (only if pressed while this headset was listening)
  if (restartSeen === null) restartSeen = r.restartAt || 0;
  else if (r.restartAt > restartSeen) { restartSeen = r.restartAt; restart = true; }
  remote = { ...r };
  setFrozen(r.freeze || (HEADSET != null && (r.paused || []).includes(HEADSET) ? 'paused' : null));
  if (restart) startOver();
  syncPage(); updateLoupe(); refresh(); placeDesktopPanel();
}
function setFrozen(kind) {
  if (kind !== frozen) {
    frozen = kind;
    if (kind) { pull = null; drag = null; mouseDrag = false; endGrab(); panel.setHover(null); if (L.handle) L.handle.position.copy(handleLocal); }
  }
  if (kind) {
    const t = T();
    freezePanel.show({ kicker: t.freezeFrom, title: t.freeze[kind], blocks: [] });
    $('freeze-from').textContent = t.freezeFrom; $('freeze-text').textContent = t.freeze[kind];
  }
  $('freeze').hidden = !kind || renderer.xr.isPresenting;
}

// ═════════════ main loop ═════════════
const clock = new THREE.Clock();
renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (renderer.xr.isPresenting) xrUpdate(frame, dt);
  else { controls.update(); }
  updateAnim(dt); updateSmoke(dt); updateRope(); placeLoupe(); faceLabels();
  if (mode === 'desktop') placeDesktopPanel();
  if (frozen && renderer.xr.isPresenting) { freezeScene.background = mode === 'ar' ? null : BG; renderer.render(freezeScene, camera); }
  else renderer.render(scene, camera);
});

// ═════════════ start ═════════════
syncPage(); checkXR();
layoutDesktop();
applySettings(settings);
relabel();
refresh();
startListening();
L.ball.visible = false;
L.ready.then((m) => {
  model = m.model; wheels = m.wheels;
  $('status').textContent = '';
  window.__labReady = true;
}).catch((e) => { console.error(e); $('status').textContent = 'Could not load the cannon model.'; });

// test hooks (used by tests/; harmless otherwise)
window.__dbg = {
  THREE, S, L, panel, loupe, hint, camera, lab, scene, controls,
  state: () => ({ phase, optionsOpen, planKey, levelIdx: test.levelIdx, data: JSON.parse(JSON.stringify(test.data)), predCm: test.predCm, predFor: test.predFor,
    anim: anim ? { kind: anim.kind, t: anim.t, playing: anim.playing } : null, cannonX: L.cannonX, mode, placing, size: S.size, lang: S.lang,
    lastCm: lastShot?.cm ?? null, shotStartX, path: PATH, awaitRecord, guided: { key: GD.key, i: GD.i, results: [...GD.results] }, challenge: ch.target ? { target: ch.target.cm, result: ch.result } : null, settings: { ...settings }, frozen, room: ROOM, headset: HEADSET, roomStatus, sizes: [...SIZES], lock: S.lock, big: S.big, calm: S.calm, num: S.num, lanyard: S.lanyard,
    panelOverflow: panel.overflow, labVisible: lab.visible, handleVisible: L.handle.visible, loupe: loupe.mesh.visible }),
  press: (id) => onButton(id), freezePanel,
  knobWorld: () => knobWorld().toArray(), barWorld: () => barWorld().toArray(), movers: () => ({ knob: knob.visible, bar: bar.visible, grab: grab?.kind || null, dock: dock?.kind || null }),
  predictCm: (cm) => setPrediction(lab.localToWorld(new THREE.Vector3(-cm / 100, 0, RULER_Z))),
  handleWorld: () => L.handle.getWorldPosition(new THREE.Vector3()).toArray(),
  trackWorld: (cm) => lab.localToWorld(new THREE.Vector3(-cm / 100, 0, RULER_Z)).toArray(),
  shot, level,
  ctrls: () => controllers.map((c) => [c.userData.src?.targetRayMode || null, ctrlPos(c).toArray().map((v) => +v.toFixed(3))]), near: () => handleNear,
  anchorObj: () => anchor, anchorState: () => ({ anchor: !!anchor, saved: !!anchorHandle, waiting: !!anchorWait, ...dbg }),
  panelHits: () => panelOverlap(),
  seed: (n) => { let a = n >>> 0; rand = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
};
if (DEBUG) console.log('debug on');
