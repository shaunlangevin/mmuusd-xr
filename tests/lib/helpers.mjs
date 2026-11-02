// Shared helpers for the test files (server, browser pages, fake console, controller).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // tests/
export const ROOT = path.resolve(HERE, '..');

// ── tiny assertion helpers ──
export class Fail extends Error {}
export const ok = (cond, msg) => { if (!cond) throw new Fail(msg); };
export const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Fail(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
export const near = (a, b, tol, msg) => { if (!(Math.abs(a - b) <= tol)) throw new Fail(`${msg}: expected ${b} ± ${tol}, got ${a}`); };
export const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── static file server for the repo ──
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.usdz': 'model/vnd.usdz+zip', '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
let server = null, PORT = 0;
export function startServer() {
  return new Promise((res) => {
    server = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end(); }
      fs.stat(p, (e, st) => {
        const f = !e && st.isDirectory() ? path.join(p, 'index.html') : p;
        fs.readFile(f, (err, data) => {
          if (err) { rsp.writeHead(404); return rsp.end(); }
          rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
          rsp.end(req.method === 'HEAD' ? undefined : data);
        });
      });
    }).listen(0, '127.0.0.1', () => { PORT = server.address().port; res(); });
  });
}
export const url = (q = '') => `http://127.0.0.1:${PORT}/${q}`;

// ── browser helpers ──
let chromium = null, browser = null;
function loadPlaywright() {
  for (const base of [path.join(ROOT, 'x.js'), path.join(process.cwd(), 'x.js'), path.join(execSync('npm root -g').toString().trim(), 'x.js')]) {
    try { return createRequire(base)('playwright').chromium; } catch { /* next */ }
  }
  throw new Error('Playwright not found. Install it with: npm i -g playwright && npx playwright install chromium');
}
const LIB = (f) => fs.readFileSync(path.join(HERE, 'lib', f), 'utf8');
// opts: { mocks: true (fake Firebase), xr: false (IWER headset emulator), speech: false (fake voices), init: '' (extra script), viewport }
export async function page(opts = {}) {
  if (!browser) { chromium = chromium || loadPlaywright(); browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] }); }
  const p = await browser.newPage({ viewport: opts.viewport || { width: 1100, height: 800 } });
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  if (opts.mocks !== false) {
    await p.route('**/vendor/firebase/fb-db.js', (r) => r.fulfill({ path: path.join(HERE, 'lib/fb-db.js'), contentType: 'text/javascript' }));
    await p.route('**/vendor/firebase/fb-auth.js', (r) => r.fulfill({ path: path.join(HERE, 'lib/fb-auth.js'), contentType: 'text/javascript' }));
    await p.route('**/js/firebase-config.js', (r) => r.fulfill({ path: path.join(HERE, 'lib/firebase-config.js'), contentType: 'text/javascript' }));
  }
  if (opts.speech) await p.addInitScript({ content: LIB('speechmock.js') });
  if (opts.xr) {
    await p.addInitScript({ content: LIB('iwer.min.js') });
    await p.addInitScript({ content: 'const d = new IWER.XRDevice(IWER.metaQuest3); d.installRuntime({ forceInstall: true }); window.__xr = d;' + (opts.xrInit || '') });
  }
  if (opts.init) await p.addInitScript({ content: opts.init });
  return p;
}
export async function ready(p, q) {
  await p.goto(url(q));
  await p.waitForFunction(() => window.__steleReady, null, { timeout: 120000 });
}
// the fake teacher console: write a room record the way the real one would
export function room(p, name) {
  let rec = { updatedAt: Date.now() };
  return async (patch = {}, wait = 700) => {
    rec = { ...rec, ...patch, updatedAt: Date.now() };
    for (const k of Object.keys(rec)) if (rec[k] === null) delete rec[k];
    await p.waitForFunction((n) => window.__fbmock && window.__fbmock.subs['rooms/' + n], name, { timeout: 20000 });
    await p.evaluate(([n, v]) => window.__fbmock.set('rooms/' + n, v), [name, rec]);
    await sleep(wait);
  };
}
// headset controller: aim the right controller at a point and pull the trigger
export async function aim(p, from, to) {
  await p.evaluate(([from, to]) => {
    const { THREE } = window.__dbg, c = window.__xr.controllers.right; c.position.set(...from);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(...from), new THREE.Vector3(...to), new THREE.Vector3(0, 1, 0)));
    c.quaternion.set(q.x, q.y, q.z, q.w);
  }, [from, to]);
  await sleep(250);
}
export async function trigger(p) {
  await p.evaluate(() => window.__xr.controllers.right.updateButtonValue('trigger', 1)); await sleep(150);
  await p.evaluate(() => window.__xr.controllers.right.updateButtonValue('trigger', 0)); await sleep(250);
}
export const pageErrors = (p) => p.errors.filter((e) => !/AbortError|play\(\) request/i.test(e));

export async function closeAll() { if (browser) await browser.close(); if (server) server.close(); }
