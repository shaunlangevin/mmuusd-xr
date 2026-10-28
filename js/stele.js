// Builds the stand-in stele: a basalt "finger" stone with a carved relief
// and bands of decorative cuneiform, all drawn at load time (no image files).
import * as THREE from 'three';

const H = 2.25;          // height (m)
const DOME = 0.30;       // height of the rounded top (m)
const BASE_A = 0.36, BASE_B = 0.225;   // half-width / half-depth at the base
const TOP_A = 0.315, TOP_B = 0.195;    // ...where the dome starts

const RELIEF = { u0: 0.09, u1: 0.41, v0: 0.665, v1: 0.905 };

async function loadCuneiformFont() {
  try {
    const face = new FontFace('SteleCuneiform', 'url(fonts/NotoSansCuneiform.woff2)');
    await face.load();
    document.fonts.add(face);
    return true;
  } catch (e) {
    console.warn('Cuneiform font failed to load; using wedge marks instead.', e);
    return false;
  }
}

// Deterministic random so the stone looks the same every time
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function buildGeometry() {
  const SEG = 128;
  const heights = [], scales = [];
  const SHAFT = 40, CAP = 18;
  for (let j = 0; j <= SHAFT; j++) { heights.push((H - DOME) * j / SHAFT); scales.push(1); }
  for (let j = 1; j <= CAP; j++) {
    const phi = (Math.PI / 2) * j / CAP;
    heights.push(H - DOME + DOME * Math.sin(phi));
    scales.push(Math.cos(phi));
  }
  const pos = [], uv = [], idx = [];
  const rows = heights.length;
  for (let j = 0; j < rows; j++) {
    const h = heights[j];
    const t = Math.min(h / (H - DOME), 1);
    const a = (BASE_A + (TOP_A - BASE_A) * t) * scales[j];
    const b = (BASE_B + (TOP_B - BASE_B) * t) * scales[j];
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG, th = u * Math.PI * 2;
      // u = 0.25 is the front (+z); u increases toward the viewer's right
      pos.push(-a * Math.cos(th), h, b * Math.sin(th));
      uv.push(u, h / H);
    }
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * (SEG + 1) + i, b = a + 1, c = b + SEG + 1, d = a + SEG + 1;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ── texture painting ───────────────────────────────────────────
function paintStone(ctx, W, Hp, rand, dark) {
  ctx.fillStyle = dark ? '#2b2a2c' : 'rgb(128,128,128)';
  ctx.fillRect(0, 0, W, Hp);
  const n = dark ? 2600 : 1400;
  for (let i = 0; i < n; i++) {
    const x = rand() * W, y = rand() * Hp, r = (4 + rand() * 40) * W / 4096;
    const light = rand() > 0.5;
    ctx.fillStyle = dark
      ? (light ? `rgba(80,78,76,${0.05 + rand() * 0.08})` : `rgba(10,10,12,${0.06 + rand() * 0.1})`)
      : (light ? `rgba(160,160,160,${0.08 + rand() * 0.1})` : `rgba(95,95,95,${0.08 + rand() * 0.1})`);
    ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.4 + rand() * 0.8), rand() * 3, 0, Math.PI * 2); ctx.fill();
  }
}

// Draws the relief figures (Hammurabi standing, Shamash seated) in metre
// coordinates inside the relief rectangle. `fill` / `line` are colours.
function drawRelief(ctx, W, Hp, fill, line, bg) {
  const C = 2 * Math.PI * ((TOP_A + BASE_A) / 2 + (TOP_B + BASE_B) / 2) / 2 * 1.0; // approx circumference
  const sx = W / C, sy = Hp / H;
  const x0 = RELIEF.u0 * W, x1 = RELIEF.u1 * W;
  const yb = (1 - RELIEF.v0) * Hp, yt = (1 - RELIEF.v1) * Hp;
  const relW = (x1 - x0) / sx;                   // relief width in metres
  const X = (m) => x0 + m * sx * ((x1 - x0) / sx) / relW;
  const Y = (m) => yb - m * sy;
  const poly = (pts, f = true) => {
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.closePath(); if (f) ctx.fill(); else ctx.stroke();
  };
  const circ = (x, y, r) => { ctx.beginPath(); ctx.ellipse(X(x), Y(y), r * sx, r * sy, 0, 0, Math.PI * 2); ctx.fill(); };
  const lineSeg = (pts, w) => {
    ctx.lineWidth = w * sx; ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke();
  };
  const k = relW / 0.55;   // figure layout was designed for a 0.55 m wide panel
  const P = (x, y) => [x * k, y];

  // recessed background panel with rounded top
  ctx.fillStyle = bg;
  ctx.beginPath();
  const r = 0.08 * sx;
  ctx.moveTo(x0, yb); ctx.lineTo(x0, yt + r); ctx.quadraticCurveTo(x0, yt, x0 + r, yt);
  ctx.lineTo(x1 - r, yt); ctx.quadraticCurveTo(x1, yt, x1, yt + r); ctx.lineTo(x1, yb); ctx.closePath(); ctx.fill();

  ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // ground line
  poly([P(0.02, 0.02), P(0.53, 0.02), P(0.53, 0.035), P(0.02, 0.035)]);

  // ── Hammurabi (left, standing, facing right)
  poly([P(0.075, 0.035), P(0.205, 0.035), P(0.196, 0.25), P(0.205, 0.33), P(0.178, 0.362), P(0.108, 0.362), P(0.088, 0.30), P(0.084, 0.20)]);
  circ(0.145 * k, 0.405, 0.044);                                   // head
  poly([P(0.098, 0.43), P(0.192, 0.43), P(0.188, 0.468), P(0.102, 0.468)]); // cap
  poly([P(0.09, 0.425), P(0.20, 0.425), P(0.20, 0.438), P(0.09, 0.438)]);  // cap brim
  poly([P(0.15, 0.392), P(0.195, 0.388), P(0.19, 0.33), P(0.158, 0.338)]); // beard
  lineSeg([P(0.188, 0.325), P(0.222, 0.338), P(0.205, 0.392)], 0.022);      // arm raised to the mouth

  // ── Shamash (right, seated on a throne, facing left)
  poly([P(0.405, 0.035), P(0.505, 0.035), P(0.505, 0.235), P(0.405, 0.235)]);   // throne
  poly([P(0.265, 0.035), P(0.355, 0.035), P(0.355, 0.085), P(0.265, 0.085)]);   // mountain footstool
  poly([P(0.30, 0.085), P(0.44, 0.085), P(0.465, 0.245), P(0.315, 0.245), P(0.292, 0.20)]); // flounced skirt
  poly([P(0.352, 0.245), P(0.452, 0.245), P(0.452, 0.362), P(0.362, 0.372)]);   // torso
  circ(0.395 * k, 0.42, 0.044);                                                  // head
  poly([P(0.352, 0.448), P(0.438, 0.448), P(0.43, 0.535), P(0.36, 0.535)]);     // horned crown
  poly([P(0.352, 0.412), P(0.392, 0.402), P(0.388, 0.338), P(0.35, 0.348)]);    // beard
  lineSeg([P(0.365, 0.33), P(0.30, 0.322), P(0.272, 0.33)], 0.024);             // arm to the king
  // flames from the shoulders
  for (const [sx0, dir] of [[0.45, 1], [0.365, -1]]) {
    for (let f = 0; f < 3; f++) {
      const pts = [];
      for (let s = 0; s <= 8; s++) {
        const t = s / 8;
        pts.push(P(sx0 + dir * (0.012 + f * 0.018) + Math.sin(t * 9 + f) * 0.008, 0.36 + t * (0.07 + f * 0.012)));
      }
      lineSeg(pts, 0.011);
    }
  }
  // rod and ring
  lineSeg([P(0.262, 0.30), P(0.262, 0.37)], 0.012);
  ctx.lineWidth = 0.011 * sx; ctx.beginPath();
  ctx.ellipse(X(0.245 * k), Y(0.336), 0.02 * sx, 0.02 * sy, 0, 0, Math.PI * 2); ctx.stroke();

  // ── carved detail lines
  ctx.strokeStyle = line;
  for (let t = 0; t < 5; t++) lineSeg([P(0.30 + t * 0.003, 0.11 + t * 0.03), P(0.455, 0.11 + t * 0.03)], 0.004); // flounces
  for (let t = 0; t < 4; t++) lineSeg([P(0.356, 0.462 + t * 0.018), P(0.434, 0.462 + t * 0.018)], 0.005);     // horns
  for (let t = 0; t < 2; t++) lineSeg([P(0.475 + t * 0.017, 0.05), P(0.475 + t * 0.017, 0.22)], 0.005);       // throne niches
  for (let t = 0; t < 3; t++) for (let q = 0; q < 2; q++) {                                                    // mountain scales
    ctx.lineWidth = 0.004 * sx; ctx.beginPath();
    ctx.arc(X((0.28 + t * 0.03) * k), Y(0.045 + q * 0.022), 0.012 * sx, Math.PI, 0); ctx.stroke();
  }
  lineSeg([P(0.10, 0.07), P(0.185, 0.24)], 0.004);   // robe drape
  lineSeg([P(0.125, 0.05), P(0.19, 0.17)], 0.004);
}

function drawTextBands(ctx, W, Hp, rand, opts) {
  const { u0, u1, vTop, vBot, bands, erasedFromBottom = 0, glyph, rule, erasedFill, hasFont } = opts;
  const x0 = u0 * W, x1 = u1 * W;
  const bandH = ((vTop - vBot) * Hp) / bands;
  const cellW = Math.max(6, Math.round(W / 158));
  for (let b = 0; b < bands; b++) {
    const y0 = (1 - vTop) * Hp + b * bandH;
    if (b >= bands - erasedFromBottom) {
      ctx.fillStyle = erasedFill; ctx.fillRect(x0, y0, x1 - x0, bandH);
      continue;
    }
    ctx.fillStyle = rule;
    ctx.fillRect(x0, y0, x1 - x0, Math.max(1, bandH * 0.025));
    // vertical cells read right-to-left; signs are stacked inside each cell
    for (let x = x1 - cellW; x >= x0; x -= cellW) {
      ctx.fillStyle = rule;
      ctx.globalAlpha = 0.45; ctx.fillRect(x, y0, Math.max(1, cellW * 0.06), bandH); ctx.globalAlpha = 1;
      const size = cellW * 0.82;
      const count = Math.floor((bandH * 0.92) / size);
      let y = y0 + bandH * 0.06;
      ctx.fillStyle = glyph;
      for (let s = 0; s < count; s++) {
        if (rand() < 0.07) { y += size; continue; }
        ctx.save();
        ctx.translate(x + cellW * 0.53, y + size * 0.5);
        ctx.rotate(-Math.PI / 2);
        if (hasFont) {
          const cp = 0x12000 + Math.floor(rand() * 0x36E);
          ctx.fillText(String.fromCodePoint(cp), 0, 0);
        } else {          // fallback: little wedges
          for (let w = 0; w < 3; w++) {
            const wx = (rand() - 0.5) * size * 0.6, wy = (rand() - 0.5) * size * 0.6;
            ctx.beginPath(); ctx.moveTo(wx - size * 0.15, wy - size * 0.1); ctx.lineTo(wx + size * 0.2, wy); ctx.lineTo(wx - size * 0.15, wy + size * 0.1); ctx.fill();
          }
        }
        ctx.restore();
        y += size;
      }
    }
  }
}

function paintTextures(hasFont, colorSize, bumpSize) {
  const mk = (s) => { const c = document.createElement('canvas'); c.width = c.height = s; return c; };
  const cCol = mk(colorSize), cBump = mk(bumpSize);
  const col = cCol.getContext('2d'), bump = cBump.getContext('2d');

  paintStone(col, colorSize, colorSize, rng(7), true);
  paintStone(bump, bumpSize, bumpSize, rng(11), false);

  // relief
  drawRelief(col, colorSize, colorSize, '#4a4743', '#24221f', '#211f1f');
  // bump: raised figures, blurred so the edges slope like carving
  const tmp = mk(bumpSize), t = tmp.getContext('2d');
  t.fillStyle = 'rgb(128,128,128)'; t.fillRect(0, 0, bumpSize, bumpSize);
  drawRelief(t, bumpSize, bumpSize, 'rgb(215,215,215)', 'rgb(150,150,150)', 'rgb(85,85,85)');
  bump.save();
  const rx0 = RELIEF.u0 * bumpSize - 8, ry0 = (1 - RELIEF.v1) * bumpSize - 8;
  const rw = (RELIEF.u1 - RELIEF.u0) * bumpSize + 16, rh = (RELIEF.v1 - RELIEF.v0) * bumpSize + 16;
  try { bump.filter = `blur(${Math.max(1, bumpSize / 1024)}px)`; } catch (e) { /* ignore */ }
  bump.drawImage(tmp, rx0, ry0, rw, rh, rx0, ry0, rw, rh);
  bump.restore();

  // text: front (below relief, bottom 7 bands erased) and back (full height)
  const front = { u0: 0.015, u1: 0.485, vTop: 0.645, vBot: 0.035, bands: 23, erasedFromBottom: 7 };
  const back = { u0: 0.515, u1: 0.985, vTop: 0.875, vBot: 0.035, bands: 28 };
  for (const [ctx, size, glyph, rule, erased, seed] of [
    [col, colorSize, 'rgba(150,144,135,0.62)', 'rgba(120,115,108,0.55)', '#323135', 3],
    [bump, bumpSize, 'rgb(45,45,45)', 'rgb(70,70,70)', 'rgb(128,128,128)', 3],
  ]) {
    const fontPx = Math.max(6, Math.round(size / 158) * 0.78);
    ctx.font = `${fontPx}px SteleCuneiform`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const area of [front, back]) {
      drawTextBands(ctx, size, size, rng(seed + area.bands), { ...area, glyph, rule, erasedFill: erased, hasFont });
    }
  }
  return { cCol, cBump };
}

export async function buildStandInStele({ quality = 'high' } = {}) {
  const hasFont = await loadCuneiformFont();
  const colorSize = quality === 'high' ? 4096 : 2048;
  const bumpSize = 2048;
  const { cCol, cBump } = paintTextures(hasFont, colorSize, bumpSize);

  const map = new THREE.CanvasTexture(cCol);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bumpMap = new THREE.CanvasTexture(cBump);
  bumpMap.anisotropy = 4;

  const mat = new THREE.MeshStandardMaterial({
    map, bumpMap, bumpScale: 3.0, roughness: 0.72, metalness: 0.0,
  });
  const mesh = new THREE.Mesh(buildGeometry(), mat);
  mesh.name = 'stele';

  // flat bottom cap
  const cap = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48).rotateX(Math.PI / 2).scale(BASE_A, 1, BASE_B),
    new THREE.MeshStandardMaterial({ color: 0x1e1e20, roughness: 0.9 })
  );
  cap.position.y = 0.001;
  mesh.add(cap);
  return mesh;
}
