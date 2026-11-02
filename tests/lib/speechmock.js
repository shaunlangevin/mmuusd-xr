// fake speech engine for tests: two voices, records what is spoken, "finishes" each sentence after 30 ms
(() => {
  const spoken = []; window.__spoken = spoken;
  const V = [{ name: 'Test EN', lang: 'en-US', localService: true }, { name: 'Test ES', lang: 'es-MX', localService: true }];
  let q = [], busy = false, cancelled = 0;
  const next = () => { if (busy || !q.length) return; busy = true; const u = q.shift(); const c = cancelled; setTimeout(() => { busy = false; if (c === cancelled) { spoken.push(u.text); u.onend && u.onend(); next(); } }, 30); };
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.voice = null; this.lang = ''; this.rate = 1; };
  const listeners = {};
  Object.defineProperty(window, 'speechSynthesis', { value: {
    getVoices: () => V, speak: (u) => { q.push(u); next(); }, cancel: () => { q = []; busy = false; cancelled++; },
    addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); }, get speaking() { return busy; } } });
})();
