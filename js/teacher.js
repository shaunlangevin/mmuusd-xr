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
  { group: 'Supports for every headset (for one student, use Teach → Supports for one headset)' },
  { key: 'bigText', label: 'Bigger text', desc: 'Reading panels and menus about 30% larger', opts: ONOFF, def: false },
  { key: 'readAloud', label: 'Read to me', desc: 'Adds a Read to me button that reads panels aloud with the headset’s built-in voice (for text that has no recording)', opts: ONOFF, def: false },
  { key: 'calm', label: 'Calm mode', desc: 'No pulsing, bouncing or quick movements; slower turns', opts: ONOFF, def: false },
  { key: 'autoPlay', label: 'Auto-play', desc: 'Recordings start by themselves: the prompt when a dot opens, the reading when it appears, Tell me more when it opens', opts: ONOFF, def: false },
];
// per-headset supports: stored as letters, e.g. access/h3 = "br" (b = bigger text, r = read to me, c = calm, a = auto-play)
const SUPPORTS = [['b', 'A+', 'Bigger text'], ['r', '🔊', 'Read to me'], ['c', 'Calm', 'Calm mode'], ['a', 'Auto', 'Auto-play']];
const SUPPORT_KEYS = { b: 'bigText', r: 'readAloud', c: 'calm', a: 'autoPlay' };
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
      b.onclick = () => { if (x !== k) send({ kit: x.id, exhibit: null, tour: false, tourAt: fb.serverTimestamp(), selfTourAt: null, stops: null }, `Kit: ${x.title.en}`); };
      kitSeg.append(b);
    }
    const artSeg = $('artSeg'); artSeg.innerHTML = '';
    for (const id of (k ? k.exhibits.filter(known) : (index.exhibits || []).map((e) => e.id))) {
      const b = el('button', { textContent: exTitle(id) }); b.classList.toggle('sel', id === ex);
      b.onclick = () => { if (id !== ex) send({ exhibit: id, tour: false, tourAt: fb.serverTimestamp(), selfTourAt: null, stops: null }, `Artifact: ${exTitle(id)}`); };
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
      const core = isCore(i + 1);
      const b = el('button', { textContent: String(i + 1), title: `${i + 1}. ${d.title.en}${core ? ' (★ curriculum link)' : ''}` });
      b.dataset.dot = i + 1; b.setAttribute('aria-label', `Dot ${i + 1}: ${d.title.en}${core ? ', curriculum link' : ''}`);
      b.classList.toggle('core', core);
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
  // ── tour stops: Highlights (dot 1 + the ★ dots), All dots, or Custom. Used by both kinds of tour.
  // The chosen stops are stored as "1,2,5" (dot numbers only). Dot 1 is always a stop: it says what the object is.
  function linkById(id) { return (exhibit?.links || []).find((l) => l.id === id); }
  function isCore(n) { return !!exhibit?.dots[n - 1]?.core?.some(linkById); }
  const allSteps = () => (exhibit ? exhibit.dots.map((_, i) => i + 1) : []);
  const highlightSteps = () => allSteps().filter((n) => n === 1 || isCore(n));
  const hasHighlights = () => highlightSteps().length > 1;
  const recordSteps = () => { const v = typeof current.stops === 'string' && /^\d{1,2}(,\d{1,2}){0,19}$/.test(current.stops) ? current.stops.split(',').map(Number).filter((n) => n >= 1 && n <= nDots()) : [];
    return v.length ? [...new Set(v)].sort((a, b) => a - b) : null; };
  const SELF_MAX = 3 * 3600e3;
  const selfOn = () => typeof current.selfTourAt === 'number' && Date.now() - current.selfTourAt < SELF_MAX;
  const busy = () => tourOn() || selfOn();
  let pick = null, pickFor = null, custom = new Set([1]);   // the teacher's choice before a tour starts (sent with Start)
  const same = (a, b) => a.join() === b.join();
  const modeOf = (list) => (hasHighlights() && same(list, highlightSteps()) ? 'highlights' : same(list, allSteps()) ? 'all' : 'custom');
  function chosen() {   // the stops in use: the room's, once a tour is running; otherwise the teacher's pick
    const rec = recordSteps();
    if (pickFor !== exhibit?.id) { pickFor = exhibit?.id; pick = null; }
    if (!pick) { pick = rec ? modeOf(rec) : hasHighlights() ? 'highlights' : 'all'; if (rec && pick === 'custom') custom = new Set(rec); else custom = new Set(highlightSteps()); }
    return pick === 'highlights' && hasHighlights() ? highlightSteps() : pick === 'custom' ? [...custom].sort((a, b) => a - b) : allSteps();
  }
  const steps = () => (busy() && recordSteps() ? recordSteps() : chosen());
  const stopsVal = (list) => list.join(',');
  function choose(mode) {
    pick = mode;
    if (busy()) send({ stops: stopsVal(chosen()) }, `Tour stops: ${chosen().join(' → ')}`); else render();
  }
  function toggleCustom(n) {
    if (n === 1) return;   // dot 1 always opens the tour
    custom.has(n) ? custom.delete(n) : custom.add(n);
    choose('custom');
  }
  document.querySelectorAll('[data-stops]').forEach((b) => { b.onclick = () => choose(b.dataset.stops); });
  const nextStep = (s) => steps().find((n) => n > s);
  const prevStep = (s) => steps().filter((n) => n < s).pop();
  $('tourStart').onclick = () => { const list = chosen();
    send({ tour: true, tourDot: list[0], tourAt: fb.serverTimestamp(), selfTourAt: null, stops: stopsVal(list) }, `Teacher-led tour: ${list.join(' → ')}`); };
  $('selfStart').onclick = () => { const list = chosen();
    send({ selfTourAt: fb.serverTimestamp(), tour: false, tourAt: fb.serverTimestamp(), stops: stopsVal(list) }, `Self-guided tour started: ${list.join(' → ')}`); };
  $('selfRestart').onclick = () => send({ selfTourAt: fb.serverTimestamp() }, 'Self-guided tour restarted for every headset');
  $('selfEnd').onclick = () => send({ selfTourAt: null }, 'Self-guided tour ended; students explore freely');
  $('tourPrev').onclick = () => { const p = prevStep(current.tourDot || 1); if (p) goStep(p); };
  $('tourNext').onclick = () => { const x = nextStep(current.tourDot || 0); if (x) goStep(x); };
  $('tourEnd').onclick = () => send({ tour: false, tourAt: fb.serverTimestamp() }, 'Tour ended; students explore freely');
  const revealedNow = () => tourOn() && current.reveal === current.tourDot && (current.revealAt || 0) >= (current.tourAt || 0);
  $('tourReveal').onclick = () => { if (tourOn()) send({ reveal: current.tourDot, revealAt: fb.serverTimestamp() }, `Reading shown for dot ${current.tourDot}`); };
  // the dot the script shows: the tour step, or the dot last sent to everyone (for 10 minutes)
  const shownDot = () => (tourOn() ? current.tourDot : Number.isInteger(current.dot) && Date.now() - (current.dotAt || 0) < 10 * 60e3 ? current.dot : null);
  const playPart = (kind, label) => {
    const n = shownDot();
    if (n) send({ narrate: n, narrateKind: kind, narrateAt: fb.serverTimestamp() }, `${label} playing for dot ${n}`);
  };
  $('narrate').onclick = () => playPart('main', 'Narration');
  $('playNotice').onclick = () => playPart('notice', 'Prompt');
  $('playMore').onclick = () => playPart('more', 'Tell me more');

  // ── the script: what students see and hear for the shown dot ──
  let scriptLang = 'en';
  document.querySelectorAll('[data-sl]').forEach((b) => { b.onclick = () => { scriptLang = b.dataset.sl; render(); }; });
  const clipCache = {};   // does a recording exist? (asked once per file)
  function clipExists(n, kind, lang) {
    const name = String(n).padStart(2, '0') + (kind === 'main' ? '' : '-' + kind);
    const url = `exhibits/${exhibit.id}/audio/${lang}/${name}.mp3`;
    if (!(url in clipCache)) { clipCache[url] = null; fetch(url, { method: 'HEAD', cache: 'no-cache' }).then((r) => { clipCache[url] = r.ok; render(); }).catch(() => { clipCache[url] = false; render(); }); }
    return clipCache[url];
  }
  const T = (o) => (o == null ? '' : typeof o === 'string' ? o : o[scriptLang] ?? o.en ?? '');
  const STEMS = { en: 'I notice… · I think it might be… because…', es: 'Yo noto… · Creo que podría ser… porque…' };
  function renderScript(noticeOn) {
    const n = exhibit ? shownDot() : null, d = n && exhibit.dots[n - 1];
    $('script').hidden = !d; $('scriptEmpty').hidden = !!d;
    if (!d) return;
    const on = tourOn(), hl = eff('lang'), revealed = revealedNow();
    $('scriptTitle').textContent = `Dot ${n}: ${T(d.title)}${isCore(n) ? ' ★' : ''}`;
    const dl = (d.core || []).map(linkById).filter(Boolean);
    $('scriptLink').textContent = dl.length ? `★ Curriculum link: ${dl.map((l) => `${l.code}, ${T(l.text)}`).join('; ')}`
      : n === 1 && hasHighlights() ? 'Opener: says what the object is. Always the first stop of a tour.' : '';
    document.querySelectorAll('[data-sl]').forEach((b) => b.classList.toggle('sel', b.dataset.sl === scriptLang));
    $('scriptNote').textContent = hl !== scriptLang ? `Headsets are in ${hl === 'es' ? 'Spanish' : 'English'}, so students see and hear the ${hl === 'es' ? 'Spanish' : 'English'} version.` : '';
    // prompt
    const hasNotice = noticeOn && !!d.notice;
    $('partNotice').hidden = !hasNotice;
    $('txtNotice').textContent = T(d.notice); $('txtStems').textContent = STEMS[scriptLang] || STEMS.en;
    const promptNow = on && hasNotice && !revealed;
    $('tagNotice').textContent = promptNow ? 'Students see this now' : !on && hasNotice ? 'Each student sees this first' : '';
    $('tagMain').textContent = on && (!hasNotice || revealed) ? 'Students see this now' : !on && hasNotice ? 'After Show me' : '';
    // reading
    const main = $('txtMain'); main.innerHTML = '';
    main.append(el('p', { textContent: T(d.text) }));
    if (d.facts) { const dl = el('dl'); d.facts.forEach((f) => dl.append(el('dt', { textContent: T(f.k) }), el('dd', { textContent: T(f.v) }))); main.append(dl); }
    if (d.law) main.append(el('p', { className: 'plain' }, el('b', { textContent: scriptLang === 'es' ? 'En palabras sencillas: ' : 'In plain words: ' }), T(d.law.plain)));
    if (d.think) main.append(el('p', { className: 'think' }, el('b', { textContent: scriptLang === 'es' ? 'Piensa: ' : 'Think about it: ' }), T(d.think)));
    // Tell me more
    const hasMore = !!(d.more || d.law?.original);
    $('partMore').hidden = !hasMore;
    const more = $('txtMore'); more.innerHTML = '';
    if (d.more) more.append(el('p', { textContent: T(d.more) }));
    if (d.law?.original) more.append(el('p', { className: 'orig', textContent: `“${T(d.law.original)}” (${T(d.law.source)})` }));
    // play buttons, labelled with whether a recording exists in the headsets' language
    for (const [id, kind, show] of [['playNotice', 'notice', hasNotice], ['narrate', 'main', true], ['playMore', 'more', hasMore]]) {
      const ok = show ? clipExists(n, kind, hl) : false;
      $(id).disabled = ok === false;
      $(id).title = ok === false ? `No ${hl === 'es' ? 'Spanish' : 'English'} recording for this part yet` : '';
    }
  }

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
  // pause tiles (and support toggles) for the headsets that follow this room (all of them for a custom ?room= code)
  const headsetNums = () => { const g = groupFor(room), list = g ? [g] : GROUPS; const out = [];
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
    return Object.fromEntries(Object.entries(a).filter(([k, v]) => /^h1?[0-9]$/.test(k) && typeof v === 'string' && /^[brca]{1,4}$/.test(v))); };
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
    } else if (selfOn()) pill(`● Self-guided tour: ${steps().join(' → ')}`, 'live');
    else pill('Tour off: exploring freely');
    if (pausedList.length) pill(`Paused: headset${pausedList.length > 1 ? 's' : ''} ${pausedList.join(', ')}`, 'warn');
    const roomSup = SUPPORTS.filter(([l]) => eff(SUPPORT_KEYS[l]) === true).map(([, , name]) => name);
    if (roomSup.length) pill(`Supports for everyone: ${roomSup.join(', ')}`);
    const hsSup = Object.entries(accessMap()).map(([h, v]) => `${h.slice(1)} (${SUPPORTS.filter(([l]) => v.includes(l)).map(([, short]) => short).join(' ')})`);
    if (hsSup.length) pill(`Supports: headset ${hsSup.join(', ')}`);

    // everyone
    document.querySelectorAll('[data-freeze]').forEach((b) => b.classList.toggle('sel', frozen === b.dataset.freeze));
    $('unfreeze').disabled = !frozen;
    $('everyone').classList.toggle('frozen', !!frozen);

    // tour
    const self = selfOn() && !on;
    $('tourOff').hidden = on || self; $('tourOn').hidden = !on; $('tourEnd').hidden = !on; $('selfOn').hidden = !self;
    if (busy() && recordSteps() && exhibit) { const m = modeOf(recordSteps()); pick = m; if (m === 'custom') custom = new Set(recordSteps()); }
    const list = steps(), next = on ? nextStep(step) : undefined, hl = hasHighlights() && same(list, highlightSteps());
    $('tourPrev').disabled = !on || !prevStep(step); $('tourNext').disabled = !on || !next;
    const at = list.indexOf(step);
    $('tourCount').textContent = !on ? '' : (at >= 0 ? `STEP ${at + 1} OF ${list.length}` : 'EXTRA STOP') + (hl ? ' · HIGHLIGHTS' : list.length < n ? ' · CUSTOM' : '');
    $('tourTitle').textContent = on ? dotTitle(step) : '';
    // stops picker
    const mode = exhibit ? (busy() && recordSteps() ? modeOf(recordSteps()) : (chosen(), pick)) : 'all';
    $('stopsHl').hidden = !hasHighlights();
    $('stopsHl').textContent = `★ Highlights (${highlightSteps().join(' → ')})`;
    $('stopsAll').textContent = `All ${n} dots`;
    document.querySelectorAll('[data-stops]').forEach((b) => { b.classList.toggle('sel', b.dataset.stops === mode); b.setAttribute('aria-pressed', String(b.dataset.stops === mode)); });
    const cp = $('customPick'); cp.hidden = mode !== 'custom';
    if (!cp.hidden) {
      cp.innerHTML = '';
      cp.append(el('span', { className: 'note', textContent: 'Tap to add or remove stops (dot 1 always starts the tour): ' }));
      for (const k of allSteps()) {
        const b = el('button', { textContent: String(k), title: dotTitle(k), onclick: () => toggleCustom(k) });
        b.dataset.pick = k; b.classList.toggle('sel', list.includes(k)); b.classList.toggle('core', isCore(k)); b.disabled = k === 1;
        b.setAttribute('aria-pressed', String(list.includes(k))); b.setAttribute('aria-label', `Stop ${k}: ${dotTitle(k)}`);
        cp.append(b);
      }
    }
    $('stopsNow').textContent = `Stops: ${list.join(' → ')}`;
    $('selfNote').textContent = `Each student goes at their own pace: ${list.join(' → ')}. On each stop they look at the dot, it opens and plays, and they press Next stop. The other dots appear when they finish.`;
    const links = exhibit?.links || [];
    $('coreInfo').hidden = !links.length;
    $('coreInfo').textContent = links.length ? `★ Curriculum links: ${links.map((l) => `${l.code} (${l.text.en})`).join('; ')}.` : '';
    $('dotsTitle').textContent = on ? 'Jump to a step:' : self ? 'Dots (students move on their own during a self-guided tour):' : 'Send everyone to a dot:';
    document.querySelectorAll('#dots button').forEach((b) => { b.disabled = self; });
    document.querySelectorAll('#dots button').forEach((b) => { const d = +b.dataset.dot; b.classList.toggle('cur', on && d === step); b.classList.toggle('done', on && d < step); });
    $('tourReveal').hidden = !on || !noticeOn || !exhibit?.dots[step - 1]?.notice;
    $('tourReveal').disabled = revealedNow();
    $('tourReveal').textContent = revealedNow() ? 'Reading shown ✓' : 'Reveal reading';
    renderScript(noticeOn);
    if (self) $('scriptEmpty').hidden = true;
    $('tourNote').textContent = self ? '' : !on ? 'Tap a number to open that dot on every headset.'
      : noticeOn && !revealedNow() ? `Students are looking at dot ${step} and talking. Reveal the reading when they’re ready.`
        : next ? 'The reading is showing. Press ▶ for the next stop.' : list.length < n ? 'Last stop. End the tour, or tap another number for an extra stop.' : 'Last dot. End the tour when you’re ready.';

    // per-headset supports
    document.querySelectorAll('#supports [data-sup]').forEach((b) => {
      const on = (accessMap()['h' + b.dataset.hs] || '').includes(b.dataset.sup);
      b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on));
    });
    $('clearSupports').disabled = !Object.keys(accessMap()).length;

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
    line(await expectFail(fb.update(me, { 'access/h1': 'hello', updatedAt: fb.serverTimestamp() })), 'Supports only accept the four support letters (no text)');
    line(await expectFail(fb.update(me, { narrate: 1, narrateKind: 'everything', narrateAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp() })), 'Only the three recording types can be played');
    line(await expectFail(fb.update(me, { 'access/student-name': 'b', updatedAt: fb.serverTimestamp() })), 'Supports are only for headset numbers (no names)');
    line(await expectFail(fb.update(me, { stops: '1,2,hello', updatedAt: fb.serverTimestamp() })), 'Tour stops only accept dot numbers (no text)');
    line(await expectOk(fb.update(me, { updatedAt: fb.serverTimestamp() })), 'Your account can send normal commands');
  };

  window.__teacher = { send, setRoom, setTab, get current() { return current; } };
}
