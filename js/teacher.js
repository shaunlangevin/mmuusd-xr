// Teacher console for the labs. Signed-in teachers write a tiny settings record for one room; headsets read it.
// Nothing is ever read from the headsets, and nothing about students is written: only lab settings and headset sticker numbers.
import * as CFG from './firebase-config.js';
const { FIREBASE_CONFIG, TEACHERS } = CFG;
const DEFAULT_ROOM = CFG.DEFAULT_ROOM || 'mmuusd';
const GROUPS = (Array.isArray(CFG.GROUPS) ? CFG.GROUPS : [])
  .filter((g) => /^[a-z0-9-]{1,24}$/.test(g.room) && Number.isInteger(g.first) && Number.isInteger(g.last) && g.first <= g.last && g.last <= 19);
const groupFor = (room) => GROUPS.find((g) => g.room === room) || null;

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const ROOM_RE = /^[a-z0-9-]{1,24}$/;
const PAGES = ['signedOut', 'notConfigured', 'console'];
const show = (id) => PAGES.forEach((x) => ($(x).hidden = x !== id));

// ── settings: what each one is, and what headsets do when it's left on Default ──
const ONOFF = [[true, 'On'], [false, 'Off']];
const LAB = [
  { key: 'path', label: 'Path', opts: [['guided', 'Guided'], ['full', 'Full investigation']], def: 'guided' },
  { key: 'start', label: 'Full investigation starts at', desc: 'Plan skips Try it and the 3rd-law question (for day 2)', opts: [['try', 'Try it'], ['plan', 'Plan']], def: 'try', onlyFull: true },
  { key: 'variable', label: 'Variable', desc: 'Default: cannon weight (Guided) or students choose (Full)', opts: [['ball', 'Ball'], ['cannon', 'Cannon weight'], ['powder', 'Powder'], ['wheels', 'Wheels']], def: null },
  { key: 'sizes', label: 'Sizes students can pick', desc: 'Students start at the smallest one', sizes: true },
  { key: 'lang', label: 'Language', desc: 'Students can still switch in Options', opts: [['en', 'English'], ['es', 'Español']], def: 'en' },
];
const SUPPORT_SETTINGS = [
  { key: 'bigText', label: 'Bigger text', desc: 'The panel about 30% larger', opts: ONOFF, def: false },
  { key: 'calm', label: 'Calm mode', desc: 'Quieter boom, no smoke, no pulsing glow', opts: ONOFF, def: false },
  { key: 'num', label: 'Show numbers', desc: 'Centimetre readings on the ruler and in the table', opts: ONOFF, def: false },
  { key: 'fireButton', label: 'Fire button', desc: 'A Fire button instead of pulling the cord', opts: ONOFF, def: false },
];
const SETTINGS = [...LAB, ...SUPPORT_SETTINGS];
const SET_BY_KEY = Object.fromEntries(SETTINGS.map((s) => [s.key, s]));
const SIZE_NAMES = [['desk', 'Desk'], ['half', 'Half'], ['life', 'Life size']];
// per-headset supports: letters, e.g. access/h3 = "bn"
const SUPPORTS = [['b', 'A+', 'Bigger text'], ['c', 'Calm', 'Calm mode'], ['n', '123', 'Show numbers'], ['f', 'Btn', 'Fire button'], ['s', 'ES', 'Spanish']];
const FREEZE_NAMES = { eyes: 'Eyes up', wait: 'Wait', done: 'Time to finish', remove: 'Take off headset' };
const RESTARTS = ['path', 'start', 'variable'];   // headsets start over when these change

if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.databaseURL) show('notConfigured');
else start();

async function start() {
  const fb = await import('../vendor/firebase/fb-db.js');
  const fa = await import('../vendor/firebase/fb-auth.js');
  const app = fb.initializeApp(FIREBASE_CONFIG);
  const db = fb.getDatabase(app);
  const auth = fa.getAuth(app);
  if (FIREBASE_CONFIG.emulator) { fb.connectDatabaseEmulator(db, ...FIREBASE_CONFIG.emulator); fa.connectAuthEmulator(auth, FIREBASE_CONFIG.authEmulator); }

  const provider = new fa.GoogleAuthProvider();
  provider.setCustomParameters({ hd: 'mmuusd.org', prompt: 'select_account' });
  $('signIn').onclick = () => fa.signInWithPopup(auth, provider).catch((e) => toast('Sign-in failed: ' + e.message, true));

  document.querySelectorAll('[data-help]').forEach((b) => {
    const p = b.closest('.card').querySelector('.help');
    b.setAttribute('aria-expanded', 'false');
    b.onclick = () => { p.hidden = !p.hidden; b.setAttribute('aria-expanded', String(!p.hidden)); };
  });

  let room = '', current = {}, unsub = null;

  fa.onAuthStateChanged(auth, (user) => {
    if (!user) { $('account').textContent = ''; $('strip').hidden = true; $('groupSeg').hidden = true; show('signedOut'); return; }
    const email = (user.email || '').toLowerCase();
    $('account').innerHTML = '';
    $('account').append(el('span', { textContent: email }), el('button', { textContent: 'Sign out', onclick: () => fa.signOut(auth) }));
    if (!TEACHERS.includes(email) || !user.emailVerified) {
      show('signedOut');
      $('signedOut').querySelector('p').textContent = `${email} isn't on the teacher list for this console. Ask Shaun to add you (js/firebase-config.js and the database rules).`;
      return;
    }
    show('console'); $('strip').hidden = false; $('groupSeg').hidden = GROUPS.length < 2;
    buildSettings(); buildGroups();
    // opens to your own group; teacher.html?room=<code> opens another room
    const mine = GROUPS.find((g) => (g.teacher || '').toLowerCase() === email) || GROUPS[0];
    setRoom(new URLSearchParams(location.search).get('room') || mine?.room || DEFAULT_ROOM);
  });

  // ── room ──
  function setRoom(r) {
    r = (r || '').trim().toLowerCase();
    if (!ROOM_RE.test(r)) { toast('Room codes use lowercase letters, numbers and dashes (up to 24).', true); return; }
    room = r; $('room').value = r;
    const base = new URL('./', location.href).href, g = groupFor(r);
    $('link').value = g || r === DEFAULT_ROOM ? base : `${base}?room=${r}`;
    $('linkNote').textContent = g
      ? `Headsets ${g.first}–${g.last} follow this page once they’ve picked their number.`
      : r === DEFAULT_ROOM
        ? 'Headsets that haven’t picked a number yet wait in this room.'
        : `Headsets only follow this room if their ArborXR link ends in ?room=${r}. Bookmark teacher.html?room=${r} to come back here.`;
    document.querySelectorAll('#groupSeg button').forEach((b) => b.classList.toggle('sel', b.dataset.room === r));
    buildHeadsets();
    if (unsub) unsub();
    current = {};
    unsub = fb.onValue(fb.ref(db, `rooms/${r}`), (s) => { current = s.val() || {}; render(); }, (e) => toast('Could not read the room: ' + e.message, true));
    toast(g ? `Controlling ${g.name || r} (headsets ${g.first}–${g.last})` : `Controlling room “${r}”`);
  }
  $('useRoom').onclick = () => setRoom($('room').value);
  $('room').addEventListener('keydown', (e) => { if (e.key === 'Enter') setRoom($('room').value); });
  $('copy').onclick = async () => { try { await navigator.clipboard.writeText($('link').value); toast('Link copied'); } catch { $('link').select(); } };

  // ── sending ──
  async function send(patch, label) {
    if (!room) return;
    try {
      await fb.update(fb.ref(db, `rooms/${room}`), { ...patch, updatedAt: fb.serverTimestamp() });
      toast(`Sent: ${label}`);
    } catch (e) { toast(`Not sent (${e.code || e.message}). If you just updated the site, re-publish the database rules.`, true); }
  }
  let toastTimer = null;
  function toast(msg, err = false) {
    const t = $('toast'); t.textContent = (err ? '' : '✓ ') + msg; t.className = err ? 'err' : '';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('gone'), err ? 6000 : 2200);
  }

  // ── everyone ──
  document.querySelectorAll('[data-freeze]').forEach((b) => {
    b.onclick = () => send({ freeze: b.dataset.freeze, freezeAt: fb.serverTimestamp() }, FREEZE_NAMES[b.dataset.freeze]);
  });
  $('unfreeze').onclick = () => send({ freeze: 'none', freezeAt: fb.serverTimestamp() }, 'Resume');
  let restartSure = null;   // two taps: a stray click shouldn't wipe a class's work
  $('restartAll').onclick = () => {
    if (!restartSure) {
      $('restartAll').classList.add('sure'); $('restartAll').textContent = 'Tap again to start over';
      restartSure = setTimeout(resetRestart, 4000); return;
    }
    resetRestart();
    send({ restartAt: fb.serverTimestamp() }, 'Every headset started over');
  };
  function resetRestart() { clearTimeout(restartSure); restartSure = null; $('restartAll').classList.remove('sure'); $('restartAll').textContent = '⟲ Start over on every headset'; }
  $('clear').onclick = async () => {
    if (!confirm('Reset every setting for these headsets to Default? This also ends any freeze or pause.')) return;
    try { await fb.set(fb.ref(db, `rooms/${room}`), { updatedAt: fb.serverTimestamp() }); toast('Reset to Default'); }
    catch (e) { toast(`Not reset (${e.code || e.message}).`, true); }
  };

  // ── settings, with what Default means ──
  const eff = (k) => (current[k] === undefined ? SET_BY_KEY[k].def : current[k]);
  const restartWarn = (k, v) => RESTARTS.includes(k) && v !== (current[k] ?? null) ? ' (headsets start over)' : '';
  function settingRow(s) {
    const name = el('span', {}, s.label); if (s.desc) name.append(el('small', { textContent: s.desc }));
    const seg = el('div', { className: 'seg' });
    if (s.sizes) {
      for (const [v, text] of SIZE_NAMES) {
        const b = el('button', { textContent: text, onclick: () => toggleSize(v) });
        b.dataset.key = 'sizes'; b.dataset.size = v; seg.append(b);
      }
      const b = el('button', { textContent: 'Default (all three)', onclick: () => send({ sizes: null }, 'Sizes: Default') });
      b.dataset.key = 'sizes'; b.dataset.val = 'null'; seg.append(b);
    } else {
      for (const [v, text] of s.opts) {
        const b = el('button', { textContent: text, onclick: () => send({ [s.key]: v }, `${s.label}: ${text}${restartWarn(s.key, v)}`) });
        b.dataset.key = s.key; b.dataset.val = JSON.stringify(v); seg.append(b);
      }
      const defText = s.def == null ? '' : ` (${s.opts.find(([v]) => v === s.def)?.[1]})`;
      const b = el('button', { textContent: `Default${defText}`, onclick: () => send({ [s.key]: null }, `${s.label}: Default${restartWarn(s.key, null)}`) });
      b.dataset.key = s.key; b.dataset.val = 'null'; seg.append(b);
    }
    const row = el('div', { className: 'set' }, name, seg); row.dataset.row = s.key;
    return row;
  }
  function buildSettings() {
    $('labSettings').innerHTML = ''; LAB.forEach((s) => $('labSettings').append(settingRow(s)));
    $('supportSettings').innerHTML = ''; SUPPORT_SETTINGS.forEach((s) => $('supportSettings').append(settingRow(s)));
  }
  const sizesNow = () => (typeof current.sizes === 'string' && current.sizes ? current.sizes.split(',') : SIZE_NAMES.map(([v]) => v));
  function toggleSize(v) {
    const now = sizesNow(), on = now.includes(v);
    if (on && now.length === 1) { toast('Students need at least one size.', true); return; }
    const next = SIZE_NAMES.map(([x]) => x).filter((x) => (x === v ? !on : now.includes(x)));
    send({ sizes: next.length === 3 ? null : next.join(',') }, `Sizes: ${next.map((x) => SIZE_NAMES.find(([y]) => y === x)[1]).join(', ')}`);
  }

  // ── headsets: groups, pause tiles, supports for one headset ──
  const PAUSE_MAX = 2 * 3600e3;
  const pausedNow = (i) => { const v = current.paused && current.paused['h' + i]; return typeof v === 'number' && Date.now() - v < PAUSE_MAX; };
  function buildGroups() {
    const seg = $('groupSeg'); seg.innerHTML = '';
    for (const g of GROUPS) {
      const b = el('button', { textContent: g.name ? `${g.name} (${g.first}–${g.last})` : `Headsets ${g.first}–${g.last}`, onclick: () => setRoom(g.room) });
      b.dataset.room = g.room; seg.append(b);
    }
  }
  const headsetNums = () => { const g = groupFor(room), list = g ? [g] : GROUPS; const out = [];
    if (!list.length) return out;
    for (let i = Math.min(...list.map((x) => x.first)); i <= Math.max(...list.map((x) => x.last)); i++) out.push(i); return out; };
  function buildHeadsets() {
    const box = $('headsets'); box.innerHTML = '';
    for (const i of headsetNums()) {
      const b = el('button', { onclick: () => send({ ['paused/h' + i]: pausedNow(i) ? null : fb.serverTimestamp() }, `${pausedNow(i) ? 'Resumed' : 'Paused'} headset ${i}`) },
        String(i), el('small'));
      b.dataset.hs = i; box.append(b);
    }
    const sup = $('supports'); sup.innerHTML = '';
    for (const i of headsetNums()) {
      const row = el('div', { className: 'sup' }, el('b', { textContent: String(i) }));
      for (const [l, short, name] of SUPPORTS) {
        const b = el('button', { textContent: short, title: name, onclick: () => toggleSupport(i, l, name) });
        b.dataset.hs = i; b.dataset.sup = l; b.setAttribute('aria-label', `${name} for headset ${i}`); row.append(b);
      }
      sup.append(row);
    }
  }
  const accessMap = () => { const a = current.access && typeof current.access === 'object' ? current.access : {};
    return Object.fromEntries(Object.entries(a).filter(([k, v]) => /^h1?[0-9]$/.test(k) && typeof v === 'string' && /^[bcnfs]{1,5}$/.test(v))); };
  function toggleSupport(i, letter, name) {
    const cur = accessMap()['h' + i] || '', on = cur.includes(letter);
    const next = SUPPORTS.map(([l]) => l).filter((l) => (l === letter ? !on : cur.includes(l))).join('');
    send({ ['access/h' + i]: next || null }, `${name} ${on ? 'off' : 'on'} for headset ${i}`);
  }
  $('clearSupports').onclick = () => {
    const patch = Object.fromEntries(Object.keys(accessMap()).map((k) => ['access/' + k, null]));
    if (Object.keys(patch).length) send(patch, 'Supports cleared for every headset');
  };

  // ── draw everything from the room record ──
  const VAR_NAMES = Object.fromEntries(SET_BY_KEY.variable.opts);
  function render() {
    const frozen = current.freeze && current.freeze !== 'none' && Date.now() - (current.freezeAt || 0) < 2 * 3600e3 ? current.freeze : null;
    const pausedList = headsetNums().filter(pausedNow);
    const full = eff('path') === 'full';

    const strip = $('strip'); strip.innerHTML = '';
    const pill = (text, cls = '') => strip.append(el('span', { className: 'pill ' + cls, textContent: text }));
    if (frozen) pill(`Frozen: ${FREEZE_NAMES[frozen]}`, 'stop');
    pill(full ? `Full investigation${eff('start') === 'plan' ? ', starting at Plan' : ''}` : 'Guided path');
    pill(`Variable: ${current.variable ? VAR_NAMES[current.variable] : full ? 'students choose' : 'cannon weight'}`);
    if (current.sizes) pill(`Sizes: ${sizesNow().map((x) => SIZE_NAMES.find(([y]) => y === x)[1]).join(', ')}`);
    if (current.lang) pill(current.lang === 'es' ? 'Español' : 'English');
    if (pausedList.length) pill(`Paused: headset${pausedList.length > 1 ? 's' : ''} ${pausedList.join(', ')}`, 'warn');
    const roomSup = SUPPORT_SETTINGS.filter((s) => eff(s.key) === true).map((s) => s.label);
    if (roomSup.length) pill(`Supports for everyone: ${roomSup.join(', ')}`);
    const hsSup = Object.entries(accessMap()).map(([h, v]) => `${h.slice(1)} (${SUPPORTS.filter(([l]) => v.includes(l)).map(([, short]) => short).join(' ')})`);
    if (hsSup.length) pill(`Supports: headset ${hsSup.join(', ')}`);

    document.querySelectorAll('[data-freeze]').forEach((b) => b.classList.toggle('sel', frozen === b.dataset.freeze));
    $('unfreeze').disabled = !frozen;
    $('everyone').classList.toggle('frozen', !!frozen);
    const ago = typeof current.restartAt === 'number' ? Math.round((Date.now() - current.restartAt) / 60000) : null;
    $('restartNote').textContent = ago == null ? '' : ago < 1 ? 'Last started over just now.' : `Last started over ${ago} min ago.`;

    document.querySelector('[data-row="start"]').hidden = !full;
    document.querySelectorAll('#labSettings button, #supportSettings button').forEach((b) => {
      const k = b.dataset.key;
      const sel = b.dataset.size ? sizesNow().includes(b.dataset.size)
        : JSON.stringify(current[k] === undefined ? null : current[k]) === b.dataset.val;
      b.classList.toggle('sel', sel); b.setAttribute('aria-pressed', String(sel));
    });
    document.querySelectorAll('#supports [data-sup]').forEach((b) => {
      const on = (accessMap()['h' + b.dataset.hs] || '').includes(b.dataset.sup);
      b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on));
    });
    $('clearSupports').disabled = !Object.keys(accessMap()).length;
    document.querySelectorAll('#headsets button').forEach((b) => {
      const p = pausedNow(+b.dataset.hs); b.classList.toggle('sel', p); b.querySelector('small').textContent = p ? 'paused' : '';
      b.setAttribute('aria-pressed', String(p));
    });
  }
  setInterval(() => { if (room) render(); }, 30000);   // "started over N min ago", expiring pauses

  // ── live safety check against the real database rules ──
  $('runCheck').onclick = async () => {
    const list = $('checks'); list.innerHTML = '';
    const line = (ok, text) => list.append(el('li', { className: ok ? 'ok' : 'bad', textContent: (ok ? '✓ ' : '✗ ') + text }));
    const expectFail = async (p) => { try { await p; return false; } catch (e) { return /permission|denied/i.test(e.code || e.message); } };
    const expectOk = async (p) => { try { await p; return true; } catch { return false; } };
    const target = `rooms/${room}`, ts = () => fb.serverTimestamp();
    // a second connection that is NOT signed in, like a headset or a stranger
    const anonApp = fb.initializeApp(FIREBASE_CONFIG, 'safety-check-' + Date.now());
    const anon = fb.getDatabase(anonApp);
    if (FIREBASE_CONFIG.emulator) fb.connectDatabaseEmulator(anon, ...FIREBASE_CONFIG.emulator);
    line(await expectFail(fb.update(fb.ref(anon, target), { path: 'full', updatedAt: ts() })), 'Someone not signed in cannot send settings');
    line(await expectFail(fb.get(fb.ref(anon, '/'))), 'Nobody can list or read the whole database');
    line(await expectFail(fb.get(fb.ref(anon, 'rooms'))), 'Nobody can list the other rooms');
    line(await expectOk(fb.get(fb.ref(anon, target))), 'Headsets can read this room’s settings');
    line(await expectFail(fb.update(fb.ref(anon, target), { restartAt: ts(), updatedAt: ts() })), 'Someone not signed in cannot start headsets over');
    fb.goOffline(anon);
    // signed in as you: junk must still be rejected
    const me = fb.ref(db, target);
    line(await expectFail(fb.update(me, { note: 'hello', updatedAt: ts() })), 'Free text is rejected (even from you)');
    line(await expectFail(fb.update(me, { path: 'other', updatedAt: ts() })), 'Unknown values are rejected');
    line(await expectFail(fb.update(me, { freeze: 'Click this link', freezeAt: ts(), updatedAt: ts() })), 'Custom freeze messages are rejected');
    line(await expectFail(fb.update(me, { sizes: 'desk,giant', updatedAt: ts() })), 'Only the three sizes are accepted');
    line(await expectFail(fb.update(me, { 'paused/student-name': ts(), updatedAt: ts() })), 'Only headset numbers can be paused (no names)');
    line(await expectFail(fb.update(me, { 'access/h1': 'hello', updatedAt: ts() })), 'Supports only accept the five support letters (no text)');
    line(await expectFail(fb.update(me, { 'access/student-name': 'b', updatedAt: ts() })), 'Supports are only for headset numbers (no names)');
    line(await expectOk(fb.update(me, { updatedAt: ts() })), 'Your account can send normal settings');
  };

  window.__teacher = { send, setRoom, get current() { return current; } };
}
