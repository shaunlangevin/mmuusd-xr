// The cannon's boom, made in code (no sound file). Calm mode plays a soft "pop" instead.
let ctx = null;
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}
export function boom({ calm = false, size = 1 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime, out = ctx.createGain();
  out.gain.value = calm ? 0.12 : 0.55 * Math.min(1, 0.6 + 0.2 * size);
  out.connect(ctx.destination);
  // noise burst through a low-pass filter (the blast)
  const len = calm ? 0.25 : 1.6, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, calm ? 6 : 3);
  const n = ctx.createBufferSource(); n.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(calm ? 900 : 2400, t); lp.frequency.exponentialRampToValueAtTime(calm ? 200 : 120, t + len);
  n.connect(lp).connect(out); n.start(t);
  // a low thump
  if (!calm) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.75);
  }
}
