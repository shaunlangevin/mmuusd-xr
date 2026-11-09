// Database rules: a small offline evaluator for firebase/database.rules.json (covers the rule
// features this project uses), plus a cross-check that the rules, the headset filter (classroom.js)
// and the teacher console all agree on the same fields. The live "Run safety check" on the teacher
// page is still the real test against Google's servers.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, ok, eq } from './lib/helpers.mjs';

const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase/database.rules.json'), 'utf8')).rules;
const ROOM_RULES = RULES.rooms.$room;
const TEACHER = { uid: 't', token: { email: 'shaun.langevin@mmuusd.org', email_verified: true } };
const NOW = Date.now();

// String.matches(/re/) as in Firebase rules (only inside this test process)
if (!String.prototype.matches) Object.defineProperty(String.prototype, 'matches', { value(re) { return re.test(String(this)); } });
const snap = (v) => ({
  val: () => v, exists: () => v !== undefined && v !== null,
  isBoolean: () => typeof v === 'boolean', isString: () => typeof v === 'string', isNumber: () => typeof v === 'number',
  hasChildren: (keys) => v !== null && typeof v === 'object' && (keys ? keys.every((k) => k in v) : Object.keys(v).length > 0),
});
const evalRule = (expr, vars) => {
  if (expr === true || expr === false) return expr;
  const names = Object.keys(vars);
  return Function(...names, `"use strict"; return (${expr});`)(...names.map((n) => vars[n]));
};
// validate a node and its children against a rules node
function validate(rules, value, vars, where) {
  if (value === undefined || value === null) return null;
  if ('.validate' in rules && !evalRule(rules['.validate'], { ...vars, newData: snap(value), now: NOW })) return `${where} failed .validate`;
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      let child = rules[k], cv = vars;
      if (!child) { const w = Object.keys(rules).find((x) => x.startsWith('$') && x !== '$other'); if (w) { child = rules[w]; cv = { ...vars, [w]: k }; } }
      if (!child) child = rules.$other;
      if (!child) continue;
      if (child === false || child['.validate'] === false) return `${where}/${k} is not an allowed field`;
      const r = validate(child, v, cv, `${where}/${k}`); if (r) return r;
    }
  }
  return null;
}
// apply an update() the way the teacher page sends it, then check .write and .validate
function tryUpdate(roomName, patch, { auth = TEACHER, existing = {} } = {}) {
  const vars = { $room: roomName, auth, now: NOW };
  if (!evalRule(ROOM_RULES['.write'], { ...vars, newData: snap(null) })) return 'write denied';
  const next = JSON.parse(JSON.stringify(existing));
  for (const [key, v] of Object.entries(patch)) {
    const ks = key.split('/'); let o = next;
    for (const k of ks.slice(0, -1)) o = (o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {});
    const val = v && v['.sv'] === 'timestamp' ? NOW : v;
    if (val === null) delete o[ks.at(-1)]; else o[ks.at(-1)] = val;
  }
  // like Firebase: a node left with no children no longer exists
  const prune = (o) => { for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') { prune(o[k]); if (!Object.keys(o[k]).length) delete o[k]; } };
  prune(next);
  return validate(ROOM_RULES, next, vars, `rooms/${roomName}`);
}
const TS = { '.sv': 'timestamp' };
const good = (patch, msg, opts) => { const r = tryUpdate('south', { ...patch, updatedAt: TS }, opts); ok(r === null, `${msg} should be allowed (${r})`); };
const bad = (patch, msg, opts) => ok(tryUpdate('south', { updatedAt: TS, ...patch }, opts) !== null, `${msg} should be rejected`);

export default (test) => {
  test('rules: only the two verified teachers can write', () => {
    bad({ path: 'full' }, 'a signed-out write', { auth: null });
    bad({ path: 'full' }, 'an unverified teacher', { auth: { token: { email: 'shaun.langevin@mmuusd.org', email_verified: false } } });
    bad({ path: 'full' }, 'another district account', { auth: { token: { email: 'student@mmuusd.org', email_verified: true } } });
    good({ path: 'full' }, 'Shaun');
    good({ path: 'full' }, 'Mike', { auth: { token: { email: 'mike.weber@mmuusd.org', email_verified: true } } });
    ok(tryUpdate('Bad Room!', { path: 'full', updatedAt: TS }) !== null, 'a room name with spaces/capitals should be rejected');
    ok(!evalRule(RULES['.read'], {}) && !evalRule(RULES['.write'], {}), 'the database root must not be readable or writable');
    ok(evalRule(ROOM_RULES['.read'], { $room: 'south' }) && !evalRule(ROOM_RULES['.read'], { $room: '../x' }), 'rooms are readable only by valid name');
  });

  test('rules: every console command is accepted', () => {
    const cmds = [
      { path: 'guided' }, { path: 'full', start: 'plan' }, { start: 'try' }, { variable: 'ball' }, { variable: 'wheels' }, { variable: null },
      { sizes: 'desk' }, { sizes: 'half,life' }, { sizes: 'desk,half,life' }, { sizes: null }, { lang: 'es' },
      { bigText: true, calm: false, num: true, fireButton: true }, { freeze: 'eyes', freezeAt: TS }, { freeze: 'none', freezeAt: TS }, { restartAt: TS },
      { 'paused/h0': TS }, { 'paused/h11': TS }, { 'paused/h3': null }, { 'access/h3': 'b' }, { 'access/h19': 'bcnfs' }, { 'access/h3': null },
    ];
    for (const c of cmds) good(c, JSON.stringify(c));
  });

  test('rules: junk, free text and names are rejected', () => {
    bad({ note: 'hello' }, 'a free-text field');
    bad({ path: 'other' }, 'an unknown path'); bad({ variable: 'gravity' }, 'an unknown variable'); bad({ lang: 'fr' }, 'an unknown language');
    bad({ sizes: 'desk,giant' }, 'an unknown size'); bad({ sizes: '' }, 'no sizes'); bad({ sizes: 'desk,half,life,desk' }, 'four sizes');
    bad({ freeze: 'Click this link' }, 'a custom freeze message');
    bad({ restartAt: NOW + 3600e3 }, 'a time in the future'); bad({ restartAt: 'now' }, 'restart as text');
    bad({ 'paused/student-name': TS }, 'pausing by name'); bad({ 'paused/h1': 'hello' }, 'a pause carrying text'); bad({ 'paused/h20': TS }, 'headset 20');
    bad({ 'access/h1': 'hello' }, 'a support carrying text'); bad({ 'access/h1': 'bbbbbb' }, 'too many support letters');
    bad({ 'access/h1': 'x' }, 'an unknown support letter'); bad({ 'access/maria': 'b' }, 'a support by name'); bad({ access: 'bc' }, 'access as a plain string');
    bad({ bigText: 'yes' }, 'a support as text'); bad({ fireButton: 1 }, 'a support as a number');
    ok(tryUpdate('south', { path: 'full' }) !== null, 'a write without updatedAt should be rejected');
  });

  test('rules, headset filter and console agree on the fields', async () => {
    const ruleKeys = Object.keys(ROOM_RULES).filter((k) => !k.startsWith('.') && !k.startsWith('$'));
    const cls = fs.readFileSync(path.join(ROOT, 'js/classroom.js'), 'utf8');
    const read = new Set([...cls.matchAll(/\br\.(\w+)/g)].map((m) => m[1]).concat([...cls.matchAll(/bool\('(\w+)'\)/g)].map((m) => m[1])));
    eq([...read].filter((k) => !ruleKeys.includes(k)).sort(), [], 'headsets read fields the rules never allow');
    const unread = ruleKeys.filter((k) => !read.has(k) && k !== 'updatedAt');
    eq(unread, [], 'rules allow fields the headsets ignore (remove them, or teach classroom.js)');
    const tjs = fs.readFileSync(path.join(ROOT, 'js/teacher.js'), 'utf8');
    const sent = new Set([...tjs.matchAll(/key: '(\w+)'/g)].map((m) => m[1])
      .concat([...tjs.matchAll(/send\(\{\s*(\w+):/g)].map((m) => m[1]))
      .concat([...tjs.matchAll(/\['(paused|access)\/h'/g)].map((m) => m[1])));
    eq([...sent].filter((k) => !ruleKeys.includes(k)).sort(), [], 'the console sends fields the rules would reject');
    eq(ruleKeys.filter((k) => !sent.has(k) && !['updatedAt', 'freezeAt'].includes(k)), [], 'rules allow fields the console never sends');
    ok(/access\/h1/.test(tjs) && /paused\/student-name/.test(tjs) && /sizes: 'desk,giant'/.test(tjs), 'safety check should test pauses, supports and sizes');
  });

  test('the config is the labs project, and its teachers match the rules', async () => {
    const cfg = await import(pathToFileURL(path.join(ROOT, 'js/firebase-config.js')).href);
    const c = cfg.FIREBASE_CONFIG;
    if (c.apiKey) {
      eq([c.projectId, c.authDomain, c.databaseURL], ['mmuusd-labs', 'mmuusd-labs.firebaseapp.com', 'https://mmuusd-labs-default-rtdb.firebaseio.com'], 'the labs project (never the exhibits\' mmuusd-xr)');
      ok(/^AIza/.test(c.apiKey) && /^1:\d+:web:/.test(c.appId), 'the apiKey and appId look like Firebase values');
    }
    const ruleEmails = [...ROOM_RULES['.write'].matchAll(/auth\.token\.email == '([^']+)'/g)].map((m) => m[1]).sort();
    eq([...cfg.TEACHERS].sort(), ruleEmails, 'TEACHERS in firebase-config.js and the emails in the rules');
  });

  test('headset filter (clean) keeps only safe, fresh values', async () => {
    const { clean } = await import(pathToFileURL(path.join(ROOT, 'js/classroom.js')).href);
    const now = Date.now(), H = 3600e3;
    const c = clean({ path: 'full', start: 'later', variable: 'gravity', sizes: 'life,desk', lang: 'es', note: 'hi', freeze: 'eyes', freezeAt: now - 3 * H,
      restartAt: now - 11 * 60e3, paused: { h3: now, h4: now - 3 * H, bob: now }, access: { h2: 'bc', h5: 'zz', sam: 'b' }, bigText: true, calm: 'yes', fireButton: false }, now);
    eq([c.path, c.lang], ['full', 'es'], 'path and language'); ok(!('note' in c) && !('start' in c) && !('variable' in c), 'junk and unknown values dropped');
    eq(c.sizes, ['desk', 'life'], 'sizes, smallest first'); eq(c.freeze, null, 'a freeze older than 2 hours is ignored');
    eq(c.restartAt, 0, 'a "Start over" older than 10 minutes is ignored');
    eq(c.paused, [3], 'only fresh pauses by number'); eq(c.access, { 2: 'bc' }, 'only valid supports by number');
    eq([c.bigText, c.fireButton], [true, false], 'room supports'); ok(!('calm' in c), 'a non-boolean support is dropped');
    eq(clean({ freeze: 'wait', freezeAt: now, restartAt: now, variable: 'ball' }, now), { variable: 'ball', access: {}, paused: [], freeze: 'wait', restartAt: now }, 'fresh values');
    eq(clean(null, now), { access: {}, paused: [], freeze: null, restartAt: 0 }, 'an empty room');
  });
};
