let cbs = []; let user = null;
export class GoogleAuthProvider { setCustomParameters(p) { this.p = p; window.__authParams = p; } }
export const getAuth = () => ({});
export const onAuthStateChanged = (a, cb) => { cbs.push(cb); setTimeout(() => cb(user), 0); return () => {}; };
export const signInWithPopup = async () => { user = window.__mockUser || { email: 'shaun.langevin@mmuusd.org', emailVerified: true }; cbs.forEach((c) => c(user)); return { user }; };
export const signOut = async () => { user = null; cbs.forEach((c) => c(null)); };
export const connectAuthEmulator = () => {}; export const signInWithCredential = async () => {};
