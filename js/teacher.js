// Teacher console. Signed-in teachers write a tiny settings record for one room;
// headsets read it. Nothing is ever read from the headsets.
// Two tabs: Set up (before class) and Teach (during the lesson).
import * as CFG from './firebase-config.js';
const { FIREBASE_CONFIG, TEACHERS } = CFG;
const DEFAULT_ROOM = CFG.DEFAULT_ROOM || 'mmuusd';
// headset groups: a headset's number decides which room it follows (see js/firebase-config.js)
const GROUPS = (Array.isArray(CFG.GROUPS) && CFG.GROUPS.length ? CFG.GROUPS : [{ name: '', room: DEFAULT_ROOM, first: 0, last: (CFG.HEADSETS || 6) - 1 }])
  .filter((g) => /^[a-z0-9-]{1,24}$/.test(g.room) && Number.isInteger(g.first) && Number.isInteger(g.last) && g.first <= g.last && g.last <= 19);
const groupFor = (room) => GROUPS.find((g) => g.room === room) || null;

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const ROOM_RE = /^[a-z0-9-]{1,24}$/;
const PAGES = ['signedOut', 'notConfigured', 'setup', 'teach'];
const show = (id) => PAGES.forEach((x) => ($(x).hidden = x !== id));

// ── settings: what each one is, and what headsets do when it's left on Default ──
const ONOFF = [[true, 'On'], [false, 'Off']];
const SETTINGS = [
  { group: 'What students see' },
  { key: 'lang', label: 'Language', opts: [['en', 'English'], ['es', 'Español']], def: 'en' },
  { key: 'notice', label: 'Notice first', desc: 'A look-closely prompt before each reading', opts: ONOFF, def: true },
  { key: 'progress', label: 'Track progress', desc: 'Explored dots turn green; a big question at the end', opts: ONOFF, def: true },
  { key: 'detective', label: 'Detective mode', desc: 'Dots start hidden behind clues', opts: ONOFF, def: false },
  { group: 'How students use it' },
  { key: 'mode', label: 'Students are', opts: [['walk', 'Walking'], ['seated', 'Seated']], def: 'walk' },
  { key: 'size', label: 'Size', opts: [['life', 'Life size'], ['table', 'Table size']], def: 'life' },
  { key: 'moveStone', label: 'Move button', desc: 'Lets students re-place the stone', opts: [[true, 'Show'], [false, 'Hide']], def: true },
  { key: 'moveWindows', label: 'Students can move windows', desc: 'The grab bar above reading panels', opts: ONOFF, def: true, noDefault: true },
  { key: 'practice', label: 'Practice card', desc: 'A pinch-to-practice card for first-timers', opts: ONOFF, def: false },
  { key: 'lock', label: 'Classroom lock', desc: 'Hides Options and Exit', opts: ONOFF, def: false },
];
const SET_BY_KEY = Object.fromEntries(SETTINGS.filter((s) => s.key).map((s) => [s.key, s]));
// one tap sets several options (each preset only touches the keys it lists)
const PRESETS = [
  { name: 'First-time class', desc: 'Practice card on · Notice first · Move hidden · lock on', set: { practice: true, notice: true, moveStone: false, lock: true, detective: false } },
  { name: 'Guided tour', desc: 'Notice first · Move hidden · lock on (start the tour on Teach)', set: { notice: true, moveStone: false, lock: true, practice: false, detective: false } },
  { name: 'Free explore', desc: 'Progress on · Notice first · Move shown · lock off', set: { progress: true, notice: true, moveStone: true, lock: false, detective: false } },
  { name: 'Detective challenge', desc: 'Detective on · Notice first off · progress on', set: { detective: true, notice: false, progress: true, lock: false } },
];
const FREEZE_NAMES = { eyes: 'Eyes up', wait: 'Wait', done: 'Time to finish', remove: 'Take off headset' };

if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.databaseURL) {
  show('notConfigured');
} else {
  start();
}

async function start() {
  const fb = await import('../vendor/firebase/fb-db.js');
  const fa = await import('../vendor/firebase/fb-auth.js');
  const app = fb.initializeApp(FIREBASE_CONFIG);
  const db = fb.getDatabase(app);
  const auth = fa.getAuth(app);
  if (FIREBASE_CONFIG.emulator) { fb.connectDatabaseEmulator(db, ...FIREBASE_CONFIG.emulator); fa.connectAuthEmulator(auth, FIREBASE_CONFIG.authEmulator); }

  const provider = new fa.GoogleAuthProvider();
  provider.setCustomParameters({ hd: 'mmuusd.org', prompt: 'select_account' });
  $('signIn').onclick = () => fa.signInWithPopup(auth, provider).catch((e) => alert('Sign-in failed: ' + e.message));

  // "?" buttons open a short explanation under the card title
  document.querySelectorAll('[data-help]').forEach((b) => {
    const p = b.closest('.card').querySelector('.help');
    b.setAttribute('aria-expanded', 'false');
    b.onclick = () => { p.hidden = !p.hidden; b.setAttribute('aria-expanded', String(!p.hidden)); };
  });

  // ── tabs: Set up first; #teach in the address keeps the Teach tab on reload ──
  let tab = location.hash === '#teach' ? 'teach' : 'setup', signedIn = false;
  function setTab(t) {
    tab = t;
    $('tabSetup').setAttribute('aria-selected', String(t === 'setup'));
    $('tabTeach').setAttribute('aria-selected', String(t === 'teach'));
    if (signedIn) show(t);
    history.replaceState(null, '', t === 'teach' ? '#teach' : location.pathname + location.search);
  }
  $('tabSetup').onclick = () => setTab('setup');
  $('tabTeach').onclick = () => setTab('teach');

  // exhibits (for the dot buttons)
  const index = await (await fetch('exhibits/index.json', { cache: 'no-cache' })).json();
  let exhibit = null, loadingEx = null;
  async function loadExhibit(id) {
    loadingEx = id;
    const ex = await (await fetch(`exhibits/${id}/exhibit.json`, { cache: 'no-cache' })).json(); ex.id = id;
    if (loadingEx !== id) return;
    exhibit = ex; buildDots(); render();
  }

  // ── unit kits: students only see the current kit's artifacts ──
  const known = (id) => (index.exhibits || []).some((e) => e.id === id);
  const kits = (index.kits || []).filter((k) => Array.isArray(k.exhibits) && k.exhibits.some(known));
  const exTitle = (id) => ((index.exhibits || []).find((e) => e.id === id)?.title?.en) || id;
  const curKit = () => kits.find((k) => k.id === current.kit) || kits.find((k) => k.id === index.defaultKit) || kits[0] || null;
  const curExhibit = () => { const k = curKit(); return current.exhibit && known(current.exhibit) && (!k || k.exhibits.includes(current.exhibit)) ? current.exhibit : (k ? k.exhibits.find(known) : index.default); };
  function renderKits() {
    const k = curKit(), ex = curExhibit();
    const kitSeg = $('kitSeg'); kitSeg.innerHTML = '';
    for (const x of kits) {
      const b = el('button', { textContent: x.title.en, title: x.unit || '' }); b.classList.toggle('sel', x === k);
      b.onclick = () => { if (x !== k) send({ kit: x.id, exhibit: null, tour: false, tourAt: fb.serverTimestamp() }, `Kit: ${x.title.en}`); };
      kitSeg.append(b);
    }
    const artSeg = $('artSeg'); artSeg.innerHTML = '';
    for (const id of (k ? k.exhibits.filter(known) : (index.exhibits || []).map((e) => e.id))) {
      const b = el('button', { textContent: exTitle(id) }); b.classList.toggle('sel', id === ex);
      b.onclick = () => { if (id !== ex) send({ exhibit: id, tour: false, tourAt: fb.serverTimestamp() }, `Artifact: ${exTitle(id)}`); };
      artSeg.append(b);
    }
    if (ex && (!exhibit || exhibit.id !== ex) && loadingEx !== ex) loadExhibit(ex);   // dots and tour follow the artifact
  }

  let room = '', current = {}, unsub = null;

  fa.onAuthStateChanged(auth, async (user) => {
    if (!user) { signedIn = false; $('account').textContent = ''; $('tabs').hidden = true; $('strip').hidden = true; $('groupSeg').hidden = true; show('signedOut'); return; }
    const email = (user.email || '').toLowerCase();
    $('account').innerHTML = '';
    $('account').append(el('span', { textContent: email }), el('button', { textContent: 'Sign out', onclick: () => fa.signOut(auth) }));
    if (!TEACHERS.includes(email) || !user.emailVerified) {
      show('signedOut');
      $('signedOut').querySelector('p').textContent = `${email} isn't on the teacher list for this console. Ask Shaun to add you (js/firebase-config.js and the database rules).`;
      return;
    }
    signedIn = true;
    $('tabs').hidden = false; $('strip').hidden = false; $('groupSeg').hidden = GROUPS.length < 2;
    buildPresets(); buildSettings(); buildGroups();
    setTab(tab);
    // opens to your own group (South End for Shaun, North End for Mike); teacher.html?room=<code> opens another room
    const mine = GROUPS.find((g) => (g.teacher || '').toLowerCase() === email) || GROUPS[0];
    setRoom(new URLSearchParams(location.search).get('room') || mine.room);
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

  document.querySelectorAll('[data-freeze]').forEach((b) => {
    b.onclick = () => send({ freeze: b.dataset.freeze, freezeAt: fb.serverTimestamp() }, FREEZE_NAMES[b.dataset.freeze]);
  });
  $('unfreeze').onclick = () => send({ freeze: 'none', freezeAt: fb.serverTimestamp() }, 'Resume');
  $('clear').onclick = async () => {
    if (!confirm('Reset every setting for these headsets to Default? This also ends any tour, freeze or pause.')) return;
    try { await fb.set(fb.ref(db, `rooms/${room}`), { updatedAt: fb.serverTimestamp() }); toast('Reset to Default'); }
    catch (e) { toast(`Not reset (${e.code || e.message}).`, true); }
  };

  // ── quick setup ──
  const eff = (k) => (current[k] === undefined ? SET_BY_KEY[k].def : current[k]);   // what headsets are doing
  function buildPresets() {
    const box = $('presets'); box.innerHTML = '';
    PRESETS.forEach((p, i) => {
      const b = el('button', { onclick: () => send(p.set, `Quick setup: ${p.name}`) }, p.name, el('small', { textContent: p.desc }));
      b.dataset.preset = i; box.append(b);
    });
  }

  // ── settings, grouped, with what Default means ──
  function buildSettings() {
    const box = $('settings'); box.innerHTML = '';
    for (const s of SETTINGS) {
      if (s.group) { box.append(el('h3', { textContent: s.group })); continue; }
      const name = el('span', {}, s.label); if (s.desc) name.append(el('small', { textContent: s.desc }));
      const seg = el('div', { className: 'seg' });
      for (const [v, text] of s.opts) {
        const b = el('button', { textContent: text, onclick: () => send({ [s.key]: v }, `${s.label}: ${text}`) });
        b.dataset.key = s.key; b.dataset.val = JSON.stringify(v); seg.append(b);
      }
      if (!s.noDefault) {
        const defText = s.opts.find(([v]) => v === s.def)?.[1];
        const b = el('button', { textContent: `Default (${defText})`, onclick: () => send({ [s.key]: null }, `${s.label}: Default`) });
        b.dataset.key = s.key; b.dataset.val = 'null'; seg.append(b);
      }
      box.append(el('div', { className: 'set' }, name, seg));
    }
  }

  // ── dots: send everyone to a dot, or pick the tour step ──
  function buildDots() {
    const box = $('dots'); box.innerHTML = '';
    exhibit.dots.forEach((d, i) => {
      const b = el('button', { textContent: String(i + 1), title: `${i + 1}. ${d.title.en}` });
      b.dataset.dot = i + 1; b.setAttribute('aria-label', `Dot ${i + 1}: ${d.title.en}`);
      b.onclick = () => (tourOn() ? goStep(i + 1) : send({ dot: i + 1, dotAt: fb.serverTimestamp() }, `Everyone to dot ${i + 1}`));
      box.append(b);
    });
  }

  // ── guided tour ──
  const TOUR_MAX = 3 * 3600e3;
  const tourOn = () => current.tour === true && Number.isInteger(current.tourDot) && Date.now() - (current.tourAt || 0) < TOUR_MAX;
  const nDots = () => (exhibit ? exhibit.dots.length : 0);
  const dotTitle = (n) => exhibit?.dots[n - 1]?.title.en || '';
  function goStep(n) {
    n = Math.max(1, Math.min(nDots(), n));
    send({ tour: true, tourDot: n, tourAt: fb.serverTimestamp() }, `Step ${n}: ${dotTitle(n)}`);
  }
  $('tourStart').onclick = () => goStep(1);
  $('tourPrev').onclick = () => goStep((current.tourDot || 1) - 1);
  $('tourNext').onclick = () => goStep((current.tourDot || 0) + 1);
  $('tourEnd').onclick = () => send({ tour: false, tourAt: fb.serverTimestamp() }, 'Tour ended; students explore freely');
  const revealedNow = () => tourOn() && current.reveal === current.tourDot && (current.revealAt || 0) >= (current.tourAt || 0);
  $('tourReveal').onclick = () => { if (tourOn()) send({ reveal: current.tourDot, revealAt: fb.serverTimestamp() }, `Reading shown for dot ${current.tourDot}`); };
  $('narrate').onclick = () => {
    const n = tourOn() ? current.tourDot : current.dot;
    if (n) send({ narrate: n, narrateAt: fb.serverTimestamp() }, `Narration playing for dot ${n}`);
  };

  // ── headsets: groups + pause tiles ──
  const PAUSE_MAX = 2 * 3600e3;
  const pausedNow = (i) => { const v = current.paused && current.paused['h' + i]; return typeof v === 'number' && Date.now() - v < PAUSE_MAX; };
  function buildGroups() {
    const seg = $('groupSeg'); seg.innerHTML = '';
    for (const g of GROUPS) {
      const b = el('button', { textContent: g.name ? `${g.name} (${g.first}–${g.last})` : `Headsets ${g.first}–${g.last}`, onclick: () => setRoom(g.room) });
      b.dataset.room = g.room; seg.append(b);
    }
  }
  // pause tiles for the headsets that follow this room (all of them for a custom ?room= code)
  function buildHeadsets() {
    const box = $('headsets'); box.innerHTML = '';
    const g = groupFor(room), list = g ? [g] : GROUPS;
    for (let i = Math.min(...list.map((x) => x.first)); i <= Math.max(...list.map((x) => x.last)); i++) {
      const b = el('button', { onclick: () => send({ ['paused/h' + i]: pausedNow(i) ? null : fb.serverTimestamp() }, `${pausedNow(i) ? 'Resumed' : 'Paused'} headset ${i}`) },
        String(i), el('small'));
      b.dataset.hs = i; box.append(b);
    }
  }

  // ── draw everything from the room record ──
  function render() {
    renderKits();
    const on = tourOn(), step = current.tourDot, n = nDots();
    const frozen = current.freeze && current.freeze !== 'none' && Date.now() - (current.freezeAt || 0) < 2 * 3600e3 ? current.freeze : null;
    const pausedList = [...document.querySelectorAll('#headsets button')].map((b) => +b.dataset.hs).filter(pausedNow);
    const noticeOn = eff('notice') === true;

    // status strip: what students are seeing right now
    const strip = $('strip'); strip.innerHTML = '';
    const pill = (text, cls = '') => strip.append(el('span', { className: 'pill ' + cls, textContent: text }));
    if (frozen) pill(`Frozen: ${FREEZE_NAMES[frozen]}`, 'stop');
    pill(exTitle(curExhibit()));
    if (on) {
      pill(`● Tour: step ${step} of ${n}`, 'live');
      if (noticeOn) revealedNow() ? pill('Reading shown') : pill('Reading hidden: students are noticing', 'warn');
    } else pill('Tour off: exploring freely');
    if (pausedList.length) pill(`Paused: headset${pausedList.length > 1 ? 's' : ''} ${pausedList.join(', ')}`, 'warn');

    // everyone
    document.querySelectorAll('[data-freeze]').forEach((b) => b.classList.toggle('sel', frozen === b.dataset.freeze));
    $('unfreeze').disabled = !frozen;
    $('everyone').classList.toggle('frozen', !!frozen);

    // tour
    $('tourOff').hidden = on; $('tourOn').hidden = !on; $('tourEnd').hidden = !on;
    $('tourPrev').disabled = !on || step <= 1; $('tourNext').disabled = !on || step >= n;
    $('tourCount').textContent = on ? `STEP ${step} OF ${n}` : '';
    $('tourTitle').textContent = on ? dotTitle(step) : '';
    $('dotsTitle').textContent = on ? 'Jump to a step:' : 'Send everyone to a dot:';
    document.querySelectorAll('#dots button').forEach((b) => { const d = +b.dataset.dot; b.classList.toggle('cur', on && d === step); b.classList.toggle('done', on && d < step); });
    $('tourReveal').hidden = !on || !noticeOn;
    $('tourReveal').disabled = revealedNow();
    $('tourReveal').textContent = revealedNow() ? 'Reading shown ✓' : 'Reveal reading';
    const narr = on ? step : current.dot;
    $('narrate').disabled = !narr;
    $('narrate').textContent = narr ? `▶ Play narration (dot ${narr})` : '▶ Play narration';
    $('tourNote').textContent = !on ? 'Tap a number to open that dot on every headset.'
      : noticeOn && !revealedNow() ? `Students are looking at dot ${step} and talking. Reveal the reading when they’re ready.`
        : step < n ? 'The reading is showing. Press ▶ for the next dot.' : 'Last dot. End the tour when you’re ready.';

    // pause tiles
    document.querySelectorAll('#headsets button').forEach((b) => {
      const p = pausedNow(+b.dataset.hs); b.classList.toggle('sel', p); b.querySelector('small').textContent = p ? 'paused' : '';
      b.setAttribute('aria-pressed', String(p));
    });

    // settings + presets reflect what headsets are set to
    document.querySelectorAll('#settings button').forEach((b) => {
      const k = b.dataset.key, v = current[k];
      const sel = SET_BY_KEY[k].noDefault ? JSON.stringify(eff(k)) === b.dataset.val : JSON.stringify(v === undefined ? null : v) === b.dataset.val;
      b.classList.toggle('sel', sel); b.setAttribute('aria-pressed', String(sel));
    });
    document.querySelectorAll('#presets button').forEach((b) => {
      const p = PRESETS[+b.dataset.preset];
      b.classList.toggle('sel', Object.entries(p.set).every(([k, v]) => eff(k) === v));
    });
  }

  // ── live safety check against the real database rules ──
  $('runCheck').onclick = async () => {
    const list = $('checks'); list.innerHTML = '';
    const line = (ok, text) => list.append(el('li', { className: ok ? 'ok' : 'bad', textContent: (ok ? '✓ ' : '✗ ') + text }));
    const expectFail = async (p) => { try { await p; return false; } catch (e) { return /permission|denied/i.test(e.code || e.message); } };
    const expectOk = async (p) => { try { await p; return true; } catch { return false; } };
    const target = `rooms/${room}`;
    // a second connection that is NOT signed in, like a headset or a stranger
    const anonApp = fb.initializeApp(FIREBASE_CONFIG, 'safety-check-' + Date.now());
    const anon = fb.getDatabase(anonApp);
    if (FIREBASE_CONFIG.emulator) fb.connectDatabaseEmulator(anon, ...FIREBASE_CONFIG.emulator);
    line(await expectFail(fb.update(fb.ref(anon, target), { lang: 'en', updatedAt: fb.serverTimestamp() })), 'Someone not signed in cannot send commands');
    line(await expectFail(fb.get(fb.ref(anon, '/'))), 'Nobody can list or read the whole database');
    line(await expectFail(fb.get(fb.ref(anon, 'rooms'))), 'Nobody can list the other rooms');
    line(await expectOk(fb.get(fb.ref(anon, target))), 'Headsets can read this room’s settings');
    line(await expectFail(fb.update(fb.ref(anon, target), { 'paused/h0': fb.serverTimestamp(), updatedAt: fb.serverTimestamp() })), 'Someone not signed in cannot pause or unpause headsets');
    fb.goOffline(anon);
    // signed in as you: junk must still be rejected
    const me = fb.ref(db, target);
    line(await expectFail(fb.update(me, { note: 'hello', updatedAt: fb.serverTimestamp() })), 'Free text is rejected (even from you)');
    line(await expectFail(fb.update(me, { lang: 'fr', updatedAt: fb.serverTimestamp() })), 'Unknown values are rejected');
    line(await expectFail(fb.update(me, { freeze: 'Click this link', freezeAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp() })), 'Custom freeze messages are rejected');
    line(await expectFail(fb.update(me, { dot: 99, dotAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp() })), 'Out-of-range dots are rejected');
    line(await expectFail(fb.update(me, { tourDot: 0, tourAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp() })), 'Out-of-range tour steps are rejected');
    line(await expectFail(fb.update(me, { 'paused/student-name': fb.serverTimestamp(), updatedAt: fb.serverTimestamp() })), 'Only headset numbers can be paused (no names)');
    line(await expectFail(fb.update(me, { 'paused/h1': 'hello', updatedAt: fb.serverTimestamp() })), 'Pauses can’t carry text');
    line(await expectOk(fb.update(me, { updatedAt: fb.serverTimestamp() })), 'Your account can send normal commands');
  };

  window.__teacher = { send, setRoom, setTab, get current() { return current; } };
}
