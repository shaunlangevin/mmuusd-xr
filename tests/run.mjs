// Automated checks for MMUUSD Labs.  Run from the repo folder:
//   node tests/run.mjs              (everything, about 10–15 minutes)
//   node tests/run.mjs static rules (only test files whose name matches)
//   node tests/run.mjs --grep tour  (only tests whose title contains "tour")
// Needs Node 18+ and Playwright with Chromium (npm i -g playwright && npx playwright install chromium).
// Nothing here is used by the website itself; GitHub Pages just serves these files like any other.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer, closeAll, Fail } from './lib/helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const grepAt = args.indexOf('--grep');
const GREP = grepAt >= 0 ? args[grepAt + 1].toLowerCase() : null;
const FILES = args.filter((a, i) => !a.startsWith('--') && !(grepAt >= 0 && i === grepAt + 1));

// ── runner ──
const tests = [];
const register = (file) => (title, fn, { slow = false } = {}) => tests.push({ file, title, fn, slow });
const files = fs.readdirSync(HERE).filter((f) => f.endsWith('.test.mjs')).sort()
  .filter((f) => !FILES.length || FILES.some((x) => f.includes(x)));
await startServer();
for (const f of files) (await import(pathToFileURL(path.join(HERE, f)).href)).default(register(f.replace('.test.mjs', '')));
const run = tests.filter((t) => !GREP || t.title.toLowerCase().includes(GREP));
let pass = 0, fail = 0; const failures = [];
const t0 = Date.now();
for (const t of run) {
  const s = Date.now();
  try { await t.fn(); pass++; console.log(`  ✓ ${t.file}: ${t.title} (${((Date.now() - s) / 1000).toFixed(1)} s)`); }
  catch (e) { fail++; failures.push([t, e]); console.log(`  ✗ ${t.file}: ${t.title}\n      ${e instanceof Fail ? e.message : e.stack}`); }
}
await closeAll();
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
if (fail) { console.log('\nFailed:'); failures.forEach(([t, e]) => console.log(`  - ${t.file}: ${t.title}: ${e.message.split('\n')[0]}`)); }
process.exit(fail ? 1 : 0);
