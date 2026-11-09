// The whole lab on the screen preview (Chromebook / projector), driven through the panel's buttons.
import { ok, eq, near, page, ready, st, idle, replayEnd, press, pageErrors } from './lib/helpers.mjs';

async function toPlan(p) {
  await p.click('#btn-preview');
  await press(p, 'fire'); await idle(p);
  eq((await st(p)).phase, 'q3', 'after the first shot comes the "which push was bigger?" question');
}

export default (test) => {
  test('the whole lab: try it, 3rd-law question, plan, test 3×3, explain, challenge', async () => {
    const p = await page();
    await ready(p, '?number=on&path=full');
    await p.evaluate(() => window.__dbg.seed(11));
    let s = await st(p); eq(s.phase, 'try', 'starts with "Try it"');
    ok(await p.evaluate(() => window.__dbg.panel.buttons.some((b) => b.id === 'fire')), 'a Fire button is there for anyone who can\'t pull the lanyard');
    await toPlan(p);
    await press(p, 'q3:ball'); s = await st(p); eq([s.phase, s.anim?.kind], ['watch', 'replay'], 'answering starts the slow motion');
    ok(await p.evaluate(() => window.__dbg.L.arrows.ball.visible || window.__dbg.state().anim.t < 0.6), 'arrows show the pushes');
    await replayEnd(p);
    await press(p, 'rp:done'); s = await st(p); eq(s.phase, 'answer', 'then the answer');
    ok(await p.evaluate(() => window.__dbg.panel.spec.title.startsWith('Surprise')), 'a wrong guess gets "Surprise: the same!"');
    await press(p, 'toPlan'); await press(p, 'plan:cannon'); await press(p, 'startTest');
    s = await st(p); eq([s.phase, s.planKey, s.settings], ['test', 'cannon', { ball: 'iron', cannon: 'c1000', powder: 'p2', wheels: 'rolling' }], 'testing the cannon\'s weight, others kept the same');
    await idle(p);   // the cannon rolls back to the start line
    await press(p, 'fire'); eq((await st(p)).anim, null, 'Fire waits for a prediction');
    ok(await p.evaluate(() => window.__dbg.panel.spec.blocks.some((b) => b.p && b.p.includes('click on the ruler'))), 'on a screen, the panel says to click the ruler (not "pull the trigger")');
    eq(await p.evaluate(() => window.__dbg.panel.buttons.find((b) => b.id === 'fire').disabled), true, 'Fire is off until the prediction');
    const means = [];
    for (let i = 0; i < 3; i++) {
      await press(p, 'level:' + i);
      await p.evaluate(() => window.__dbg.predictCm(40));
      eq((await st(p)).predCm, 40, 'the prediction flag');
      for (let j = 0; j < 3; j++) {
        await press(p, 'fire'); await idle(p); eq((await st(p)).shotStartX, 0, 'every shot starts from the start line (0 cm)');
        let r = await st(p); ok(r.awaitRecord && r.cannonX < 0, '"Record your results" waits, with the cannon still where it stopped');
        await press(p, 'fire'); eq((await st(p)).anim, null, 'no next shot until the results are recorded');
        await press(p, 'recorded'); await idle(p); r = await st(p); ok(!r.awaitRecord && Math.abs(r.cannonX) < 1e-6, '"I recorded it" rolls the cannon back to 0');
      }
      const d = (await st(p)).data;
      const row = Object.values(d)[i]; eq(row.length, 3, 'three trials in the row');
      means.push(row.reduce((a, x) => a + x, 0) / 3);
      ok(new Set(row.map(Math.round)).size > 1 || row[0] < 25, 'trials differ a little: ' + row.map(Math.round));
    }
    ok(means[0] > means[1] && means[1] > means[2], 'heavier cannon, shorter recoil: ' + means.map(Math.round));
    near(means[1], 34, 4, 'the middle row matches the physics');
    await press(p, 'fire'); eq((await st(p)).anim, null, 'a full row takes no more shots');
    const tbl = await p.evaluate(() => window.__dbg.panel.spec.blocks.find((b) => b.table).table.rows.map((r) => r.slice(1, 4)));
    ok(tbl.every((r) => r.every((c) => /^\d+$/.test(c))), 'with "Show number" the table has the numbers');
    await press(p, 'explain'); eq((await st(p)).phase, 'explain', 'explain');
    await press(p, 'challenge'); s = await st(p); ok(s.challenge && s.challenge.target >= 15, 'a challenge target');
    // set the settings that reach the target, then fire
    const target = await p.evaluate(() => { const D = window.__dbg; for (const b of ['wood', 'stone', 'iron']) for (const c of ['c1000', 'c1500', 'c2000']) for (const w of ['p1', 'p2', 'p3']) { const cm = Math.round(D.shot({ ball: b, cannon: c, powder: w, wheels: 'rolling' }).d * 100); if (cm === D.state().challenge.target) return { ball: b, cannon: c, powder: w }; } return null; });
    ok(target, 'some settings reach the target');
    for (const [k, v] of Object.entries(target)) await press(p, `set:${k}:${v}`);
    let hits = 0;
    for (let i = 0; i < 3; i++) { await press(p, 'fire'); await idle(p); ok((await st(p)).loupe, 'the magnifier shows where it stopped'); if ((await st(p)).challenge.result.hit) hits++; }
    ok(hits >= 2, 'the right settings land on the line (most shots): ' + hits);
    eq(pageErrors(p), [], 'page errors'); eq(p.offsite, [], 'requests to other sites');
    await p.close();
  }, { slow: true });

  test('every screen fits its panel, in English and Spanish', async () => {
    for (const lang of ['en', 'es']) {
      const p = await page({ viewport: { width: 900, height: 700 } });
      await ready(p, '?number=on&path=full&lang=' + lang);
      const res = await p.evaluate(async () => {
        const D = window.__dbg, out = [], rec = (n) => out.push([n, D.panel.overflow]);
        const idle = () => new Promise((r) => { const f = () => (D.state().anim ? setTimeout(f, 100) : r()); f(); });
        rec('try'); D.press('fire'); await idle(); rec('q3'); D.press('q3:same'); rec('replay'); D.press('rp:done'); rec('answer');
        D.press('options'); rec('options'); D.press('closeOptions'); D.press('toPlan'); rec('plan');
        for (const k of ['ball', 'cannon', 'powder', 'wheels']) { D.press('plan:' + k); rec('plan ' + k); }
        D.press('startTest'); await idle(); D.predictCm(10); D.press('fire'); await idle(); rec('record'); D.press('recorded'); await idle(); rec('test');
        D.press('explain'); rec('explain'); D.press('challenge'); rec('challenge'); D.press('fire'); await idle(); rec('challenge result');
        return out;
      });
      eq(res.filter((r) => r[1]).map((r) => r[0]), [], `${lang}: screens that overflow (full path)`);
      ok(await p.evaluate(() => window.__dbg.panel.spec.title.startsWith('Desafío') || window.__dbg.S.lang === 'en'), 'Spanish panel');
      eq(pageErrors(p), [], 'page errors');
      await p.close();
    }
  }, { slow: true });

  test('link settings: ?lock=powder, ?sizes=desk,half, Show number off', async () => {
    const p = await page();
    await ready(p, '?lock=powder&sizes=desk,half&lang=es&path=full');
    eq(await p.evaluate(() => [...document.querySelectorAll('#size-seg button')].map((b) => b.textContent)), ['Escritorio', 'Mitad'], 'only the allowed sizes');
    await toPlan(p); await press(p, 'q3:same'); await replayEnd(p); await press(p, 'rp:done'); await press(p, 'toPlan');
    const ids = await p.evaluate(() => window.__dbg.panel.buttons.map((b) => b.id));
    ok(!ids.some((i) => i.startsWith('plan:')), 'locked: students cannot pick another variable');
    eq((await st(p)).planKey, 'powder', 'the class tests the powder');
    await press(p, 'startTest');
    ok(await p.evaluate(() => window.__dbg.panel.spec.blocks.some((b) => b.p && b.p.includes('regresa el cañón'))), 'while it rolls back to the start line, the panel says so');
    await idle(p);
    ok(await p.evaluate(() => window.__dbg.panel.spec.blocks.some((b) => b.p && b.p.includes('haz clic en la regla'))), 'Spanish screen wording');
    await p.evaluate(() => window.__dbg.predictCm(20)); await press(p, 'fire'); await idle(p);
    ok(await p.evaluate(() => window.__dbg.panel.spec.title === 'Anota tus resultados'), '"Record your results" in Spanish');
    const cell = await p.evaluate(() => window.__dbg.panel.spec.blocks.find((b) => b.table).table.rows[0][1]);
    eq(cell, '✓', 'without "Show number", students read the ruler and the table just ticks the trial');
    eq(await p.evaluate(() => window.__dbg.loupe.showNum), false, 'the magnifier has no number');
    await press(p, 'options'); await press(p, 'acc:num');
    eq(await p.evaluate(() => window.__dbg.loupe.showNum), true, 'the support turns the number on');
    await p.close();
  });

  test('Start over (two taps) gives the next pair a fresh lab; ?start=plan skips to planning', async () => {
    const p = await page();
    await ready(p, '?number=on&path=full');
    await p.click('#btn-preview');
    await press(p, 'fire'); await idle(p); await press(p, 'q3:same'); await replayEnd(p); await press(p, 'rp:done'); await press(p, 'toPlan');
    await press(p, 'plan:powder'); await press(p, 'startTest'); await p.evaluate(() => window.__dbg.predictCm(30)); await press(p, 'fire'); await idle(p);
    ok(Object.keys((await st(p)).data).length === 1, 'a trial is in the table');
    await press(p, 'options');
    ok(await p.evaluate(() => window.__dbg.panel.spec.blocks.some((b) => b.p && b.p.includes('Zack_Hawley'))), 'the model credit is in Options');
    await press(p, 'restart'); eq((await st(p)).phase, 'test', 'one tap only asks to confirm');
    await press(p, 'restart');
    await idle(p); const s = await st(p);
    eq([s.phase, s.planKey, s.data, s.predCm, Math.abs(s.cannonX) < 1e-6, s.optionsOpen], ['try', null, {}, null, true, false], 'back to "Try it" with an empty table, the cannon rolled back to 0');
    ok(await p.evaluate(() => !window.__dbg.L.predFlag.visible && window.__dbg.L.ghosts.length === 0), 'no flags left on the track');
    await p.close();
    const q = await page();
    await ready(q, '?start=plan&lock=wheels&path=full');
    eq([(await st(q)).phase, (await st(q)).planKey], ['plan', 'wheels'], 'day 2 starts at the plan');
    const cols = await q.evaluate(() => ['ball', 'cannon'].map((k) => window.__dbg.L.arrows[k].userData.shaft.material.color.getHexString()));
    eq(cols, ['2f8fe8', 'f28c28'], 'push arrows are blue and orange (colour-blind safe)');
    eq(pageErrors(q), [], 'page errors');
    await q.close();
  });

  test('guided path (the default): try it, the push question, compare two cannons (predict, fire, record), explain', async () => {
    for (const lang of ['en', 'es']) {
      const p = await page({ viewport: { width: 900, height: 700 } });
      await ready(p, '?number=on&lang=' + lang);
      await p.evaluate(() => window.__dbg.seed(5));
      eq((await st(p)).path, 'guided', 'guided is the default');
      await p.click('#btn-preview');
      const fits = [];
      const fit = async (n) => { if (await p.evaluate(() => window.__dbg.panel.overflow)) fits.push(n); };
      await fit('try');
      await press(p, 'fire'); await idle(p); await fit('q3');
      await press(p, 'q3:same');
      await p.waitForFunction(() => { const a = window.__dbg.state().anim; return a && !a.playing; }, null, { timeout: 240000 });
      ok(await p.evaluate(() => window.__dbg.L.arrows.ball.visible && window.__dbg.L.arrows.cannon.visible), 'slow motion stops on the two pushes, arrows showing');
      ok(await p.evaluate(() => window.__dbg.state().cannonX < 0 && window.__dbg.L.ball.position.x < 1.0), 'the cannon has started moving while the ball is still in the barrel');
      await press(p, 'rp:done'); await fit('answer');
      const ids = await p.evaluate(() => window.__dbg.panel.buttons.map((b) => b.id));
      ok(ids.includes('toCompare') && !ids.includes('toPlan'), 'no planning screen in the guided path');
      await press(p, 'toCompare'); await idle(p); await fit('compare');
      let s = await st(p); eq([s.phase, s.settings.cannon], ['gcomp', 'c1000'], 'shot 1: the light cannon');
      eq(await p.evaluate(() => window.__dbg.panel.buttons.filter((b) => !b.disabled).map((b) => b.id)), ['options'], 'only one thing to do: predict (Fire is off)');
      await p.evaluate(() => window.__dbg.predictCm(50));
      await press(p, 'fire'); await idle(p); await fit('record 1');
      s = await st(p); ok(s.awaitRecord, 'Record your results');
      eq(await p.evaluate(() => window.__dbg.panel.buttons.filter((b) => !b.disabled).map((b) => b.id)), ['recorded', 'options'], 'one big button');
      await press(p, 'recorded'); await idle(p);
      s = await st(p); eq([s.settings.cannon, Math.abs(s.cannonX) < 1e-6, s.predCm], ['c2000', true, null], 'shot 2: heavy cannon, rolled back to 0, new prediction needed');
      await p.evaluate(() => window.__dbg.predictCm(50)); await press(p, 'fire'); await idle(p); await fit('record 2'); await press(p, 'recorded'); await idle(p);
      s = await st(p); eq(s.phase, 'gexplain', 'then explain'); await fit('explain');
      ok(s.guided.results[0] > s.guided.results[1] * 2, 'the light cannon rolled back much farther: ' + s.guided.results.map(Math.round));
      eq(await p.evaluate(() => window.__dbg.L.ghosts.map((g) => g.userData.label.userData.text)), lang === 'en' ? ['1,000 kg', '2,000 kg'] : ['1,000 kg', '2,000 kg'], 'both flags stay on the ruler, labelled');
      await press(p, 'gDone'); eq((await st(p)).phase, 'gdone', 'done'); await fit('done');
      await press(p, 'again'); await idle(p); eq((await st(p)).phase, 'try', 'start again for the next pair');
      eq(fits, [], `${lang}: guided screens that overflow`);
      eq(pageErrors(p), [], 'page errors');
      await p.close();
    }
  }, { slow: true });
};
