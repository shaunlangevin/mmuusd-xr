// Checks that need no browser: content files, translations, file sizes, privacy guards.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, ok, eq, readJSON } from './lib/helpers.mjs';

const MB = 1024 * 1024;
const both = (o) => o && typeof o.en === 'string' && o.en.trim() && typeof o.es === 'string' && o.es.trim();
const words = (s) => String(s).trim().split(/\s+/).length;

export default (test) => {
  const index = readJSON('exhibits/index.json');
  const ids = (index.exhibits || []).map((e) => e.id);

  test('index.json: kits point at real artifacts', () => {
    ok(Array.isArray(index.kits) && index.kits.length, 'no kits');
    ok(index.kits.some((k) => k.id === index.defaultKit), `defaultKit "${index.defaultKit}" is not a kit`);
    for (const k of index.kits) {
      ok(/^[a-z0-9-]{1,32}$/.test(k.id), `kit id "${k.id}" must be lowercase letters, numbers, dashes`);
      ok(both(k.title), `kit ${k.id}: title needs en and es`);
      ok(k.exhibits.length >= 1 && k.exhibits.length <= 6, `kit ${k.id}: keep kits to 1–6 artifacts (has ${k.exhibits.length})`);
      for (const id of k.exhibits) ok(ids.includes(id), `kit ${k.id} lists "${id}", which is not in exhibits[]`);
    }
    for (const e of index.exhibits) {
      ok(/^[a-z0-9-]{1,32}$/.test(e.id), `exhibit id "${e.id}" is not a valid folder name`);
      ok(both(e.title), `exhibit ${e.id}: title needs en and es`);
      ok(fs.existsSync(path.join(ROOT, 'exhibits', e.id, 'exhibit.json')), `exhibits/${e.id}/exhibit.json is missing`);
      ok(index.kits.some((k) => k.exhibits.includes(e.id)), `exhibit ${e.id} is not in any kit (students could never reach it)`);
    }
    ok(ids.includes(index.default), `default "${index.default}" is not an exhibit`);
  });

  for (const id of ids) {
    test(`content: ${id}`, () => {
      const dir = path.join(ROOT, 'exhibits', id), ex = readJSON(`exhibits/${id}/exhibit.json`), problems = [];
      const need = (cond, msg) => { if (!cond) problems.push(msg); };
      need(ex.id === id, `"id" should be "${id}"`);
      need(both(ex.title) && both(ex.subtitle), 'title and subtitle need en and es');
      const m = ex.model || {};
      need(typeof m.heightMeters === 'number' && m.heightMeters > 0.05 && m.heightMeters < 10, 'model.heightMeters must be the real height in metres');
      need(both(m.credit), 'model.credit (license credit) needs en and es');
      const file = m.file && path.join(dir, m.file);
      need(file && fs.existsSync(file), `model file ${m.file} is missing`);
      if (file && fs.existsSync(file)) need(fs.statSync(file).size < 25 * MB, `${m.file} is over GitHub's 25 MB upload limit`);
      if (ex.usdz) { const u = path.join(dir, ex.usdz); need(fs.existsSync(u), `${ex.usdz} is missing`); if (fs.existsSync(u)) need(fs.statSync(u).size < 25 * MB, `${ex.usdz} is over 25 MB`); }
      need(ex.finish && both(ex.finish.title) && both(ex.finish.text) && both(ex.finish.think), 'finish needs title, text and think in en and es');
      const dots = ex.dots || [];
      need(dots.length >= 4 && dots.length <= 20, `has ${dots.length} dots (4–20 allowed; the console handles up to 20)`);
      const seen = new Set();
      dots.forEach((d, i) => {
        const n = `dot ${i + 1} (${d.id})`;
        need(d.id && !seen.has(d.id), `${n}: id missing or repeated`); seen.add(d.id);
        need(typeof d.h === 'number' && d.h >= 0 && d.h <= 1, `${n}: h must be 0–1`);
        need(typeof d.angle === 'number' && Math.abs(d.angle) <= 360, `${n}: angle must be in degrees`);
        if (d.x !== undefined) need(typeof d.x === 'number' && Math.abs(d.x) < 1, `${n}: x is a sideways shift in metres (under 1)`);
        for (const k of ['title', 'text', 'think', 'notice', 'clue']) need(both(d[k]), `${n}: "${k}" needs en and es`);
        for (const lang of ['en', 'es']) if (d.text?.[lang]) need(words(d.text[lang]) <= 95, `${n}: ${lang} text is ${words(d.text[lang])} words (keep it under about 90)`);
        (d.facts || []).forEach((f, j) => need(both(f.k) && both(f.v), `${n}: fact ${j + 1} needs en and es`));
        if (d.law) { need(both(d.law.plain), `${n}: law.plain needs en and es`); if (d.law.original) need(both(d.law.original) && both(d.law.source) && both(ex.lawCredit), `${n}: a quote needs en and es wording, law.source and the exhibit's lawCredit`); }
        if (d.more) need(both(d.more), `${n}: more needs en and es`);
        if (d.extra) need(['height', 'map', 'signs'].includes(d.extra), `${n}: extra "${d.extra}" isn't built (height, map or signs)`);
      });
      for (const lang of ['en', 'es']) {
        const a = path.join(dir, 'audio', lang);
        if (!fs.existsSync(a)) continue;
        const allowed = new Set([...dots.flatMap((_, i) => ['', '-notice', '-more'].map((k) => String(i + 1).padStart(2, '0') + k + '.mp3')), 'finish.mp3']);
        for (const f of fs.readdirSync(a)) if (f.endsWith('.mp3')) need(allowed.has(f), `audio/${lang}/${f}: name it 01.mp3 … ${String(dots.length).padStart(2, '0')}.mp3, 01-notice.mp3 …, 01-more.mp3 …, or finish.mp3`);
      }
      ok(!problems.length, problems.join('\n      '));
    });
  }

  test('translations: English and Spanish have the same words', async () => {
    const { UI } = await import(pathToFileURL(path.join(ROOT, 'js/i18n.js')).href);
    const en = Object.keys(UI.en), es = Object.keys(UI.es);
    eq(en.filter((k) => !es.includes(k)), [], 'missing in Spanish');
    eq(es.filter((k) => !en.includes(k)), [], 'missing in English');
    for (const k of en) ok(typeof UI.en[k] === typeof UI.es[k], `"${k}" is a ${typeof UI.en[k]} in English but a ${typeof UI.es[k]} in Spanish`);
  });

  test('all JavaScript parses', () => {
    for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter((x) => x.endsWith('.js'))) {
      try { execFileSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(path.join(ROOT, 'js', f)) , stdio: ['pipe', 'pipe', 'pipe'] }); }
      catch (e) { ok(false, `js/${f}: ${e.stderr.toString().split('\n').slice(0, 4).join(' ')}`); }
    }
  });

  test('privacy: no outside scripts, trackers or CDNs', () => {
    const files = ['index.html', 'teacher.html', ...fs.readdirSync(path.join(ROOT, 'js')).map((f) => 'js/' + f)];
    const bad = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (/google-analytics|googletagmanager|gtag\(|facebook\.net|hotjar|segment\.io|mixpanel/i.test(src)) bad.push(`${f}: tracking code`);
      for (const m of src.matchAll(/<script[^>]+src=["'](https?:)?\/\//gi)) bad.push(`${f}: script from another site (${m[0]})`);
      for (const m of src.matchAll(/import\s*\(?\s*['"]https?:\/\//g)) bad.push(`${f}: imports code from the internet`);
      if (/getUserMedia|mediaDevices|navigator\.geolocation|camera-access/.test(src)) bad.push(`${f}: camera, microphone or location access`);
    }
    // headsets must never write to the database
    const cls = fs.readFileSync(path.join(ROOT, 'js/classroom.js'), 'utf8');
    if (/\bfb\.(set|update|push|remove|runTransaction)\s*\(/.test(cls)) bad.push('js/classroom.js: headsets must only read (found a database write)');
    if (/signIn|getAuth/.test(cls)) bad.push('js/classroom.js: headsets must not sign in');
    ok(!bad.length, bad.join('\n      '));
  });

  test('browser storage: only the documented keys', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    const keys = [...src.matchAll(/localStorage\.(?:setItem|getItem|removeItem)\(([^,)]+)/g)].map((m) => m[1].trim());
    const allowed = ['HEADSET_KEY', 'spotKey(', 'key'];   // key = spotKey() saved earlier (xr-spot:<exhibit>:<size>)
    eq([...new Set(keys)].filter((k) => !allowed.includes(k)), [], 'undocumented localStorage keys (add them to firebase/PRIVACY.md first)');
    ok(/const HEADSET_KEY = 'xr-headset'/.test(src), 'headset key renamed: update PRIVACY.md');
    ok(/const spotKey = \(\) => \(EX \? `xr-spot:\$\{EX\.id\}:\$\{S\.size\}`/.test(src), 'saved-spot key changed: update PRIVACY.md');
  });
};
