// Shared helpers for the test files (server, browser pages, emulated headset controller).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // tests/
export const ROOT = path.resolve(HERE, '..');

export class Fail extends Error {}
export const ok = (cond, msg) => { if (!cond) throw new Fail(msg); };
export const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Fail(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
export const near = (a, b, tol, msg) => { if (!(Math.abs(a - b) <= tol)) throw new Fail(`${msg}: expected ${b} ± ${tol}, got ${a}`); };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── static file server for the repo ──
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
let server = null, PORT = 0;
export const requests = [];   // every URL the pages asked for (privacy check)
export function startServer() {
  return new Promise((res) => {
    server = http.createServer((req, rsp) => {
      requests.push(req.method + ' ' + req.url);
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

let browser = null;
function loadPlaywright() {
  for (const base of [path.join(ROOT, 'x.js'), path.join(process.cwd(), 'x.js'), path.join(execSync('npm root -g').toString().trim(), 'x.js')]) {
    try { return createRequire(base)('playwright').chromium; } catch { /* next */ }
  }
  throw new Error('Playwright not found. Install it with: npm i -g playwright && npx playwright install chromium');
}
// opts: { xr: false (IWER Quest 3 emulator), mocks: false (fake Firebase), xrInit, viewport }
export async function page(opts = {}) {
  if (!browser) browser = await loadPlaywright().launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await browser.newPage({ viewport: opts.viewport || { width: 1100, height: 800 } });
  p.errors = []; p.offsite = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('request', (r) => { if (!r.url().startsWith(url()) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) p.offsite.push(r.url()); });
  if (opts.mocks) {   // a fake Firebase and a filled-in config (the real config can stay empty)
    await p.route('**/vendor/firebase/fb-db.js', (r) => r.fulfill({ path: path.join(HERE, 'lib/fb-db.js'), contentType: 'text/javascript' }));
    await p.route('**/vendor/firebase/fb-auth.js', (r) => r.fulfill({ path: path.join(HERE, 'lib/fb-auth.js'), contentType: 'text/javascript' }));
    await p.route('**/js/firebase-config.js', (r) => r.fulfill({ path: path.join(HERE, 'lib/firebase-config.js'), contentType: 'text/javascript' }));
  }
  if (opts.xr) {
    await p.addInitScript({ content: fs.readFileSync(path.join(HERE, 'lib', 'iwer.min.js'), 'utf8') });
    await p.addInitScript({ content: 'const d = new IWER.XRDevice(IWER.metaQuest3); d.installRuntime({ forceInstall: true }); window.__xr = d;' + (opts.xrInit || '') });
  }
  return p;
}
export async function ready(p, q = '') {
  await p.goto(url(q));
  await p.waitForFunction(() => window.__labReady, null, { timeout: 120000 });
}
export const st = (p) => p.evaluate(() => window.__dbg.state());
export const idle = (p) => p.waitForFunction(() => !window.__dbg.state().anim, null, { timeout: 240000 });
export const replayEnd = (p) => p.waitForFunction(() => { const a = window.__dbg.state().anim; return !a || !a.playing; }, null, { timeout: 240000 });
// press a panel button the way the code does (preview tests)
export const press = (p, id) => p.evaluate((id) => window.__dbg.press(id), id);
// headset controller: aim the right controller from a point at a point, pull the trigger
export const CP = [0.2, 1.2, -0.15];
export async function aim(p, from, to) {
  await p.evaluate(([from, to]) => {
    const { THREE } = window.__dbg, c = window.__xr.controllers.right; c.position.set(...from);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(...from), new THREE.Vector3(...to), new THREE.Vector3(0, 1, 0)));
    c.quaternion.set(q.x, q.y, q.z, q.w);
  }, [from, to]);
  await sleep(600);   // the emulator renders only a few frames a second: let at least one frame see the new aim
}
export const setTrigger = async (p, v) => { await p.evaluate((v) => window.__xr.controllers.right.updateButtonValue('trigger', v), v); await sleep(300); };
export async function trigger(p) { await setTrigger(p, 1); await setTrigger(p, 0); }
export async function tap(p, id) {   // point the controller at a panel button and pull the trigger
  const at = await p.evaluate((id) => window.__dbg.panel.buttonWorld(id)?.toArray(), id);
  ok(at, `the panel has no "${id}" button`);
  await aim(p, CP, at); await trigger(p);
}
// the teacher console's room record, as a headset or the teacher page would receive it
export async function room(p, name, rec) {
  await p.waitForFunction((n) => window.__fbmock && window.__fbmock.subs['rooms/' + n], name, { timeout: 20000 });
  await p.evaluate(([n, v]) => window.__fbmock.set('rooms/' + n, v), [name, rec]);
  await sleep(150);
}
export const pageErrors = (p) => p.errors.filter((e) => !/AbortError|play\(\) request/i.test(e));
export async function closeAll() { if (browser) await browser.close(); if (server) server.close(); }
