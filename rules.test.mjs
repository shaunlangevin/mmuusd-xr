// Database rules: a small offline evaluator for firebase/database.rules.json (covers the rule
// features this project uses), plus a cross-check that the rules, the headset filter (classroom.js)
// and the teacher console all agree on the same fields. The live "Run safety check" on the teacher
// page is still the real test against Google's servers.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, ok, eq, readJSON } from './lib/helpers.mjs';

const RULES = readJSON('firebase/database.rules.json').rules;
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
    bad({ lang: 'en' }, 'a signed-out write', { auth: null });
    bad({ lang: 'en' }, 'an unverified teacher', { auth: { token: { email: 'shaun.langevin@mmuusd.org', email_verified: false } } });
    bad({ lang: 'en' }, 'another district account', { auth: { token: { email: 'student@mmuusd.org', email_verified: true } } });
    good({ lang: 'en' }, 'Shaun');
    good({ lang: 'en' }, 'Mike', { auth: { token: { email: 'mike.weber@mmuusd.org', email_verified: true } } });
    ok(tryUpdate('Bad Room!', { lang: 'en', updatedAt: TS }) !== null, 'a room name with spaces/capitals should be rejected');
    ok(!evalRule(RULES['.read'], {}) && !evalRule(RULES['.write'], {}), 'the database root must not be readable or writable');
    ok(evalRule(ROOM_RULES['.read'], { $room: 'south' }) && !evalRule(ROOM_RULES['.read'], { $room: '../x' }), 'rooms are readable only by valid name');
  });

  test('rules: every console command is accepted', () => {
    const cmds = [
      { exhibit: 'rosetta-stone', kit: 'g5-egypt' }, { lang: 'es' }, { progress: false, detective: true, lock: true },
      { mode: 'seated', size: 'table' }, { dot: 20, dotAt: TS }, { freeze: 'eyes', freezeAt: TS }, { freeze: 'none', freezeAt: TS },
      { tour: true, tourDot: 1, tourAt: TS }, { narrate: 3, narrateAt: TS }, { reveal: 3, revealAt: TS },
      { moveWindows: false, notice: true, practice: true, moveStone: false }, { 'paused/h0': TS }, { 'paused/h11': TS }, { 'paused/h3': null },
      { bigText: true, readAloud: true, calm: false }, { 'access/h3': 'b' }, { 'access/h19': 'brc' }, { 'access/h3': null },
      { exhibit: null, kit: null },
    ];
    for (const c of cmds) good(c, JSON.stringify(c));
  });

  test('rules: junk, free text and names are rejected', () => {
    bad({ note: 'hello' }, 'a free-text field');
    bad({ lang: 'fr' }, 'an unknown language');
    bad({ freeze: 'Click this link' }, 'a custom freeze message');
    bad({ dot: 21 }, 'dot 21'); bad({ dot: 2.5 }, 'dot 2.5'); bad({ tourDot: 0 }, 'tour step 0');
    bad({ exhibit: 'https://evil.example' }, 'a URL as an exhibit');
    bad({ dotAt: NOW + 3600e3 }, 'a time in the future');
    bad({ 'paused/student-name': TS }, 'pausing by name'); bad({ 'paused/h1': 'hello' }, 'a pause carrying text'); bad({ 'paused/h20': TS }, 'headset 20');
    bad({ 'access/h1': 'hello' }, 'a support carrying text'); bad({ 'access/h1': 'bbbb' }, 'too many support letters');
    bad({ 'access/h1': 'x' }, 'an unknown support letter'); bad({ 'access/maria': 'b' }, 'a support by name'); bad({ access: 'brc' }, 'access as a plain string');
    bad({ bigText: 'yes' }, 'a support as text');
    ok(tryUpdate('south', { lang: 'en' }) !== null, 'a write without updatedAt should be rejected');
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
    // the console's safety check covers the newest fields too
    ok(/access\/h1/.test(tjs) && /paused\/student-name/.test(tjs), 'safety check should test pauses and supports');
  });

  test('headset filter (clean) keeps only safe, fresh values', async () => {
    const { clean } = await import(pathToFileURL(path.join(ROOT, 'js/classroom.js')).href);
    const now = Date.now(), H = 3600e3;
    const c = clean({ lang: 'es', note: 'hi', exhibit: 'Bad Name', kit: 'g5-egypt', dot: 3, dotAt: now - 11 * 60e3, freeze: 'eyes', freezeAt: now - 3 * H,
      tour: true, tourDot: 2, tourAt: now, narrate: 2, narrateAt: now - 30e3, paused: { h3: now, h4: now - 3 * H, bob: now }, access: { h2: 'rc', h5: 'zz', sam: 'b' },
      bigText: true, calm: 'yes', reveal: 2, revealAt: now }, now);
    eq(c.lang, 'es', 'language'); ok(!('note' in c) && !('exhibit' in c), 'junk and bad names dropped'); eq(c.kit, 'g5-egypt', 'kit');
    ok(!('dot' in c), 'a "go to dot" older than 10 minutes is ignored'); eq(c.freeze, null, 'a freeze older than 2 hours is ignored');
    eq([c.tour, c.tourDot], [true, 2], 'tour'); ok(!('narrate' in c), 'narration older than 20 s is ignored');
    eq(c.paused, [3], 'only fresh pauses by number'); eq(c.access, { 2: 'rc' }, 'only valid supports by number');
    eq(c.bigText, true, 'room support'); ok(!('calm' in c), 'a non-boolean support is dropped'); eq(c.reveal, 2, 'reveal');
  });
};
