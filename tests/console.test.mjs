// The headset side of the teacher console, with a fake Firebase: which room a headset follows, and what it does
// with each setting. The headset only listens; these tests also check it never writes.
import { ok, eq, page, ready, st, room, press, idle, tap, sleep, pageErrors } from './lib/helpers.mjs';

const NOW = () => Date.now();
const noWrites = (p) => p.evaluate(() => window.__fbmock.writes.length);

export default (test) => {
  test('console: the headset number picks the room (shared with the exhibits), and ?room= overrides it', async () => {
    let p = await page({ mocks: true });
    await ready(p);
    let s = await st(p); eq([s.room, s.headset], ['mmuusd', null], 'no number yet: the waiting room');
    ok(await p.isVisible('#hs-seg'), 'the start page asks which headset this is');
    await p.click('#hs-seg button[data-hs="8"]'); await sleep(300);
    s = await st(p); eq([s.room, s.headset], ['north', 8], 'headset 8 follows the North End');
    eq(await p.evaluate(() => localStorage.getItem('xr-headset')), '8', 'the number is kept in the same place as the exhibits');
    ok((await p.textContent('#hs-now')).includes('Headset 8 · North End'), 'the start page shows it');
    ok(!(await p.isVisible('#hs-seg')), 'and stops asking');
    ok((await p.textContent('#privacy')).includes('only listens'), 'the privacy line says the headset only listens');
    await p.close();

    p = await page({ mocks: true });
    await p.addInitScript(() => localStorage.setItem('xr-headset', '2'));   // numbered earlier in the exhibits
    await ready(p);
    s = await st(p); eq([s.room, s.headset], ['south', 2], 'a number from the exhibits is used');
    await p.close();

    p = await page({ mocks: true });
    await ready(p, '?room=g6-lab&headset=4');
    s = await st(p); eq(s.room, 'g6-lab', '?room= wins'); ok(!(await p.isVisible('#hs-row')), 'no number picker with ?room=');
    await p.close();

    p = await page({ mocks: true });
    await ready(p, '?room=off');
    s = await st(p); eq([s.room, s.roomStatus], ['', 'off'], '?room=off ignores the console');
    ok(!(await p.evaluate(() => Object.keys(window.__fbmock?.subs || {}).some((k) => k.startsWith('rooms/')))), 'and never listens');
    await p.close();

    p = await page();   // the real config: empty, so the console is off
    await ready(p);
    s = await st(p); eq(s.room, '', 'console off without a config'); ok(!(await p.isVisible('#hs-row')), 'no number picker');
    ok(!(await p.evaluate(() => 'xr-headset' in localStorage)), 'nothing stored');
    await p.close();
  });

  test('console: path, variable and sizes apply, and changing the path starts over', async () => {
    const p = await page({ mocks: true });
    await ready(p, '?headset=3');
    await press(p, 'fire'); await idle(p);
    eq((await st(p)).phase, 'q3', 'a student has fired once');
    await room(p, 'south', { path: 'full', start: 'plan', variable: 'powder', sizes: 'half,life', updatedAt: NOW() });
    let s = await st(p);
    eq([s.path, s.phase, s.planKey, s.lock], ['full', 'plan', 'powder', 'powder'], 'full investigation, at Plan, powder for everyone');
    eq([s.sizes, s.size], [['half', 'life'], 'half'], 'only Half and Life size; moved to Half');
    await room(p, 'south', { path: 'full', start: 'plan', variable: 'powder', sizes: 'half,life', bigText: true, updatedAt: NOW() });
    eq((await st(p)).phase, 'plan', 'other changes don’t start over');
    await room(p, 'south', { updatedAt: NOW() });   // Reset to Default
    s = await st(p);
    eq([s.path, s.phase, s.lock, s.guided.key], ['guided', 'try', null, 'cannon'], 'Default: the guided path, cannon weight');
    eq(s.sizes, ['desk', 'half', 'life'], 'all sizes again');
    eq(await noWrites(p), 0, 'the headset never wrote anything');
    eq(pageErrors(p), [], 'no page errors');
    await p.close();
  });

  test('console: supports for the room and for one headset; the student’s own choices stay', async () => {
    const p = await page({ mocks: true });
    await ready(p, '?headset=3');
    await room(p, 'south', { bigText: true, access: { h3: 'nfs', h4: 'c' }, updatedAt: NOW() });
    let s = await st(p);
    eq([s.big, s.num, s.lanyard, s.lang, s.calm], [true, true, false, 'es', false], 'bigger text for all; numbers, Fire button and Spanish for headset 3; not headset 4’s calm');
    // the student turns bigger text off in Options: it stays off while the teacher changes something else
    await press(p, 'options'); await press(p, 'acc:big'); await press(p, 'closeOptions');
    await room(p, 'south', { bigText: true, access: { h3: 'nfs', h4: 'c' }, calm: true, updatedAt: NOW() });
    s = await st(p); eq([s.big, s.calm], [false, true], 'the student’s choice stays; the new support arrives');
    await room(p, 'south', { calm: true, updatedAt: NOW() });
    s = await st(p); eq([s.num, s.lanyard, s.lang], [false, true, 'en'], 'clearing headset 3’s supports puts the link’s settings back');
    await p.close();
  });

  test('console: freeze and pause block the lab; Start over only for a new press', async () => {
    const p = await page({ mocks: true });
    await p.addInitScript(() => localStorage.setItem('xr-headset', '1'));
    await ready(p);
    const t = NOW() - 60e3;
    await room(p, 'south', { restartAt: t, updatedAt: t });   // pressed before this headset joined: ignored
    await press(p, 'fire'); await idle(p);
    eq((await st(p)).phase, 'q3', 'an old Start over is ignored');
    await room(p, 'south', { restartAt: t, freeze: 'eyes', freezeAt: NOW(), updatedAt: NOW() });
    let s = await st(p); eq(s.frozen, 'eyes', 'frozen');
    ok(await p.isVisible('#freeze'), 'the message covers the screen'); eq(await p.textContent('#freeze-text'), 'Eyes up! Please look at your teacher.', 'message');
    await press(p, 'q3:same'); eq((await st(p)).phase, 'q3', 'buttons do nothing while frozen');
    await room(p, 'south', { restartAt: t, freeze: 'none', freezeAt: NOW(), paused: { h1: NOW() }, updatedAt: NOW() });
    s = await st(p); eq(s.frozen, 'paused', 'headset 1 paused by number');
    ok((await p.textContent('#freeze-text')).includes('paused this headset'), 'pause message');
    await room(p, 'south', { restartAt: t, freeze: 'none', freezeAt: NOW(), paused: { h2: NOW() }, updatedAt: NOW() });
    s = await st(p); eq(s.frozen, null, 'a pause for headset 2 isn’t for this one'); ok(!(await p.isVisible('#freeze')), 'message gone');
    await press(p, 'q3:same'); eq((await st(p)).phase, 'watch', 'buttons work again');
    await room(p, 'south', { restartAt: NOW(), updatedAt: NOW() });
    s = await st(p); eq([s.phase, s.anim], ['try', null], 'Start over on every headset');
    eq(await noWrites(p), 0, 'the headset never wrote anything');
    await p.close();
  });

  test('console: in the headset, a freeze shows only the message and the controller can’t press through it', async () => {
    const p = await page({ xr: true, mocks: true });
    await ready(p, '?headset=0');
    await p.click('#btn-ar'); await sleep(2500);
    await room(p, 'south', { freeze: 'wait', freezeAt: NOW(), updatedAt: NOW() });
    await sleep(800);
    const f = await p.evaluate(() => { const D = window.__dbg, C = D.camera.position, m = D.freezePanel.mesh.position; return { d: m.distanceTo(C), handle: D.L.handle.visible }; });
    ok(f.d > 0.8 && f.d < 1.4, 'the message floats in front: ' + f.d.toFixed(2));
    ok(!(await p.evaluate(() => window.__dbg.state().handleVisible)), 'the lanyard is hidden');
    const at = await p.evaluate(() => window.__dbg.panel.buttonWorld('fire')?.toArray());
    if (at) { await tap(p, 'fire'); eq((await st(p)).anim, null, 'Fire can’t be pressed through the message'); }
    await room(p, 'south', { freeze: 'none', freezeAt: NOW(), updatedAt: NOW() });
    await sleep(600);
    await tap(p, 'fire'); ok((await st(p)).anim, 'after Resume, Fire works');
    eq(pageErrors(p), [], 'no page errors');
    await p.close();
  });
};
