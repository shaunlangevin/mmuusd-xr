// Teacher console. Signed-in teachers write a tiny settings record for one room;
// headsets opened with ?room=<code> read it. Nothing is ever read from the headsets.
import { FIREBASE_CONFIG, TEACHERS } from './firebase-config.js';

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
    const saved = (() => { try { return localStorage.getItem('xr-room') || ''; } catch { return ''; } })();
    setRoom(saved || 'room1');
  });

  // ── room ──
  function setRoom(r) {
    r = (r || '').trim().toLowerCase();
    if (!ROOM_RE.test(r)) { status('Room codes use lowercase letters, numbers and dashes (up to 24).', true); return; }
    room = r; $('room').value = r;
    try { localStorage.setItem('xr-room', r); } catch { /* fine */ }
    const base = new URL('./', location.href).href;
    $('link').value = `${base}?room=${r}`;
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
      const b = document.createElement('button'); b.className = 'dot';
      b.innerHTML = `<b>${i + 1}</b>`; b.append(document.createTextNode(d.title.en));
      b.onclick = () => send({ dot: i + 1, dotAt: fb.serverTimestamp() }, `Go to dot ${i + 1}`);
      box.append(b);
    });
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
    fb.goOffline(anon);
    // signed in as you: junk must still be rejected
    const me = fb.ref(db, target);
    line(await expectFail(fb.update(me, { note: 'hello', updatedAt: fb.serverTimestamp() })), 'Free text is rejected (even from you)');
    line(await expectFail(fb.update(me, { lang: 'fr', updatedAt: fb.serverTimestamp() })), 'Unknown values are rejected');
    line(await expectFail(fb.update(me, { freeze: 'Click this link', freezeAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp() })), 'Custom freeze messages are rejected');
    line(await expectFail(fb.update(me, { dot: 99, dotAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp() })), 'Out-of-range dots are rejected');
    line(await expectOk(fb.update(me, { updatedAt: fb.serverTimestamp() })), 'Your account can send normal commands');
  };

  window.__teacher = { send, setRoom, get current() { return current; } };
}
