// The teacher console (teacher.html) against the fake database: what each button sends.
import { ok, eq, page, url, sleep, pageErrors } from './lib/helpers.mjs';

async function signedIn(user) {
  const p = await page({ viewport: { width: 1200, height: 1000 }, init: user ? `window.__mockUser = ${JSON.stringify(user)};` : '' });
  await p.goto(url('teacher.html')); await sleep(400);
  await p.click('#signIn'); await sleep(900);
  return p;
}
const last = (p) => p.evaluate(() => { const w = window.__fbmock.writes.at(-1); if (!w) return null; const v = { ...w[2] }; delete v.updatedAt; return [w[1], v]; });
const norm = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x && x['.sv'] ? 'TS' : x)));

export default (test) => {
  test('sign-in: only listed teachers get the controls', async () => {
    const p = await signedIn({ email: 'student@mmuusd.org', emailVerified: true });
    ok(await p.isVisible('#signedOut'), 'others see the sign-in page'); ok(!(await p.isVisible('#setup')), 'no controls');
    ok((await p.textContent('#signedOut p')).includes("isn't on the teacher list"), 'explains why');
    await p.close();
    const m = await signedIn({ email: 'mike.weber@mmuusd.org', emailVerified: true });
    ok(await m.isVisible('#setup'), 'Mike gets the console'); ok((await m.textContent('#toast')).includes('North End'), 'Mike opens to North End');
    await m.close();
  });

  test('Set up tab: presets, settings with Default, kits', async () => {
    const p = await signedIn();
    ok(await p.isVisible('#setup') && !(await p.isVisible('#teach')), 'Set up is the first tab');
    await p.click('#presets button:nth-child(2)'); await sleep(300);
    eq(norm(await last(p)), ['rooms/south', { notice: true, moveStone: false, lock: true, practice: false, detective: false }], 'Guided tour preset');
    await p.click('#settings button[data-key="lang"][data-val="\\"es\\""]'); await sleep(200);
    eq(norm(await last(p)), ['rooms/south', { lang: 'es' }], 'Language: Español');
    await p.click('#settings button[data-key="lang"][data-val="null"]'); await sleep(200);
    eq(norm(await last(p)), ['rooms/south', { lang: null }], 'Language: Default');
    await p.click('#settings button[data-key="calm"][data-val="true"]'); await sleep(200);
    eq(norm(await last(p)), ['rooms/south', { calm: true }], 'Calm mode for everyone');
    const kits = await p.$$eval('#kitSeg button', (b) => b.map((x) => x.textContent));
    ok(kits.includes('Grade 5 · Egypt') && kits.includes('Grade 5 · Mesopotamia'), 'both kits listed');
    await p.click('#kitSeg button:nth-child(2)'); await sleep(400);
    eq(norm(await last(p)), ['rooms/south', { kit: 'g5-egypt', exhibit: null, tour: false, tourAt: 'TS' }], 'changing kit ends any tour');
    eq(await p.$$eval('#artSeg button', (b) => b.map((x) => x.textContent)), ['The Rosetta Stone'], 'artifact list follows the kit');
    eq(pageErrors(p), [], 'page errors');
    await p.close();
  });

  test('Teach tab: freeze, tour, reveal, narration, pause, supports', async () => {
    const p = await signedIn();
    await p.click('#tabTeach'); await sleep(300);
    await p.click('[data-freeze="eyes"]'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { freeze: 'eyes', freezeAt: 'TS' }], 'Eyes up');
    await p.click('#unfreeze'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { freeze: 'none', freezeAt: 'TS' }], 'Resume');
    await p.click('#tourStart'); await sleep(300); eq(norm(await last(p)), ['rooms/south', { tour: true, tourDot: 1, tourAt: 'TS' }], 'Start tour');
    ok(await p.isVisible('#tourReveal'), 'Reveal reading shows during a tour (Notice first is on by default)');
    await p.click('#tourReveal'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { reveal: 1, revealAt: 'TS' }], 'Reveal');
    await p.click('#tourNext'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { tour: true, tourDot: 2, tourAt: 'TS' }], 'Next step');
    await p.click('#narrate'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { narrate: 2, narrateAt: 'TS' }], 'Play narration');
    await p.click('#tourEnd'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { tour: false, tourAt: 'TS' }], 'End tour');
    await p.click('#headsets button[data-hs="4"]'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { 'paused/h4': 'TS' }], 'Pause headset 4');
    await p.click('#headsets button[data-hs="4"]'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { 'paused/h4': null }], 'Resume headset 4');
    await p.click('#supports button[data-hs="1"][data-sup="b"]'); await sleep(200);
    await p.click('#supports button[data-hs="1"][data-sup="c"]'); await sleep(200);
    eq(norm(await last(p)), ['rooms/south', { 'access/h1': 'bc' }], 'Bigger text + Calm for headset 1');
    ok((await p.textContent('#strip')).includes('headset 1 (A+ Calm)'), 'status strip lists supports');
    await p.click('#clearSupports'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { 'access/h1': null }], 'Clear all supports');
    await p.close();
  });

  test('North End shows headsets 6–11', async () => {
    const p = await signedIn();
    await p.click('#groupSeg button[data-room="north"]'); await sleep(300);
    eq(await p.$$eval('#headsets button', (b) => b.map((x) => +x.dataset.hs)), [6, 7, 8, 9, 10, 11], 'pause tiles');
    eq(await p.$$eval('#supports .sup b', (b) => b.map((x) => +x.textContent)), [6, 7, 8, 9, 10, 11], 'support rows');
    await p.close();
  });
};
