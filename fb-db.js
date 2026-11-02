// Test double for the Firebase database bundle
const subs = {}; const vals = {};
window.__fbmock = { set(path, v) { vals[path] = v; (subs[path] || []).forEach((cb) => cb({ val: () => v })); }, subs, writes: [] };
export const initializeApp = (cfg, name) => ({ cfg, name });
export const getDatabase = (app) => ({ app });
export const ref = (db, path) => path || '';
export const onValue = (path, cb) => { (subs[path] = subs[path] || []).push(cb);
  if (path === '.info/connected') cb({ val: () => true }); else if (path === '.info/serverTimeOffset') cb({ val: () => 0 }); else cb({ val: () => vals[path] ?? null }); return () => {}; };
export const update = async (path, v) => { window.__fbmock.writes.push(['update', path, v]); const cur = JSON.parse(JSON.stringify(vals[path] || {})); for (const [key, x] of Object.entries(v)) { const ks = key.split("/"); let o = cur; for (const k of ks.slice(0, -1)) o = (o[k] = o[k] || {}); const k = ks[ks.length - 1]; if (x === null) delete o[k]; else o[k] = (x && x[".sv"]) ? Date.now() : x; } window.__fbmock.set(path, cur); };
export const get = async (path) => ({ val: () => vals[path] ?? null });
export const set = async (path, v) => { window.__fbmock.writes.push(['set', path, v]); };
export const serverTimestamp = () => ({ '.sv': 'timestamp' });
export const connectDatabaseEmulator = () => {}; export const goOffline = () => {}; export const goOnline = () => {};
