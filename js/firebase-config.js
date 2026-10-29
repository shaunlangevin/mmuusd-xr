// ─────────────────────────────────────────────────────────────
//  Teacher console connection (optional).
//  Paste the values from Firebase: Project settings → Your apps → Web app → "SDK setup and configuration" → Config.
//  These values are meant to be public. What protects the database is firebase/database.rules.json.
//  Leave apiKey empty to turn the teacher console off; the headsets then work on their own.
// ─────────────────────────────────────────────────────────────
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAmsfxJaV-NDTP2gDlBH5_78388Bb1n2VM',
  authDomain: 'mmuusd-xr.firebaseapp.com',
  databaseURL: 'https://mmuusd-xr-default-rtdb.firebaseio.com',
  projectId: 'mmuusd-xr',
  appId: '1:461675214341:web:fd6c45e51e441bf953ce6c',
};

// Teacher accounts allowed to send commands (must match the database rules).
export const TEACHERS = ['shaun.langevin@mmuusd.org', 'mike.weber@mmuusd.org'];

// The room every headset joins when its link has no ?room= (and that teacher.html opens by default).
// A link ending in ?room=off turns the teacher console off for that link.
export const DEFAULT_ROOM = 'mmuusd';

// How many headsets you have. They're numbered from 0 (so 6 headsets = 0–5).
export const HEADSETS = 6;
