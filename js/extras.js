// Extra pictures some dots show: a simple map and a few cuneiform signs.
import { UI, SIGN_CHARS } from './i18n.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

// Simplified geography (latitude, longitude)
const EUPHRATES = [[38.9, 38.4], [37.0, 38.2], [35.95, 39.0], [35.33, 40.14], [34.37, 41.1], [34.13, 42.38],
  [33.42, 43.3], [33.35, 43.78], [32.54, 44.42], [31.98, 44.9], [31.31, 45.28], [31.05, 46.26], [31.0, 47.43]];
const TIGRIS = [[37.9, 40.2], [37.3, 42.3], [36.34, 43.13], [35.5, 43.25], [34.6, 43.68], [34.2, 43.87],
  [33.31, 44.36], [32.5, 45.83], [31.84, 47.15], [31.0, 47.43], [30.5, 47.8], [29.95, 48.55]];
const BORDER = [[37.15, 44.8], [36.0, 45.5], [35.1, 45.9], [34.6, 45.6], [33.9, 45.8], [33.3, 46.2],
  [32.6, 47.0], [32.0, 47.6], [31.0, 47.7], [30.4, 48.0], [29.95, 48.55]];
const GULF = [[29.95, 48.55], [30.05, 49.2], [29.8, 49.9], [29.2, 50.4], [28.4, 50.9], [27.9, 51.2],
  [27.9, 48.7], [28.6, 48.4], [29.35, 48.05], [29.75, 48.1]];
const CITIES = [
  { k: 'babylon', p: [32.54, 44.42], main: true, dx: -14, align: 'right' },
  { k: 'baghdad', p: [33.31, 44.36], dx: -14, align: 'right' },
  { k: 'susa', p: [32.19, 48.26], main: true, dx: 14, align: 'left' },
];

export function drawMap(canvas, lang) {
  const t = UI[lang] || UI.en, M = t.map;
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const lon0 = 38.2, lon1 = 51.3, lat0 = 27.8, lat1 = 38.2;
  const kx = Math.cos((33 * Math.PI) / 180);
  const sx = W / ((lon1 - lon0) * kx), sy = H / (lat1 - lat0), s = Math.min(sx, sy);
  const ox = (W - (lon1 - lon0) * kx * s) / 2, oy = (H - (lat1 - lat0) * s) / 2;
  const P = ([lat, lon]) => [ox + (lon - lon0) * kx * s, oy + (lat1 - lat) * s];
  const path = (pts) => { ctx.beginPath(); pts.forEach((q, i) => { const [x, y] = P(q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };

  ctx.fillStyle = '#e9dcc0'; ctx.fillRect(0, 0, W, H);                   // land
  ctx.fillStyle = '#7fb2cf'; path(GULF); ctx.closePath(); ctx.fill();      // gulf
  // Iran side tint
  ctx.fillStyle = 'rgba(160,120,80,0.12)';
  path([...BORDER, [27.8, 51.3], [38.2, 51.3], [38.2, 44.8]]); ctx.closePath(); ctx.fill();
  // border
  ctx.setLineDash([10, 8]); ctx.strokeStyle = '#8a6d4b'; ctx.lineWidth = 3; path(BORDER); ctx.stroke(); ctx.setLineDash([]);
  // rivers
  ctx.strokeStyle = '#2f79a8'; ctx.lineWidth = 7; ctx.lineJoin = ctx.lineCap = 'round';
  path(EUPHRATES); ctx.stroke(); path(TIGRIS); ctx.stroke();
  // labels
  const label = (txt, x, y, size, color, weight = 700, align = 'center', italic = false) => {
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(233,220,192,0.9)'; ctx.strokeText(txt, x, y);
    ctx.fillStyle = color; ctx.fillText(txt, x, y);
  };
  const u = W / 1000;
  let [x, y] = P([35.0, 41.2]); label(M.euphrates, x, y, 34 * u, '#1f5f88', 700, 'center', true);
  [x, y] = P([35.6, 44.2]); label(M.tigris, x, y, 34 * u, '#1f5f88', 700, 'center', true);
  [x, y] = P([31.0, 42.4]); label(M.iraq, x, y, 40 * u, '#5b4630', 800);
  [x, y] = P([34.4, 48.6]); label(M.iran, x, y, 40 * u, '#5b4630', 800);
  [x, y] = P([28.9, 49.4]); label(M.gulf, x, y, 30 * u, '#1d4f6e', 700, 'center', true);
  for (const c of CITIES) {
    [x, y] = P(c.p);
    ctx.beginPath(); ctx.arc(x, y, (c.main ? 13 : 9) * u, 0, Math.PI * 2);
    ctx.fillStyle = c.main ? '#b3261e' : '#555'; ctx.fill(); ctx.lineWidth = 4 * u; ctx.strokeStyle = '#fff'; ctx.stroke();
    label(M[c.k], x + c.dx * u * 1.6, y, (c.main ? 38 : 28) * u, c.main ? '#7a1c16' : '#444', c.main ? 800 : 600, c.align);
  }
  ctx.font = `500 ${24 * u}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#6b5a45';
  ctx.fillText(t.mapNote, 16 * u, H - 12 * u);
}

export function drawSigns(canvas, lang, hasFont) {
  const t = UI[lang] || UI.en;
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#e9dcc0'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#5b4630'; ctx.font = `800 ${H * 0.085}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(t.signsTitle, W / 2, H * 0.05);
  const n = SIGN_CHARS.length;
  for (let i = 0; i < n; i++) {
    const cx = W * (i + 0.5) / n, cy = H * 0.5;
    ctx.fillStyle = '#2b2a2c';
    ctx.font = `${H * 0.34}px SteleCuneiform, serif`; ctx.textBaseline = 'middle';
    if (hasFont) ctx.fillText(SIGN_CHARS[i], cx, cy);
    ctx.fillStyle = '#1a1612'; ctx.font = `800 ${H * 0.085}px ${FONT}`; ctx.textBaseline = 'top';
    ctx.fillText(t.signs[i][0], cx, H * 0.76);
    ctx.fillStyle = '#6b5a45'; ctx.font = `500 ${H * 0.06}px ${FONT}`;
    ctx.fillText(t.signs[i][1], cx, H * 0.87);
  }
}

export async function loadCuneiformFont() {
  try {
    const face = new FontFace('SteleCuneiform', 'url(fonts/NotoSansCuneiform.woff2)');
    await face.load(); document.fonts.add(face); return true;
  } catch (e) { return false; }
}
