// Floating headset UI drawn on canvases. Buttons are found from the UV coordinate
// where a controller ray (or hand ray) hits a panel.
import * as THREE from 'three';
import { UI, L } from './i18n.js';

export const GOLD = '#d4af6a';
const INK = '#f4ecdc', DIM = '#c2b59e', GREEN = '#5fbf7a';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

class CanvasPanel {
  constructor(pxW, pxH, mW) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pxW; this.canvas.height = pxH;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mW = mW;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(mW, mW * pxH / pxW),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    this.mesh.renderOrder = 30;   // UI always draws on top of the stone, so text is never hidden inside it
    this.mesh.userData.panel = this;
    this.buttons = [];
    this.hover = null;
    this.usedH = pxH;
  }
  // show only the top `h` pixels of the canvas (panel shrinks to fit its content)
  setUsedHeight(h) {
    const H = this.canvas.height; h = Math.min(H, Math.max(60, Math.round(h)));
    this.usedH = h;
    this.mesh.scale.y = h / H;
    this.tex.repeat.set(1, h / H); this.tex.offset.set(0, 1 - h / H);
  }
  buttonAt(uv) {
    const x = uv.x * this.canvas.width, y = (1 - uv.y) * this.usedH;
    const b = this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    return b ? b.id : null;
  }
  // world position of a button's centre (used by tests)
  buttonWorld(id) {
    const b = this.buttons.find((x) => x.id === id); if (!b) return null;
    const W = this.canvas.width, H = this.canvas.height, mH = this.mW * H / W;
    return this.mesh.localToWorld(new THREE.Vector3(((b.x + b.w / 2) / W - 0.5) * this.mW, (0.5 - (b.y + b.h / 2) / this.usedH) * mH, 0));
  }
  setHover(id) { if (id !== this.hover) { this.hover = id; this.draw(); } }
  frame(r = 36, h = this.canvas.height) {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    roundRect(ctx, 4, 4, W - 8, h - 8, r);
    ctx.fillStyle = 'rgba(22,19,16,0.94)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = GOLD; ctx.stroke();
  }
  drawButton(b, label, { primary = false, selected = false } = {}) {
    const ctx = this.ctx, hov = this.hover === b.id;
    roundRect(ctx, b.x, b.y, b.w, b.h, b.h / 2);
    ctx.fillStyle = hov ? '#f0cf86' : selected ? GOLD : primary ? 'rgba(212,175,106,0.30)' : 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = hov || selected ? GOLD : 'rgba(212,175,106,0.7)'; ctx.stroke();
    ctx.fillStyle = hov || selected ? '#1a1612' : INK;
    let size = Math.round(b.h * 0.42);
    ctx.font = `700 ${size}px ${FONT}`;
    while (ctx.measureText(label).width > b.w - 24 && size > 14) { size -= 2; ctx.font = `700 ${size}px ${FONT}`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
  layoutRow(items, y, h, gap = 18, pad = 40) {
    // items: [{id, label, w (relative)}] → fills the width
    const W = this.canvas.width - pad * 2 - gap * (items.length - 1);
    const sum = items.reduce((a, i) => a + (i.w || 1), 0);
    let x = pad;
    return items.map((i) => { const w = W * (i.w || 1) / sum; const b = { id: i.id, x, y, w, h }; x += w + gap; return b; });
  }
}

// ── the reading panel for a dot ─────────────────────────────────
export class InfoPanel extends CanvasPanel {
  constructor() { super(1024, 1180, 0.68); this.mesh.visible = false; this.state = null; }
  show(state) { this.state = state; this.draw(); this.mesh.visible = true; }
  hide() { this.mesh.visible = false; this.state = null; }
  layout(s) {
    const st = this.state, d = st.dot, lang = st.lang, t = UI[lang];
    const ctx = this.ctx, W = this.canvas.width, pad = 52, maxW = W - pad * 2;
    const ops = []; let y = 46;
    const text = (str, font, color, x = pad, w = maxW, lh = 1.3) => {
      ctx.font = font; const px = parseFloat(font.match(/(\d+)px/)[1]);
      for (const l of wrap(ctx, str, w)) { ops.push({ t: l, x, y, f: font, c: color }); y += px * lh; }
    };
    const label = (str) => { y += 14 * s; text(str, `800 ${Math.round(24 * s)}px ${FONT}`, GOLD); y += 2; };
    text(L(d.title, lang), `800 ${Math.round(52 * s)}px ${FONT}`, INK, pad + 96, maxW - 96, 1.15);
    y = Math.max(y, 46 + 84) + 12 * s;
    text(L(d.text, lang), `400 ${Math.round(35 * s)}px ${FONT}`, INK);
    if (d.facts) {
      y += 10 * s;
      for (const f of d.facts) {
        ctx.font = `800 ${Math.round(31 * s)}px ${FONT}`;
        const k = L(f.k, lang); const kw = 260 * s;
        ops.push({ t: k, x: pad, y, f: ctx.font, c: GOLD });
        const y0 = y; text(L(f.v, lang), `500 ${Math.round(31 * s)}px ${FONT}`, INK, pad + kw, maxW - kw);
        y = Math.max(y, y0 + 31 * s * 1.3) + 4 * s;
      }
    }
    if (d.law) {
      label(t.plain);
      const top = y; text(L(d.law.plain, lang), `500 ${Math.round(33 * s)}px ${FONT}`, '#f6e2b4', pad + 26, maxW - 26);
      ops.push({ bar: true, y0: top - 4, y1: y });
    }
    if (st.expanded) {
      if (d.more) { y += 14 * s; text(L(d.more, lang), `400 ${Math.round(31 * s)}px ${FONT}`, INK); }
      if (d.law && d.law.original) {
        label(t.original);
        text('“' + d.law.original + '”', `italic 400 ${Math.round(28 * s)}px Georgia, "Times New Roman", serif`, '#e7d3a6');
        text(`${t.lawCreditPrefix} ${L(d.law.source, lang)}, ${L(st.lawCredit, lang)}`, `400 ${Math.round(22 * s)}px ${FONT}`, DIM);
      }
      if (st.credit) { y += 10 * s; text(st.credit, `400 ${Math.round(20 * s)}px ${FONT}`, DIM); }
    }
    if (d.think) { label(t.think); text(L(d.think, lang), `700 ${Math.round(34 * s)}px ${FONT}`, INK); }
    return { ops, height: y };
  }
  draw() {
    if (!this.state) return;
    const st = this.state, t = UI[st.lang];
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, footer = 130;
    let s = 1, Lyt = this.layout(s);
    while (Lyt.height > H - footer - 6 && s > 0.55) { s -= 0.03; Lyt = this.layout(s); }
    const used = Math.min(H, Lyt.height + footer + 6);
    this.frame(36, used);
    this.setUsedHeight(used);
    // badge
    ctx.beginPath(); ctx.arc(52 + 38, 46 + 36, 38, 0, Math.PI * 2); ctx.fillStyle = st.found ? GREEN : GOLD; ctx.fill();
    ctx.fillStyle = '#1a1612'; ctx.font = `800 ${st.badge && st.badge.length > 2 ? 30 : 40}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(st.badge ?? String(st.index + 1), 52 + 38, 46 + 38);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (const op of Lyt.ops) {
      if (op.bar) { ctx.fillStyle = GOLD; ctx.fillRect(52, op.y0, 7, op.y1 - op.y0); continue; }
      ctx.font = op.f; ctx.fillStyle = op.c; ctx.fillText(op.t, op.x, op.y);
    }
    const items = [];
    if (!st.single) items.push({ id: 'prev', label: t.back, w: 1 });
    if (st.hasAudio) items.push({ id: 'listen', label: st.playing ? t.stop : t.listen, w: 1.1 });
    if (st.hasMore) items.push({ id: 'more', label: st.expanded ? t.less : t.more, w: 1.5 });
    if (!st.noClose) items.push({ id: 'close', label: t.close, w: 1 });
    if (!st.single) items.push({ id: 'next', label: t.next, w: 1 });
    this.buttons = this.layoutRow(items, used - footer + 22, 88, 14, 40);
    this.buttons.forEach((b, i) => this.drawButton(b, items[i].label, { primary: b.id === 'close' || b.id === 'listen' }));
    this.tex.needsUpdate = true;
  }
}

// ── picture panel (map / signs) shown next to the reading panel ─────────
export class ExtraPanel extends CanvasPanel {
  constructor() { super(1000, 760, 0.44); this.mesh.visible = false; }
  showCanvas(src) {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    this.frame(30);
    const pad = 20, w = W - pad * 2, h = H - pad * 2;
    ctx.save(); roundRect(ctx, pad, pad, w, h, 18); ctx.clip();
    const r = Math.min(w / src.width, h / src.height);
    ctx.drawImage(src, pad + (w - src.width * r) / 2, pad + (h - src.height * r) / 2, src.width * r, src.height * r);
    ctx.restore();
    this.tex.needsUpdate = true; this.mesh.visible = true;
  }
  draw() {}
}

// ── toolbar ─────────────────────────────────────────────────────
export class Toolbar extends CanvasPanel {
  constructor() { super(1400, 150, 0.84); this.items = []; this.lang = 'en'; this.badge = ''; }
  set(items, lang, badge = '') { this.items = items; this.lang = lang; this.badge = badge; this.draw(); }
  draw() {
    const t = UI[this.lang], ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    this.frame(44);
    const labels = { left: t.turnL, right: t.turnR, move: t.move, options: t.options, exit: t.exit };
    // headset number (classroom use), so the teacher can spot a mix-up at a glance
    let left = 34;
    if (this.badge) {
      ctx.beginPath(); ctx.arc(34 + 46, H / 2, 46, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = GOLD; ctx.stroke();
      ctx.fillStyle = GOLD; ctx.font = `800 52px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.badge, 34 + 46, H / 2 + 2);
      left = 34 + 92 + 20;
    }
    const n = Math.max(1, this.items.length), gap = 20, w = (W - left - 34 - gap * (n - 1)) / n;
    this.buttons = this.items.map((id, i) => ({ id, x: left + i * (w + gap), y: 29, w, h: 92 }));
    this.buttons.forEach((b) => this.drawButton(b, labels[b.id], { primary: b.id === 'options' }));
    this.tex.needsUpdate = true;
  }
}

// ── grab bar above the reading panel: drag to move it, or Hide it ──
export class HandleBar extends CanvasPanel {
  constructor() { super(1000, 120, 0.48); this.mesh.visible = false; this.lang = 'en'; this.canMove = true; this.grabbing = false; }
  set(lang, canMove, grabbing = false) {
    if (lang === this.lang && canMove === this.canMove && grabbing === this.grabbing && this.buttons.length) return;
    this.lang = lang; this.canMove = canMove; this.grabbing = grabbing; this.draw();
  }
  draw() {
    const t = UI[this.lang], ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const h = 96, y = (H - h) / 2;
    if (this.canMove) {
      const g = { id: 'grab', x: 8, y, w: 600, h }, b = { id: 'hide', x: 630, y, w: W - 638, h };
      this.buttons = [g, b];
      const hov = this.hover === 'grab' || this.grabbing;
      roundRect(ctx, g.x, g.y, g.w, g.h, h / 2);
      ctx.fillStyle = hov ? '#f0cf86' : 'rgba(22,19,16,0.9)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = GOLD; ctx.stroke();
      // grip dots
      ctx.fillStyle = hov ? '#1a1612' : GOLD;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { ctx.beginPath(); ctx.arc(70 + c * 24, H / 2 - 12 + r * 24, 7, 0, Math.PI * 2); ctx.fill(); }
      ctx.font = `700 40px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = hov ? '#1a1612' : INK; ctx.fillText(t.dragMe, 160, H / 2 + 1);
      this.drawButton(b, t.hide);
    } else {
      const b = { id: 'hide', x: (W - 360) / 2, y, w: 360, h };
      this.buttons = [b]; this.drawButton(b, t.hide);
    }
    this.tex.needsUpdate = true;
  }
}

// ── small tab left behind when a reading panel is hidden ──
export class ShowTab extends CanvasPanel {
  constructor() { super(640, 120, 0.3); this.mesh.visible = false; this.key = ''; }
  set(badge, lang, found) {
    const key = badge + lang + found + this.hover; if (key === this.key) return; this.key = key;
    this.badge = badge; this.lang = lang; this.found = found; this.draw();
  }
  draw() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, t = UI[this.lang || 'en'];
    const hov = this.hover === 'show';
    ctx.clearRect(0, 0, W, H);
    roundRect(ctx, 6, 6, W - 12, H - 12, (H - 12) / 2);
    ctx.fillStyle = hov ? '#f0cf86' : 'rgba(22,19,16,0.94)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = GOLD; ctx.stroke();
    ctx.beginPath(); ctx.arc(66, H / 2, 40, 0, Math.PI * 2); ctx.fillStyle = this.found ? GREEN : GOLD; ctx.fill();
    ctx.fillStyle = '#1a1612'; ctx.font = `800 ${String(this.badge).length > 1 ? 32 : 44}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(this.badge), 66, H / 2 + 2);
    ctx.fillStyle = hov ? '#1a1612' : INK; ctx.font = `700 44px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(t.showAgain, 130, H / 2 + 2);
    this.buttons = [{ id: 'show', x: 0, y: 0, w: W, h: H }];
    this.tex.needsUpdate = true;
  }
}

// ── "Dots found" tracker (sits above the toolbar) ───────────────
export class Tracker extends CanvasPanel {
  constructor() { super(1400, 120, 0.84); this.mesh.visible = false; }
  set(found, total, lang) { this.found = found; this.total = total; this.lang = lang; this.draw(); }
  draw() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, t = UI[this.lang || 'en'];
    this.frame(40);
    ctx.fillStyle = INK; ctx.font = `800 44px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(t.found(this.found.size, this.total), 40, H / 2);
    const r = 24, x0 = W - 40 - this.total * (r * 2 + 12) + r;
    for (let i = 0; i < this.total; i++) {
      const x = x0 + i * (r * 2 + 12), on = this.found.has(i);
      ctx.beginPath(); ctx.arc(x, H / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = on ? GREEN : 'rgba(255,255,255,0.08)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = on ? GREEN : 'rgba(212,175,106,0.7)'; ctx.stroke();
      ctx.fillStyle = on ? '#10200f' : DIM; ctx.font = `800 26px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), x, H / 2 + 1);
    }
    this.tex.needsUpdate = true;
  }
}

// ── Clue card (clue mode; sits above the tracker) ──────────────
export class ClueCard extends CanvasPanel {
  constructor() { super(1400, 230, 0.84); this.mesh.visible = false; this.data = null; }
  set(data) { this.data = data; this.draw(); }
  draw() {
    if (!this.data) return;
    const { label, text, hint } = this.data, ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    this.frame(40);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = GOLD; ctx.font = `800 30px ${FONT}`; ctx.fillText(label, 44, 26);
    let fs = 44; ctx.font = `700 ${fs}px ${FONT}`;
    let lines = wrap(ctx, text, W - 44 - 300);
    while (lines.length > 3 && fs > 28) { fs -= 2; ctx.font = `700 ${fs}px ${FONT}`; lines = wrap(ctx, text, W - 44 - 300); }
    ctx.fillStyle = INK;
    lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, 44, 70 + i * fs * 1.2));
    const b = { id: 'hint', x: W - 44 - 230, y: H / 2 - 46, w: 230, h: 92 };
    this.buttons = [b]; this.drawButton(b, hint, { primary: true });
    this.tex.needsUpdate = true;
  }
}

// ── Options (unmanaged use) ─────────────────────────────────────
export class OptionsPanel extends CanvasPanel {
  constructor() { super(1024, 1260, 0.62); this.mesh.visible = false; this.S = null; this.headset = null; }
  // headset: null (not in a classroom) or { n: current number or null, count }
  show(S, headset = null) { this.S = S; this.headset = headset; this.draw(); this.mesh.visible = true; }
  draw() {
    if (!this.S) return;
    const S = this.S, t = UI[S.lang], ctx = this.ctx;
    const rows = [
      [t.optLang, [['lang:en', 'English', S.lang === 'en'], ['lang:es', 'Español', S.lang === 'es']]],
      [t.optHunt, [['hunt:on', t.on, S.hunt], ['hunt:off', t.off, !S.hunt]]],
      [t.optClues, [['clues:on', t.on, S.clues], ['clues:off', t.off, !S.clues]]],
      [t.optMode, [['mode:walk', t.walk, S.mode === 'walk'], ['mode:seated', t.seated, S.mode === 'seated']]],
      [t.optSize, [['size:life', t.life, S.size === 'life'], ['size:table', t.table, S.size === 'table']]],
    ];
    if (this.headset) {
      const hs = this.headset;
      rows.push([t.optHeadset, Array.from({ length: hs.count }, (_, i) => [`headset:${i}`, String(i), hs.n === i])]);
    }
    const used = 40 + rows.length * 172 + 120;
    this.frame(36, used);
    this.setUsedHeight(used);
    this.buttons = [];
    let y = 40;
    for (const [title, opts] of rows) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = GOLD; ctx.font = `800 34px ${FONT}`; ctx.fillText(title, 48, y); y += 52;
      const bs = this.layoutRow(opts.map(([id]) => ({ id })), y, 90, opts.length > 3 ? 12 : 20, 48);
      bs.forEach((b, i) => { this.buttons.push(b); this.drawButton(b, opts[i][1], { selected: opts[i][2] }); });
      y += 120;
    }
    const done = { id: 'done', x: 1024 / 2 - 180, y: y + 6, w: 360, h: 90 };
    this.buttons.push(done); this.drawButton(done, t.done, { primary: true });
    this.tex.needsUpdate = true;
  }
}

// ── teacher freeze message (shown alone, in front of the student) ──
export class FreezePanel extends CanvasPanel {
  constructor() { super(1024, 420, 0.8); this.key = ''; }
  set(from, text) {
    const key = from + text; if (key === this.key) return; this.key = key;
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    this.frame(44);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = GOLD; ctx.font = `800 36px ${FONT}`; ctx.fillText(from.toUpperCase(), W / 2, 70);
    let fs = 66; ctx.font = `800 ${fs}px ${FONT}`;
    let lines = wrap(ctx, text, W - 100);
    while (lines.length > 3 && fs > 40) { fs -= 4; ctx.font = `800 ${fs}px ${FONT}`; lines = wrap(ctx, text, W - 100); }
    ctx.fillStyle = INK;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + 30 + (i - (lines.length - 1) / 2) * fs * 1.2));
    this.tex.needsUpdate = true;
  }
  draw() {}
}

// ── floating instruction ────────────────────────────────────────
export class HintPanel extends CanvasPanel {
  constructor() { super(1024, 200, 0.62); this.text = ''; this.mesh.visible = false; }
  setText(text) {
    if (text === this.text) return;
    this.text = text;
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    this.frame(40);
    ctx.fillStyle = INK; ctx.font = `700 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = wrap(ctx, text, W - 80);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * 50));
    this.tex.needsUpdate = true;
  }
  draw() {}
}

// ── numbered dot textures (gold = new, green = found) ───────────
const markerCache = new Map();
export function markerTexture(n, found) {
  const key = n + (found ? 'f' : '');
  if (markerCache.has(key)) return markerCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fillStyle = found ? 'rgba(95,191,122,0.97)' : 'rgba(212,175,106,0.97)'; ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = '#fff8e6'; ctx.stroke();
  ctx.fillStyle = '#1a1612'; ctx.font = `800 66px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(found ? '✓' : String(n), 64, 68);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  markerCache.set(key, tex);
  return tex;
}

// a gold arrow pointing right (+x), used to guide students to the tour's dot
export function arrowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.beginPath(); ctx.moveTo(236, 128); ctx.lineTo(120, 28); ctx.lineTo(120, 88); ctx.lineTo(24, 88);
  ctx.lineTo(24, 168); ctx.lineTo(120, 168); ctx.lineTo(120, 228); ctx.closePath();
  ctx.fillStyle = 'rgba(212,175,106,0.97)'; ctx.fill();
  ctx.lineJoin = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = '#fff8e6'; ctx.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// text label sprite-like plane (for the height ruler)
export function labelPlane(text, wM = 0.5) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  roundRect(ctx, 2, 2, 508, 92, 30); ctx.fillStyle = 'rgba(22,19,16,0.9)'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = GOLD; ctx.stroke();
  let fs = 44; ctx.font = `800 ${fs}px ${FONT}`;
  while (ctx.measureText(text).width > 470 && fs > 18) { fs -= 2; ctx.font = `800 ${fs}px ${FONT}`; }
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wM, wM * 96 / 512),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = 9;
  return m;
}
