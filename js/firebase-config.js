// ─────────────────────────────────────────────────────────────
//  Teacher console connection (optional). This is the LABS project (mmuusd-labs), separate from the exhibits.
//  Paste the values from Firebase: Project settings → Your apps → Web app → "SDK setup and configuration" → Config.
//  These values are meant to be public. What protects the database is firebase/database.rules.json.
//  Leave apiKey empty to turn the teacher console off; the headsets then work on their own.
// ─────────────────────────────────────────────────────────────
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDGza6M5URzbIhFxy_1ZpTkUd1hhDl7vG0',
  authDomain: 'mmuusd-labs.firebaseapp.com',
  databaseURL: 'https://mmuusd-labs-default-rtdb.firebaseio.com',
  projectId: 'mmuusd-labs',
  appId: '1:503099875585:web:92f2bfc4607857fb30bb00',
};

// Teacher accounts allowed to send settings (must match the database rules).
export const TEACHERS = ['shaun.langevin@mmuusd.org', 'mike.weber@mmuusd.org'];

// Headset groups, the same as the exhibits. A headset's number (the sticker on it) decides which teacher page it follows,
// so every headset can use the same ArborXR link. Each teacher's page opens to their own group.
// Room names: lowercase letters, numbers and dashes.
export const GROUPS = [
  { name: 'South End', room: 'south', first: 0, last: 5, teacher: 'shaun.langevin@mmuusd.org' },
  { name: 'North End', room: 'north', first: 6, last: 11, teacher: 'mike.weber@mmuusd.org' },
];

// Headsets that haven't picked a number yet listen here. A link ending in ?room=<code> overrides
// everything above (that headset follows teacher.html?room=<code>), and ?room=off turns it off.
export const DEFAULT_ROOM = 'mmuusd';
