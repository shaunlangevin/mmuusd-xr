// The teacher console page (teacher.html) with a fake Firebase: sign-in, what it sends, and what it shows.
import { page, url, room, ok, eq, sleep } from './lib/helpers.mjs';

async function signedIn(user) {
  const p = await page({ mocks: true });
  if (user) await p.addInitScript((u) => { window.__mockUser = u; }, user);
  await p.goto(url('teacher.html'));
  await p.click('#signIn');
  if (!user || /^(shaun.langevin|mike.weber)@/.test(user.email)) await p.waitForSelector('#console:not([hidden])', { timeout: 10000 }).catch(() => {});
  await sleep(300);
  return p;
}
const last = (p) => p.evaluate(() => window.__fbmock.writes.at(-1));
// server timestamps become 'TS' so writes can be compared
const norm = (w) => JSON.parse(JSON.stringify(w, (k, v) => (v && v['.sv'] === 'timestamp' ? 'TS' : v)));

export default (test) => {
  test('the console stays off until Firebase is filled in', async () => {
    const p = await page();   // the console switched off (empty apiKey)
    await p.goto(url('teacher.html')); await sleep(500);
    ok(await p.isVisible('#notConfigured'), 'shows "Not set up yet"');
    ok(!(await p.isVisible('#signIn')), 'no sign-in button');
    eq(p.offsite, [], 'nothing loaded from other sites');
    await p.close();
  });

  test('only listed, verified teachers get the controls', async () => {
    let p = await signedIn({ email: 'student@mmuusd.org', emailVerified: true });
    ok(await p.isVisible('#signedOut') && !(await p.isVisible('#console')), 'a student account sees no controls');
    ok((await p.textContent('#signedOut p')).includes("isn't on the teacher list"), 'and is told why');
    await p.close();
    p = await signedIn();
    ok(await p.isVisible('#console'), 'Shaun sees the controls');
    eq(await p.evaluate(() => window.__authParams.hd), 'mmuusd.org', 'sign-in is limited to district accounts');
    eq(await p.inputValue('#room'), 'south', 'Shaun opens to the South End');
    eq(await p.$$eval('#headsets button', (b) => b.map((x) => +x.dataset.hs)), [0, 1, 2, 3, 4, 5], 'South End pause tiles');
    await p.close();
    p = await signedIn({ email: 'mike.weber@mmuusd.org', emailVerified: true });
    eq(await p.inputValue('#room'), 'north', 'Mike opens to the North End');
    eq(await p.$$eval('#supports .sup b', (b) => b.map((x) => +x.textContent)), [6, 7, 8, 9, 10, 11], 'North End support rows');
    await p.close();
  });

  test('every control sends the right setting', async () => {
    const p = await signedIn();
    const click = async (sel) => { await p.click(sel); await sleep(150); return norm(await last(p)); };
    eq(await click('#labSettings button[data-key="path"][data-val="\\"full\\""]'), ['update', 'rooms/south', { path: 'full', updatedAt: 'TS' }], 'Full investigation');
    ok(await p.isVisible('[data-row="start"]'), 'the start row appears for the full investigation');
    ok((await p.textContent('#toast')).includes('headsets start over'), 'the teacher is told headsets start over');
    eq(await click('#labSettings button[data-key="start"][data-val="\\"plan\\""]'), ['update', 'rooms/south', { start: 'plan', updatedAt: 'TS' }], 'start at Plan');
    eq(await click('#labSettings button[data-key="variable"][data-val="\\"powder\\""]'), ['update', 'rooms/south', { variable: 'powder', updatedAt: 'TS' }], 'variable');
    eq(await click('#labSettings button[data-size="life"]'), ['update', 'rooms/south', { sizes: 'desk,half', updatedAt: 'TS' }], 'turn off Life size');
    eq(await click('#labSettings button[data-size="desk"]'), ['update', 'rooms/south', { sizes: 'half', updatedAt: 'TS' }], 'turn off Desk');
    const n = await p.evaluate(() => window.__fbmock.writes.length);
    await p.click('#labSettings button[data-size="half"]'); await sleep(150);
    eq(await p.evaluate(() => window.__fbmock.writes.length), n, 'the last size can’t be turned off');
    eq(await click('#labSettings button[data-key="sizes"][data-val="null"]'), ['update', 'rooms/south', { sizes: null, updatedAt: 'TS' }], 'sizes back to Default');
    eq(await click('#supportSettings button[data-key="fireButton"][data-val="true"]'), ['update', 'rooms/south', { fireButton: true, updatedAt: 'TS' }], 'Fire button for everyone');
    eq(await click('[data-freeze="eyes"]'), ['update', 'rooms/south', { freeze: 'eyes', freezeAt: 'TS', updatedAt: 'TS' }], 'Eyes up');
    ok((await p.textContent('#strip')).includes('Frozen: Eyes up'), 'the strip shows the freeze');
    eq(await click('#unfreeze'), ['update', 'rooms/south', { freeze: 'none', freezeAt: 'TS', updatedAt: 'TS' }], 'Resume');
    eq(await click('#headsets button[data-hs="3"]'), ['update', 'rooms/south', { 'paused/h3': 'TS', updatedAt: 'TS' }], 'pause headset 3');
    eq(await click('#headsets button[data-hs="3"]'), ['update', 'rooms/south', { 'paused/h3': null, updatedAt: 'TS' }], 'resume headset 3');
    eq(await click('#supports [data-hs="2"][data-sup="s"]'), ['update', 'rooms/south', { 'access/h2': 's', updatedAt: 'TS' }], 'Spanish for headset 2');
    eq(await click('#supports [data-hs="2"][data-sup="b"]'), ['update', 'rooms/south', { 'access/h2': 'bs', updatedAt: 'TS' }], 'and bigger text');
    eq(await click('#clearSupports'), ['update', 'rooms/south', { 'access/h2': null, updatedAt: 'TS' }], 'clear supports');
    // Start over needs two taps
    const before = await p.evaluate(() => window.__fbmock.writes.length);
    await p.click('#restartAll'); await sleep(150);
    eq(await p.evaluate(() => window.__fbmock.writes.length), before, 'one tap sends nothing');
    eq(await p.textContent('#restartAll'), 'Tap again to start over', 'it asks for a second tap');
    eq(await click('#restartAll'), ['update', 'rooms/south', { restartAt: 'TS', updatedAt: 'TS' }], 'the second tap starts everyone over');
    ok((await p.textContent('#restartNote')).includes('just now'), 'says when');
    p.once('dialog', (d) => d.accept());
    eq(await click('#clear'), ['set', 'rooms/south', { updatedAt: 'TS' }], 'Reset everything');
    await p.close();
  });

  test('the console shows what the headsets are set to', async () => {
    const p = await signedIn();
    await room(p, 'south', { path: 'full', variable: 'wheels', sizes: 'half', lang: 'es', calm: true, paused: { h4: Date.now() }, access: { h1: 'nf' }, updatedAt: Date.now() });
    const strip = await p.textContent('#strip');
    for (const s of ['Full investigation', 'Variable: Wheels', 'Sizes: Half', 'Español', 'Paused: headset 4', 'Supports for everyone: Calm mode', 'Supports: headset 1 (123 Btn)']) ok(strip.includes(s), `strip shows "${s}"`);
    eq(await p.$$eval('#labSettings button.sel', (b) => b.map((x) => x.textContent)), ['Full investigation', 'Default (Try it)', 'Wheels', 'Half', 'Español'], 'selected settings');
    eq(await p.$$eval('#headsets button.sel', (b) => b.map((x) => +x.dataset.hs)), [4], 'paused tile');
    eq(await p.$$eval('#supports button.sel', (b) => b.map((x) => x.dataset.hs + x.dataset.sup)), ['1n', '1f'], 'support toggles');
    await p.click('#groupSeg button[data-room="north"]'); await sleep(300);
    eq(await p.inputValue('#room'), 'north', 'switch to the North End');
    ok(!(await p.textContent('#strip')).includes('Wheels'), 'the North End has its own settings');
    eq(p.errors, [], 'no page errors');
    await p.close();
  });
};
