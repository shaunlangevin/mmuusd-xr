// Headset side of the teacher console. READ-ONLY: no sign-in, no IDs, never writes anything.
// Listens to rooms/<room> and hands sanitized settings to the lab.
import { FIREBASE_CONFIG } from './firebase-config.js';

export const ROOM_RE = /^[a-z0-9-]{1,24}$/;
export const FREEZE_KINDS = ['eyes', 'wait', 'remove', 'done'];
export const VARIABLES = ['ball', 'cannon', 'powder', 'wheels'];
export const SIZE_NAMES = ['desk', 'half', 'life'];
export const SIZES_RE = /^(desk|half|life)(,(desk|half|life)){0,2}$/;
export const ACCESS_RE = /^[bcnfs]{1,5}$/;   // b = bigger text, c = calm, n = show numbers, f = Fire button, s = Spanish
const FREEZE_MAX_MS = 2 * 60 * 60 * 1000;    // a freeze or pause older than 2 hours is ignored
const RESTART_MAX_MS = 10 * 60 * 1000;       // "Start over" only counts for 10 minutes

export function configured() { return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL); }

// One connection per page. The room can change (picking a headset number), so listen() can be called again; stop() the old one first.
let conn = null;
function connect(onStatus) {
  if (!conn) conn = (async () => {
    const fb = await import('../vendor/firebase/fb-db.js');
    const app = fb.initializeApp(FIREBASE_CONFIG, 'headset');
    const db = fb.getDatabase(app);
    if (FIREBASE_CONFIG.emulator) fb.connectDatabaseEmulator(db, ...FIREBASE_CONFIG.emulator);
    const c = { fb, db, offset: 0 };
    fb.onValue(fb.ref(db, '.info/serverTimeOffset'), (s) => { c.offset = s.val() || 0; });
    fb.onValue(fb.ref(db, '.info/connected'), (s) => onStatus(s.val() ? 'connected' : 'connecting'));
    return c;
  })();
  return conn;
}

// onState(clean): clean only holds values that passed the checks below
export async function listen(room, onState, onStatus = () => {}) {
  if (!ROOM_RE.test(room) || !configured()) { onStatus('off'); return null; }
  const c = await connect(onStatus);
  const now = () => Date.now() + c.offset;
  let last = {}, live = true;
  const unsub = c.fb.onValue(c.fb.ref(c.db, `rooms/${room}`),
    (snap) => { last = snap.val() || {}; if (live) onState(clean(last, now())); },
    () => onStatus('error'));
  const timer = setInterval(() => { if (live) onState(clean(last, now())); }, 60000);   // an old freeze expires even if nothing new arrives
  return { stop: () => { live = false; clearInterval(timer); if (typeof unsub === 'function') unsub(); } };
}

// Only known keys with allowed values get through (a second check on top of the database rules).
export function clean(r, now) {
  r = r && typeof r === 'object' ? r : {};
  const out = {};
  const fresh = (at, max) => typeof at === 'number' && now - at < max;
  const bool = (k) => { if (typeof r[k] === 'boolean') out[k] = r[k]; };
  if (r.path === 'guided' || r.path === 'full') out.path = r.path;
  if (r.start === 'try' || r.start === 'plan') out.start = r.start;
  if (VARIABLES.includes(r.variable)) out.variable = r.variable;
  if (typeof r.sizes === 'string' && SIZES_RE.test(r.sizes)) out.sizes = SIZE_NAMES.filter((s) => r.sizes.split(',').includes(s));
  if (r.lang === 'en' || r.lang === 'es') out.lang = r.lang;
  bool('bigText'); bool('calm'); bool('num'); bool('fireButton');   // supports for every headset in the room
  // supports for one headset: { h3: 'bc' } → { 3: 'bc' }  (sticker numbers, not students)
  out.access = {};
  if (r.access && typeof r.access === 'object') {
    for (const [k, v] of Object.entries(r.access)) { const m = /^h(1?[0-9])$/.exec(k); if (m && typeof v === 'string' && ACCESS_RE.test(v)) out.access[+m[1]] = v; }
  }
  // per-headset pause: { h0: time, h11: time } → [0, 11]
  out.paused = [];
  if (r.paused && typeof r.paused === 'object') {
    for (const [k, v] of Object.entries(r.paused)) { const m = /^h(1?[0-9])$/.exec(k); if (m && fresh(v, FREEZE_MAX_MS)) out.paused.push(+m[1]); }
  }
  out.freeze = FREEZE_KINDS.includes(r.freeze) && fresh(r.freezeAt, FREEZE_MAX_MS) ? r.freeze : null;
  out.restartAt = fresh(r.restartAt, RESTART_MAX_MS) ? r.restartAt : 0;
  return out;
}
