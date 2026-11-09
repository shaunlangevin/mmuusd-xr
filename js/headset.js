// This headset's number: the sticker on the device, NOT a student. It decides which teacher page the headset follows.
// It's the same browser setting the exhibits use ('xr-headset' on shaunlangevin.github.io), so a headset numbered in the
// exhibits is already numbered here. It never leaves the headset. This is the only thing the labs keep in the browser.
const KEY = 'xr-headset';
export function readHeadset(param, valid) {
  if (valid(param)) { saveHeadset(param); return +param; }   // optional: a per-headset ArborXR link (?headset=3)
  try { const v = localStorage.getItem(KEY); return valid(v) ? +v : null; } catch { return null; }
}
export function saveHeadset(n) { try { localStorage.setItem(KEY, String(n)); } catch { /* still works for this visit */ } }
