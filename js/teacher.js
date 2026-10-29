// Teacher console. Signed-in teachers write a tiny settings record for one room;
// headsets opened with ?room=<code> read it. Nothing is ever read from the headsets.
import * as CFG from './firebase-config.js';
const { FIREBASE_CONFIG, TEACHERS } = CFG;
const DEFAULT_ROOM = CFG.DEFAULT_ROOM || 'mmuusd';
const HEADSETS = Math.min(10, Math.max(1, CFG.HEADSETS || 6));

const $ = (id) => document.getElementById(id);
const ROOM_RE = /^[a-z0-9-]{1,24}$/;
const show = (id) => ['signedOut', 'notConfigured', 'app'].forEach((x) => ($(x).hidden = x !== id));

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

  // exhibits (for the dot buttons)
  const index = await (await fetch('exhibits/index.json')).json();
  let exhibit = null;
  async function loadExhibit(id) { exhibit = await (await fetch(`exhibits/${id}/exhibit.json`)).json(); exhibit.id = id; buildDots(); }

  let room = '', current = {}, unsub = null;

  fa.onAuthStateChanged(auth, async (user) => {
    if (!user) { $('account').textContent = ''; show('signedOut'); return; }
    const email = (user.email || '').toLowerCase();
    $('account').innerHTML = '';
    const who = document.createElement('span'); who.textContent = email + '  '; who.style.color = 'var(--dim)';
    const out = document.createElement('button'); out.textContent = 'Sign out'; out.onclick = () => fa.signOut(auth);
    $('account').append(who, out);
    if (!TEACHERS.includes(email) || !user.emailVerified) {
      show('signedOut');
      $('signedOut').querySelector('p').textContent = `${email} isn't on the teacher list for this console. Ask Shaun to add you (js/firebase-config.js and the database rules).`;
      return;
    }
    show('app');
    await loadExhibit(index.default);
    buildSettings();
    buildHeadsets();
    // the default room needs no setup; teacher.html?room=<code> opens another one
    setRoom(new URLSearchParams(location.search).get('room') || DEFAULT_ROOM);
  });

  // ── room ──
  function setRoom(r) {
    r = (r || '').trim().toLowerCase();
    if (!ROOM_RE.test(r)) { status('Room codes use lowercase letters, numbers and dashes (up to 24).', true); return; }
    room = r; $('room').value = r;
    const base = new URL('./', location.href).href;
    const isDefault = r === DEFAULT_ROOM;
    $('link').value = isDefault ? base : `${base}?room=${r}`;
    $('linkNote').textContent = isDefault
      ? 'This is the default room: headsets opened with the normal link (no ?room=) follow this page. Use another room code only if two classes use headsets at the same time.'
      : `Headsets only follow this room if their ArborXR link ends in ?room=${r}. To come back here later, bookmark teacher.html?room=${r}.`;
    if (unsub) unsub();
    unsub = fb.onValue(fb.ref(db, `rooms/${r}`), (s) => { current = s.val() || {}; render(); }, (e) => status('Could not read the room: ' + e.message, true));
    status(`Controlling room “${r}”.`);
  }
  $('useRoom').onclick = () => setRoom($('room').value);
  $('room').addEventListener('keydown', (e) => { if (e.key === 'Enter') setRoom($('room').value); });
  $('copy').onclick = async () => { try { await navigator.clipboard.writeText($('link').value); status('Link copied.'); } catch { $('link').select(); } };

  // ── sending ──
  async function send(patch, label) {
    if (!room) return;
    try {
      await fb.update(fb.ref(db, `rooms/${room}`), { ...patch, updatedAt: fb.serverTimestamp() });
      status(`Sent: ${label}`);
    } catch (e) { status(`Not sent (${e.code || e.message}).`, true); }
  }
  document.querySelectorAll('[data-freeze]').forEach((b) => {
    b.onclick = () => send({ freeze: b.dataset.freeze, freezeAt: fb.serverTimestamp() }, b.textContent);
  });
  $('unfreeze').onclick = () => send({ freeze: 'none', freezeAt: fb.serverTimestamp() }, 'Unfreeze');
  $('clear').onclick = async () => {
    if (!confirm('Reset all settings for this room? Headsets go back to what their links say.')) return;
    try { await fb.set(fb.ref(db, `rooms/${room}`), { updatedAt: fb.serverTimestamp() }); status('Room reset.'); }
    catch (e) { status(`Not reset (${e.code || e.message}).`, true); }
  };

  function buildDots() {
    const box = $('dots'); box.innerHTML = '';
    exhibit.dots.forEach((d, i) => {
      const b = document.createElement('button'); b.className = 'dot'; b.dataset.dot = i + 1;
      b.innerHTML = `<b>${i + 1}</b>`; b.append(document.createTextNode(d.title.en));
      // tour running: pick the tour step; otherwise open that dot on every headset
      b.onclick = () => (tourOn() ? goStep(i + 1) : send({ dot: i + 1, dotAt: fb.serverTimestamp() }, `Go to dot ${i + 1}`));
      box.append(b);
    });
  }

  // ── guided tour ──
  const TOUR_MAX = 3 * 3600e3;
  const tourOn = () => current.tour === true && Number.isInteger(current.tourDot) && Date.now() - (current.tourAt || 0) < TOUR_MAX;
  const nDots = () => (exhibit ? exhibit.dots.length : 0);
  function goStep(n) {
    n = Math.max(1, Math.min(nDots(), n));
    send({ tour: true, tourDot: n, tourAt: fb.serverTimestamp() }, `Tour step ${n}`);
  }
  $('tourStart').onclick = () => goStep(1);
  $('tourPrev').onclick = () => goStep((current.tourDot || 1) - 1);
  $('tourNext').onclick = () => goStep((current.tourDot || 0) + 1);
  $('tourEnd').onclick = () => send({ tour: false, tourAt: fb.serverTimestamp() }, 'End tour (students explore freely)');
  $('narrate').onclick = () => {
    const n = tourOn() ? current.tourDot : current.dot;
    if (n) send({ narrate: n, narrateAt: fb.serverTimestamp() }, `Play narration for dot ${n}`);
  };
  document.querySelectorAll('[data-move]').forEach((b) => {
    b.onclick = () => send({ moveWindows: b.dataset.move === 'true' }, `Students can move windows: ${b.textContent}`);
  });

  // ── pause one headset ──
  const PAUSE_MAX = 2 * 3600e3;
  const pausedNow = (i) => { const v = current.paused && current.paused['h' + i]; return typeof v === 'number' && Date.now() - v < PAUSE_MAX; };
  function buildHeadsets() {
    const box = $('headsets'); box.innerHTML = '';
    for (let i = 0; i < HEADSETS; i++) {
      const b = document.createElement('button'); b.className = 'hs'; b.dataset.hs = i;
      b.onclick = () => send({ ['paused/h' + i]: pausedNow(i) ? null : fb.serverTimestamp() }, `${pausedNow(i) ? 'Unpause' : 'Pause'} headset ${i}`);
      box.append(b);
    }
  }

  const SETTINGS = [
    ['exhibit', 'Exhibit', null],
    ['lang', 'Language', [['en', 'English'], ['es', 'Español']]],
    ['progress', 'Track progress', [[true, 'On'], [false, 'Off']]],
    ['detective', 'Detective mode', [[true, 'On'], [false, 'Off']]],
    ['mode', 'Students are', [['walk', 'Walking'], ['seated', 'Seated']]],
    ['size', 'Size', [['life', 'Life size'], ['table', 'Table size']]],
    ['lock', 'Classroom lock', [[true, 'On'], [false, 'Off']]],
  ];
  function buildSettings() {
    const box = $('settings'); box.innerHTML = '';
    for (const [key, label, opts] of SETTINGS) {
      const row = document.createElement('div'); row.className = 'row';
      const l = document.createElement('span'); l.textContent = label; row.append(l);
      const seg = document.createElement('div'); seg.className = 'seg';
      const choices = opts || (index.exhibits || []).map((e) => [e.id, e.title.en]);
      for (const [v, text] of choices) {
        const b = document.createElement('button'); b.textContent = text; b.dataset.key = key; b.dataset.val = JSON.stringify(v);
        b.onclick = () => send({ [key]: v }, `${label}: ${text}`);
        seg.append(b);
      }
      const none = document.createElement('button'); none.textContent = 'Link'; none.dataset.key = key; none.dataset.val = 'null';
      none.onclick = () => send({ [key]: null }, `${label}: follow link`);
      seg.append(none);
      row.append(seg); box.append(row);
    }
  }

  function render() {
    // tour
    const on = tourOn(), step = current.tourDot, n = nDots();
    $('tourStart').disabled = false; $('tourStart').textContent = on ? 'Restart tour' : 'Start tour';
    $('tourPrev').disabled = !on || step <= 1; $('tourNext').disabled = !on || step >= n; $('tourEnd').disabled = !on;
    const ts = $('tourStep'); ts.textContent = '';
    if (on && exhibit) { const b = document.createElement('b'); b.textContent = `Step ${step} of ${n}: `; ts.append(b, exhibit.dots[step - 1].title.en); }
    else ts.textContent = 'The tour is off. Students explore on their own.';
    const narr = on ? step : current.dot;
    $('narrate').disabled = !narr; $('narrate').textContent = narr ? `▶ Play narration for dot ${narr} on all headsets` : '▶ Play narration on all headsets';
    $('dotsTitle').textContent = on ? 'Jump to a tour step' : 'Send everyone to a dot';
    $('dotsNote').textContent = on ? 'The tour is running, so these pick the tour step.' : 'Opens that dot’s panel on every headset (works in Detective mode too).';
    document.querySelectorAll('#dots .dot').forEach((b) => b.classList.toggle('cur', on && +b.dataset.dot === step));
    document.querySelectorAll('[data-move]').forEach((b) => b.classList.toggle('sel', String(current.moveWindows !== false) === b.dataset.move));
    document.querySelectorAll('#headsets .hs').forEach((b) => { const p = pausedNow(+b.dataset.hs); b.classList.toggle('sel', p); b.textContent = `Headset ${b.dataset.hs}${p ? ' · paused' : ''}`; });
    document.querySelectorAll('#settings button').forEach((b) => {
      const v = current[b.dataset.key];
      b.classList.toggle('sel', JSON.stringify(v === undefined ? null : v) === b.dataset.val);
    });
    const fresh = current.freeze && current.freeze !== 'none' && Date.now() - (current.freezeAt || 0) < 2 * 3600e3;
    document.querySelectorAll('[data-freeze]').forEach((b) => b.classList.toggle('sel', fresh && current.freeze === b.dataset.freeze));
    const banner = $('banner');
    banner.style.display = fresh ? 'block' : 'none';
    if (fresh) banner.textContent = `Headsets in room “${room}” are frozen: ${document.querySelector(`[data-freeze="${current.freeze}"]`).textContent}. Press Unfreeze to continue.`;
  }

  function status(msg, err = false) { const s = $('status'); s.textContent = msg; s.className = err ? 'err' : ''; }

  // ── live safety check against the real database rules ──
  $('runCheck').onclick = async () => {
    const list = $('checks'); list.innerHTML = '';
    const line = (ok, text) => { const li = document.createElement('li'); li.className = ok ? 'ok' : 'bad'; li.textContent = (ok ? '✓ ' : '✗ ') + text; list.append(li); };
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

  window.__teacher = { send, setRoom, get current() { return current; } };
}
