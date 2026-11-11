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
    eq(norm(await last(p)), ['rooms/south', { kit: 'g5-egypt', exhibit: null, tour: false, tourAt: 'TS', selfTourAt: null, stops: null }], 'changing kit ends any tour and clears the stops');
    eq(await p.$$eval('#artSeg button', (b) => b.map((x) => x.textContent)), ['The Rosetta Stone'], 'artifact list follows the kit');
    eq(pageErrors(p), [], 'page errors');
    await p.close();
  });

  test('Teach tab: freeze, tour, reveal, narration, pause, supports', async () => {
    const p = await signedIn();
    await p.click('#tabTeach'); await sleep(300);
    await p.click('[data-freeze="eyes"]'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { freeze: 'eyes', freezeAt: 'TS' }], 'Eyes up');
    await p.click('#unfreeze'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { freeze: 'none', freezeAt: 'TS' }], 'Resume');
    await p.click('#tourStart'); await sleep(300); eq(norm(await last(p)), ['rooms/south', { tour: true, tourDot: 1, tourAt: 'TS', selfTourAt: null, stops: '1,2,5' }], 'Start tour (Highlights by default)');
    ok(await p.isVisible('#tourReveal'), 'Reveal reading shows during a tour (Notice first is on by default)');
    await p.click('#tourReveal'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { reveal: 1, revealAt: 'TS' }], 'Reveal');
    await p.click('#tourNext'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { tour: true, tourDot: 2, tourAt: 'TS' }], 'Next step');
    ok(await p.isVisible('#script'), 'the script shows for the current step');
    ok((await p.textContent('#txtMain')).length > 40, 'with the reading text');
    await p.click('#narrate'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { narrate: 2, narrateKind: 'main', narrateAt: 'TS' }], 'Play narration');
    await p.click('#playNotice'); await sleep(200); eq(norm(await last(p)), ['rooms/south', { narrate: 2, narrateKind: 'notice', narrateAt: 'TS' }], 'Play prompt');
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

  test('Teach tab script: prompt, reading, Tell me more, language and recordings', async () => {
    const p = await signedIn();
    await p.click('#tabTeach'); await sleep(300);
    ok(await p.isVisible('#scriptEmpty'), 'empty until a step or dot is chosen');
    await p.click('#tourStart'); await sleep(300);
    await p.click('#dots button[data-dot="2"]'); await sleep(800);
    eq(await p.textContent('#scriptTitle'), 'Dot 2: Rivers, farms and rules ★', 'title (★ = curriculum link)');
    ok((await p.textContent('#txtNotice')).startsWith("You can't read this writing yet"), 'prompt text');
    eq(await p.textContent('#tagNotice'), 'Students see this now', 'before Reveal, the prompt is what students see');
    ok((await p.textContent('#txtMain')).includes('Think about it:'), 'Think about it is shown');
    ok((await p.textContent('#txtMore')).includes('Law 48'), 'Tell me more text');
    ok(!(await p.$eval('#playNotice', (b) => b.disabled)) && !(await p.$eval('#playMore', (b) => b.disabled)), 'recordings exist, so the buttons work');
    await p.click('#tourReveal'); await sleep(300);
    eq(await p.textContent('#tagMain'), 'Students see this now', 'after Reveal, the reading is');
    await p.click('[data-sl="es"]'); await sleep(200);
    ok((await p.textContent('#scriptTitle')).includes('Ríos, granjas y reglas'), 'Spanish view');
    ok((await p.textContent('#scriptNote')).includes('Headsets are in English'), 'says the headsets are in English');
    await p.click('#partMore summary'); await sleep(100);
    await p.click('#playMore'); await sleep(200);
    eq(norm(await last(p)), ['rooms/south', { narrate: 2, narrateKind: 'more', narrateAt: 'TS' }], 'Play Tell me more');
    await p.click('#settings button[data-key="autoPlay"][data-val="true"]').catch(() => {});
    await p.close();
  });

  test('Tour stops: Highlights, All, Custom; teacher-led and self-guided', async () => {
    const p = await signedIn();
    await p.click('#tabTeach'); await sleep(300);
    eq(await p.$$eval('#dots button.core', (b) => b.map((x) => +x.dataset.dot)), [2, 5], 'Hammurabi stars dots 2 and 5');
    eq(await p.textContent('#stopsHl'), '★ Highlights (1 → 2 → 5)', 'Highlights names its stops');
    ok(await p.$eval('#stopsHl', (b) => b.classList.contains('sel')), 'Highlights is the default');
    ok((await p.textContent('#coreInfo')).includes('D2.Geo.4.3-5'), 'curriculum links listed');
    // teacher-led
    await p.click('#tourStart'); await sleep(300);
    eq(norm(await last(p)), ['rooms/south', { tour: true, tourDot: 1, tourAt: 'TS', selfTourAt: null, stops: '1,2,5' }], 'teacher-led tour sends its stops');
    eq(await p.textContent('#tourCount'), 'STEP 1 OF 3 · HIGHLIGHTS', 'step count follows the stops');
    ok((await p.textContent('#scriptLink')).startsWith('Opener'), 'dot 1 is labelled the opener');
    await p.click('#tourNext'); await sleep(300);
    eq(norm(await last(p)), ['rooms/south', { tour: true, tourDot: 2, tourAt: 'TS' }], 'next: dot 2');
    ok((await p.textContent('#scriptLink')).includes('D2.Geo.4.3-5'), 'script shows the curriculum link');
    await p.click('#tourNext'); await sleep(300);
    eq(norm(await last(p)), ['rooms/south', { tour: true, tourDot: 5, tourAt: 'TS' }], 'next skips to dot 5');
    ok(await p.$eval('#tourNext', (b) => b.disabled), 'no step after the last stop');
    await p.click('#tourReveal'); await sleep(300);
    ok((await p.textContent('#tourNote')).includes('Last stop'), 'says it is the last stop');
    await p.click('#tourPrev'); await sleep(300);
    eq(norm(await last(p)), ['rooms/south', { tour: true, tourDot: 2, tourAt: 'TS' }], 'back: dot 2');
    await p.click('[data-stops="all"]'); await sleep(300);
    eq(norm(await last(p)), ['rooms/south', { stops: '1,2,3,4,5,6,7,8,9' }], 'changing stops mid-tour sends them');
    await p.click('#tourNext'); await sleep(300);
    eq(norm(await last(p)), ['rooms/south', { tour: true, tourDot: 3, tourAt: 'TS' }], 'All dots: next is dot 3');
    await p.click('#dots button[data-dot="7"]'); await sleep(300);
    await p.click('[data-stops="highlights"]'); await sleep(300);
    eq(await p.textContent('#tourCount'), 'EXTRA STOP · HIGHLIGHTS', 'a jump outside the stops is an extra stop');
    await p.click('#tourPrev'); await sleep(300);
    eq(norm(await last(p)), ['rooms/south', { tour: true, tourDot: 5, tourAt: 'TS' }], 'back from an extra stop: the stop before it');
    await p.click('#tourEnd'); await sleep(300);
    // custom + self-guided
    await p.click('[data-stops="custom"]'); await sleep(200);
    ok(await p.isVisible('#customPick'), 'Custom shows the stop picker');
    ok(await p.$eval('#customPick [data-pick="1"]', (b) => b.disabled && b.classList.contains('sel')), 'dot 1 is always a stop');
    await p.click('#customPick [data-pick="2"]'); await sleep(150);
    await p.click('#customPick [data-pick="3"]'); await sleep(150);
    await p.click('#customPick [data-pick="8"]'); await sleep(150);
    eq(await p.textContent('#stopsNow'), 'Stops: 1 → 3 → 5 → 8', 'custom stops (2 removed, 3 and 8 added)');
    await p.click('#selfStart'); await sleep(300);
    eq(norm(await last(p)), ['rooms/south', { selfTourAt: 'TS', tour: false, tourAt: 'TS', stops: '1,3,5,8' }], 'Start self-guided tour');
    ok(await p.isVisible('#selfOn') && !(await p.isVisible('#tourOff')), 'self-guided controls show');
    ok((await p.textContent('#strip')).includes('Self-guided tour: 1 → 3 → 5 → 8'), 'status strip');
    ok(await p.$eval('#dots button[data-dot="4"]', (b) => b.disabled), 'dot buttons rest during a self-guided tour');
    await p.click('#selfRestart'); await sleep(300);
    eq(norm(await last(p)), ['rooms/south', { selfTourAt: 'TS' }], 'Restart for everyone');
    await p.click('#selfEnd'); await sleep(300);
    eq(norm(await last(p)), ['rooms/south', { selfTourAt: null }], 'End self-guided tour');
    ok(await p.isVisible('#tourOff'), 'back to the start buttons');
    eq(pageErrors(p), [], 'page errors');
    await p.close();
    // the Rosetta Stone has its own links
    const r = await signedIn();
    await r.click('#kitSeg button:nth-child(2)'); await sleep(800);
    await r.click('#tabTeach'); await sleep(300);
    eq(await r.$$eval('#dots button.core', (b) => b.map((x) => +x.dataset.dot)), [2, 3, 4, 5], 'Rosetta stars the writing dots: hieroglyphs, cartouche, Demotic, Greek');
    eq(await r.textContent('#stopsHl'), '★ Highlights (1 → 2 → 3 → 4 → 5)', 'Rosetta highlights');
    await r.close();
  });

  test('North End shows headsets 6–11', async () => {
    const p = await signedIn();
    await p.click('#groupSeg button[data-room="north"]'); await sleep(300);
    eq(await p.$$eval('#headsets button', (b) => b.map((x) => +x.dataset.hs)), [6, 7, 8, 9, 10, 11], 'pause tiles');
    eq(await p.$$eval('#supports .sup b', (b) => b.map((x) => +x.textContent)), [6, 7, 8, 9, 10, 11], 'support rows');
    await p.close();
  });
};
