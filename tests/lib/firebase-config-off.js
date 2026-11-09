// The console switched off (an empty apiKey), so tests never reach the real Firebase project.
export const FIREBASE_CONFIG = { apiKey: '', authDomain: '', databaseURL: '', projectId: '', appId: '' };
export const TEACHERS = ['shaun.langevin@mmuusd.org', 'mike.weber@mmuusd.org'];
export const GROUPS = [
  { name: 'South End', room: 'south', first: 0, last: 5, teacher: 'shaun.langevin@mmuusd.org' },
  { name: 'North End', room: 'north', first: 6, last: 11, teacher: 'mike.weber@mmuusd.org' },
];
export const DEFAULT_ROOM = 'mmuusd';
