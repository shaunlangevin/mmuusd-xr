// Floating headset UI drawn on canvases (same approach as the artifact viewer, mmuusd-xr).
// A button is found from the UV point where a controller ray, hand ray or mouse hits the panel.
import * as THREE from 'three';

export const GOLD = '#d4af6a';
const INK = '#f4ecdc', DIM = '#c2b59e', GREEN = '#5fbf7a', RED = '#e2614b';
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

export class CanvasPanel {
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
    this.mesh.renderOrder = 30;   // UI draws on top of the cannon, so it is never hidden inside it
    this.mesh.userData.panel = this;
    this.buttons = [];
    this.hover = null;
    this.usedH = pxH;
    this.zoom = 1;
    this.base = 1;
  }
  setZoom(z) { this.zoom = z; this.mesh.scale.x = z * this.base; this.setUsedHeight(this.usedH); }
  setBase(b) { this.base = b; this.setZoom(this.zoom); }   // overall size (the panel is smaller at desk size)
  // show only the top `h` pixels of the canvas (the panel shrinks to fit its content), keeping the top edge in place
  setUsedHeight(h) {
    const H = this.canvas.height; h = Math.min(H, Math.max(60, Math.round(h)));
    this.usedH = h;
    this.mesh.scale.y = (this.zoom || 1) * this.base * h / H;
    this.tex.repeat.set(1, h / H); this.tex.offset.set(0, 1 - h / H);
  }
  // height of the visible part in metres (with zoom)
  heightM() { return this.mW * this.usedH / this.canvas.width * (this.zoom || 1) * this.base; }
  buttonAt(uv) {
    const x = uv.x * this.canvas.width, y = (1 - uv.y) * this.usedH;
    const b = this.buttons.find((b) => !b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    return b ? b.id : null;
  }
  // world position of a button's centre (used by tests)
  buttonWorld(id) {
    const b = this.buttons.find((x) => x.id === id); if (!b) return null;
    const W = this.canvas.width, H = this.canvas.height, mH = this.mW * H / W;
    this.mesh.updateMatrixWorld(true);
    return this.mesh.localToWorld(new THREE.Vector3(((b.x + b.w / 2) / W - 0.5) * this.mW, (0.5 - (b.y + b.h / 2) / this.usedH) * mH, 0));
  }
  setHover(id) { if (id !== this.hover) { this.hover = id; this.draw(); } }
  frame(h, r = 36) {
    const ctx = this.ctx, W = this.canvas.width;
    ctx.clearRect(0, 0, W, this.canvas.height);
    roundRect(ctx, 4, 4, W - 8, h - 8, r);
    ctx.fillStyle = 'rgba(22,19,16,0.94)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = GOLD; ctx.stroke();
  }
  drawButton(b, label, { primary = false, selected = false, disabled = false } = {}) {
    const ctx = this.ctx, hov = this.hover === b.id && !disabled;
    ctx.globalAlpha = disabled ? 0.35 : 1;
    roundRect(ctx, b.x, b.y, b.w, b.h, Math.min(b.h / 2, 40));
    ctx.fillStyle = hov ? '#f0cf86' : selected ? GOLD : primary ? 'rgba(212,175,106,0.32)' : 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = hov || selected ? GOLD : 'rgba(212,175,106,0.7)'; ctx.stroke();
    ctx.fillStyle = hov || selected ? '#1a1612' : INK;
    let size = Math.round(Math.min(b.h * 0.42, 40));
    ctx.font = `700 ${size}px ${FONT}`;
    while (ctx.measureText(label).width > b.w - 24 && size > 16) { size -= 2; ctx.font = `700 ${size}px ${FONT}`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.globalAlpha = 1;
  }
}

// ── the lab's main panel: drawn from a simple description (a "spec") ──
// spec = { kicker, title, blocks: [ {p, style}, {row:[{id,label,w,sel,primary,disabled}], h}, {table}, {chips}, {gap} ] }
const PAD = 44;
export class LabPanel extends CanvasPanel {
  constructor(pxH = 1150) { super(1024, pxH, 0.6); this.spec = null; this.overflow = false; }
  show(spec) { this.spec = spec; this.draw(); }
  draw() {
    const s = this.spec; if (!s) return;
    const ctx = this.ctx, W = this.canvas.width, IW = W - PAD * 2;
    // pass 1 measures, pass 2 draws (so the frame fits the content)
    const layout = (paint) => {
      let y = PAD - 6; const buttons = [];
      const text = (str, { size = 34, weight = 400, color = INK, lh = 1.32, x = PAD, w = IW, align = 'left' } = {}) => {
        ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'top';
        for (const line of wrap(ctx, str, w)) {
          if (paint) { ctx.fillStyle = color; ctx.fillText(line, align === 'center' ? x + w / 2 : x, y); }
          y += Math.round(size * lh);
        }
      };
      if (s.kicker) { text(s.kicker.toUpperCase(), { size: 24, weight: 800, color: GOLD }); y += 4; }
      if (s.title) { text(s.title, { size: 50, weight: 800, lh: 1.15 }); y += 14; }
      for (const b of s.blocks || []) {
        if (b.gap) { y += b.gap; continue; }
        if (b.p != null) {
          const st = b.style || 'body';
          const o = { body: {}, dim: { color: DIM, size: 30 }, em: { weight: 700 }, big: { size: 40, weight: 700 },
            gold: { color: GOLD, weight: 800, size: 30 }, good: { color: GREEN, weight: 800, size: 40 }, bad: { color: RED, weight: 800, size: 40 },
            label: { color: GOLD, weight: 800, size: 26 } }[st] || {};
          text(b.p, o); y += b.after ?? 12; continue;
        }
        if (b.kv) {   // two columns: label and value
          for (const [k, v] of b.kv) {
            ctx.font = `700 32px ${FONT}`; const kw = 330;
            const y0 = y; text(k, { size: 32, weight: 700, color: GOLD, w: kw - 16 });
            const yk = y; y = y0; text(v, { size: 32, x: PAD + kw, w: IW - kw }); y = Math.max(y, yk) + 4;
          }
          y += 8; continue;
        }
        if (b.row) {
          const h = b.h || 92, gap = 16, items = b.row;
          const sum = items.reduce((a, i) => a + (i.w || 1), 0), free = IW - gap * (items.length - 1);
          let x = PAD;
          for (const i of items) {
            const w = free * (i.w || 1) / sum, bb = { id: i.id, x, y, w, h, disabled: !!i.disabled };
            buttons.push(bb);
            if (paint) this.drawButton(bb, i.label, { primary: i.primary, selected: i.sel, disabled: i.disabled });
            x += w + gap;
          }
          y += h + (b.after ?? 18); continue;
        }
        if (b.chips) {   // word bank
          ctx.font = `600 30px ${FONT}`;
          let x = PAD; const h = 52;
          for (const w of b.chips) {
            const cw = ctx.measureText(w).width + 36;
            if (x + cw > W - PAD) { x = PAD; y += h + 12; }
            if (paint) {
              roundRect(ctx, x, y, cw, h, 26); ctx.fillStyle = 'rgba(212,175,106,0.16)'; ctx.fill();
              ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(w, x + 18, y + h / 2 + 1);
            }
            x += cw + 12;
          }
          y += h + 20; continue;
        }
        if (b.table) {   // the data table (Rainy Morning format)
          const T = b.table, cols = T.head.length, rowH = 64;
          const firstW = 290, cw = (IW - firstW) / (cols - 1);
          const cx = (c) => (c === 0 ? PAD : PAD + firstW + (c - 1) * cw);
          const cwid = (c) => (c === 0 ? firstW : cw);
          if (T.title) text(T.title, { size: 30, weight: 800, color: GOLD });
          const rows = [T.head, ...T.rows];
          rows.forEach((r, ri) => {
            const yy = y + ri * rowH;
            if (paint) {
              const cur = ri > 0 && T.current === ri - 1;
              ctx.fillStyle = ri === 0 ? 'rgba(212,175,106,0.22)' : cur ? 'rgba(212,175,106,0.12)' : 'rgba(255,255,255,0.04)';
              ctx.fillRect(PAD, yy, IW, rowH - 4);
              r.forEach((cell, c) => {
                const avg = c === cols - 1 && ri > 0;
                let size = ri === 0 ? 26 : avg ? 22 : 30;
                ctx.font = `${ri === 0 || c === 0 ? 800 : 600} ${size}px ${FONT}`;
                while (ctx.measureText(cell).width > cwid(c) - 16 && size > 16) { size -= 2; ctx.font = `${ri === 0 || c === 0 ? 800 : 600} ${size}px ${FONT}`; }
                ctx.fillStyle = avg ? DIM : ri === 0 ? GOLD : INK;
                ctx.textBaseline = 'middle'; ctx.textAlign = c === 0 ? 'left' : 'center';
                ctx.fillText(cell, c === 0 ? cx(c) + 12 : cx(c) + cwid(c) / 2, yy + rowH / 2 - 1);
              });
            }
          });
          y += rows.length * rowH + 14; continue;
        }
      }
      return { y: y + PAD - 20, buttons };
    };
    const m = layout(false);
    const h = Math.min(this.canvas.height, m.y);
    this.overflow = m.y > this.canvas.height;
    this.frame(h);
    this.buttons = layout(true).buttons;
    this.setUsedHeight(h);
    this.tex.needsUpdate = true;
  }
}

// ── a small label floating in 3D (canvas text on a plane) ──
export function labelPlane(text, { wM = 0.3, px = 44, color = INK, bg = 'rgba(22,19,16,0.82)', border = GOLD } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = `700 ${px}px ${FONT}`;
  const w = Math.ceil(g.measureText(text).width) + px, h = Math.round(px * 1.7);
  c.width = w; c.height = h;
  g.font = `700 ${px}px ${FONT}`;
  if (bg) { roundRect(g, 2, 2, w - 4, h - 4, h / 2 - 2); g.fillStyle = bg; g.fill(); if (border) { g.lineWidth = 3; g.strokeStyle = border; g.stroke(); } }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wM, wM * h / w), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.userData.text = text;
  return m;
}

// ── the magnifier ("loupe") over the ruler where the cannon stopped ──
// Draws the ruler around `cm` large enough to read, with the red pointer. The number shows only with "Show number".
export class Loupe extends CanvasPanel {
  constructor() { super(640, 300, 0.2); this.mesh.visible = false; this.cm = 0; this.showNum = false; this.predCm = null; }
  set(cm, showNum, predCm = null, predColor = '#2f7de1') { this.cm = cm; this.showNum = showNum; this.predCm = predCm; this.predColor = predColor; this.draw(); }
  draw() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    roundRect(ctx, 4, 4, W - 8, H - 8, 30); ctx.fillStyle = '#f3e7cf'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = GOLD; ctx.stroke();
    const pxPerCm = 22, mid = W / 2, base = 150;
    ctx.save(); roundRect(ctx, 8, 8, W - 16, H - 16, 26); ctx.clip();
    // the ruler counts up toward the LEFT (the way the cannon rolls), like the ruler on the track
    const from = Math.floor(this.cm - mid / pxPerCm) - 1, to = Math.ceil(this.cm + mid / pxPerCm) + 1;
    ctx.fillStyle = '#1d1a16'; ctx.strokeStyle = '#1d1a16';
    for (let c = Math.max(0, from); c <= to; c++) {
      const x = mid - (c - this.cm) * pxPerCm;
      const len = c % 10 === 0 ? 70 : c % 5 === 0 ? 50 : 30;
      ctx.lineWidth = c % 10 === 0 ? 4 : 2.5;
      ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - len); ctx.stroke();
      if (c % 5 === 0) { ctx.font = `800 ${c % 10 === 0 ? 40 : 30}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(c), x, base + 10); }
    }
    if (this.predCm != null) {   // the student's prediction flag
      const x = mid - (this.predCm - this.cm) * pxPerCm;
      ctx.strokeStyle = this.predColor || '#2f7de1'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, base); ctx.stroke();
    }
    ctx.restore();
    // the red pointer (the axle)
    ctx.fillStyle = RED; ctx.beginPath(); ctx.moveTo(mid - 16, 18); ctx.lineTo(mid + 16, 18); ctx.lineTo(mid, 50); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = RED; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(mid, 48); ctx.lineTo(mid, base); ctx.stroke();
    if (this.showNum) {
      const txt = `${Math.round(this.cm)} cm`;
      ctx.font = `800 40px ${FONT}`; const tw = ctx.measureText(txt).width + 30;
      roundRect(ctx, W - tw - 20, 18, tw, 56, 28); ctx.fillStyle = RED; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, W - tw / 2 - 20, 47);
    }
    this.tex.needsUpdate = true;
  }
}

// the track's ruler as a texture: 0 at the axle, counting up toward the left, every cm, labelled every 10 cm
export function rulerTexture(lengthCm) {
  const pxPerCm = 16, c = document.createElement('canvas');
  c.width = Math.min(8192, lengthCm * pxPerCm + 40); c.height = 160;
  const g = c.getContext('2d'), W = c.width;
  g.fillStyle = '#efe2c4'; g.fillRect(0, 0, W, c.height);
  g.fillStyle = '#1d1a16'; g.strokeStyle = '#1d1a16';
  for (let cm = 0; cm <= lengthCm; cm++) {
    const x = W - 20 - cm * pxPerCm;
    const len = cm % 10 === 0 ? 80 : cm % 5 === 0 ? 56 : 32;
    g.lineWidth = cm % 10 === 0 ? 4 : 2;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, len); g.stroke();
    if (cm % 10 === 0) { g.font = `800 ${cm % 50 === 0 ? 50 : 40}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(String(cm), x, c.height - 8); }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { tex, aspect: c.width / c.height, padFrac: 20 / c.width };
}

// ── grab handles: a round "move" knob (four arrows) for the lab, and a dotted bar for the panel ──
export function moveKnobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(22,19,16,0.88)'; ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 7; ctx.strokeStyle = GOLD; ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(64, 30); ctx.lineTo(64, 98); ctx.moveTo(30, 64); ctx.lineTo(98, 64); ctx.stroke();
  for (const a of [0, 1, 2, 3]) {   // four arrowheads
    ctx.save(); ctx.translate(64, 64); ctx.rotate(a * Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(-14, -26); ctx.lineTo(14, -26); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function grabBarTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 40;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(22,19,16,0.88)'; roundRect(ctx, 2, 2, 252, 36, 18); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = GOLD; roundRect(ctx, 2, 2, 252, 36, 18); ctx.stroke();
  ctx.fillStyle = INK;
  for (let i = 0; i < 6; i++) for (const y of [14, 26]) { ctx.beginPath(); ctx.arc(98 + i * 12, y, 3.2, 0, Math.PI * 2); ctx.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
