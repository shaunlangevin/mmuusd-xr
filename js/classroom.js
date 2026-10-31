// Headset side of the teacher console. READ-ONLY: no sign-in, no IDs, never writes.
// Listens to rooms/<room> and hands sanitized settings to the app.
import { FIREBASE_CONFIG } from './firebase-config.js';

export const ROOM_RE = /^[a-z0-9-]{1,24}$/;
export const FREEZE_KINDS = ['eyes', 'wait', 'remove', 'done'];
const FREEZE_MAX_MS = 2 * 60 * 60 * 1000;   // a freeze older than 2 hours is ignored
const DOT_MAX_MS = 10 * 60 * 1000;          // a "go to dot" older than 10 minutes is ignored
const TOUR_MAX_MS = 3 * 60 * 60 * 1000;     // a tour step older than 3 hours means the tour was left on by mistake
const NARRATE_MAX_MS = 20 * 1000;           // "play narration" only counts for 20 seconds (late joiners don't hear old clips)
const PAUSE_MAX_MS = FREEZE_MAX_MS;

export function configured() { return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL); }

// One connection per page. The room can change (a headset's number decides its room),
// so listen() can be called again; stop() the old listener first.
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

// onState(clean) — clean only contains values that passed the checks below
export async function listen(room, onState, onStatus = () => {}) {
  if (!ROOM_RE.test(room) || !configured()) { onStatus('off'); return null; }
  const c = await connect(onStatus);
  const now = () => Date.now() + c.offset;
  let last = {}, live = true;
  const unsub = c.fb.onValue(c.fb.ref(c.db, `rooms/${room}`),
    (snap) => { last = snap.val() || {}; if (live) onState(clean(last, now())); },
    () => onStatus('error'));
  // re-check once a minute so an old freeze expires even if nothing new arrives
  const timer = setInterval(() => { if (live) onState(clean(last, now())); }, 60000);
  return { stop: () => { live = false; clearInterval(timer); if (typeof unsub === 'function') unsub(); } };
}

// Only known keys with allowed values get through (a second check on top of the database rules).
export function clean(r, now) {
  const out = {};
  const bool = (k) => { if (typeof r[k] === 'boolean') out[k] = r[k]; };
  if (typeof r.exhibit === 'string' && /^[a-z0-9-]{1,32}$/.test(r.exhibit)) out.exhibit = r.exhibit;
  if (typeof r.kit === 'string' && /^[a-z0-9-]{1,32}$/.test(r.kit)) out.kit = r.kit;
  if (r.lang === 'en' || r.lang === 'es') out.lang = r.lang;
  bool('progress'); bool('detective'); bool('lock');
  if (r.mode === 'walk' || r.mode === 'seated') out.mode = r.mode;
  if (r.size === 'life' || r.size === 'table') out.size = r.size;
  if (Number.isInteger(r.dot) && r.dot >= 1 && r.dot <= 20 && typeof r.dotAt === 'number' && now - r.dotAt < DOT_MAX_MS) {
    out.dot = r.dot; out.dotAt = r.dotAt;
  }
  const fresh = (at, max) => typeof at === 'number' && now - at < max;
  const dotNum = (v) => Number.isInteger(v) && v >= 1 && v <= 20;
  bool('moveWindows'); bool('notice'); bool('practice'); bool('moveStone');
  if (dotNum(r.reveal) && fresh(r.revealAt, TOUR_MAX_MS)) { out.reveal = r.reveal; out.revealAt = r.revealAt; }
  if (r.tour === true && dotNum(r.tourDot) && fresh(r.tourAt, TOUR_MAX_MS)) { out.tour = true; out.tourDot = r.tourDot; out.tourAt = r.tourAt; }
  if (dotNum(r.narrate) && fresh(r.narrateAt, NARRATE_MAX_MS)) { out.narrate = r.narrate; out.narrateAt = r.narrateAt; }
  // per-headset pause: { h0: time, h11: time } → [0, 11]  (numbers on the headsets' stickers, not students)
  out.paused = [];
  if (r.paused && typeof r.paused === 'object') {
    for (const [k, v] of Object.entries(r.paused)) { const m = /^h(1?[0-9])$/.exec(k); if (m && fresh(v, PAUSE_MAX_MS)) out.paused.push(+m[1]); }
  }
  out.freeze = (FREEZE_KINDS.includes(r.freeze) && typeof r.freezeAt === 'number' && now - r.freezeAt < FREEZE_MAX_MS) ? r.freeze : null;
  return out;
}
