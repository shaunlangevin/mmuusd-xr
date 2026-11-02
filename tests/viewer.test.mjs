// The exhibit page on a Chromebook / iPad-style screen (no headset).
import { ok, eq, readJSON, page, ready, room, sleep, pageErrors } from './lib/helpers.mjs';

const index = readJSON('exhibits/index.json');

export default (test) => {
  for (const { id } of index.exhibits) {
    test(`${id}: loads, every dot sits on the model and opens in both languages`, async () => {
      const p = await page();
      await ready(p, `?room=off&exhibit=${id}&notice=off&progress=off`);
      const ex = readJSON(`exhibits/${id}/exhibit.json`);
      eq(await p.evaluate(() => window.__dbg.kitState().exhibit), id, 'exhibit');
      const info = await p.evaluate(() => window.__dbg.dotsInfo());
      eq(info.length, ex.dots.length, 'dot count');
      const missed = info.filter((d) => !d.hit).map((d) => d.id);
      eq(missed, [], 'dots whose angle/h/x miss the model (they would float)');
      ok(!(await p.textContent('#status')).includes('Could not load'), 'exhibit failed to load');
      for (const lang of ['en', 'es']) {
        await p.evaluate((l) => window.__dbg.setSetting('lang', l), lang);
        for (let i = 0; i < ex.dots.length; i++) {
          await p.evaluate((i) => window.__dbg.openInfo(i), i);
          eq(await p.textContent('#card-title'), ex.dots[i].title[lang], `${lang} title of dot ${i + 1}`);
          ok((await p.textContent('#card-body')).length > 40, `${lang} text of dot ${i + 1}`);
        }
      }
      eq(pageErrors(p), [], 'page errors');
      await p.close();
    });

    test(`${id}: headset panels fit without shrinking text much`, async () => {
      const p = await page();
      await ready(p, `?room=off&exhibit=${id}&practice=off`);
      const r = await p.evaluate(async (id) => {
        const ex = await (await fetch(`exhibits/${id}/exhibit.json`)).json(), P = window.__dbg.panel, out = [];
        const fit = (st) => { const H = P.canvas.height; const lay = (k) => (st.notice ? P.noticeLayout(k) : P.layout(k)); P.state = st; let s = 1, L = lay(s); while (L.height > H - 136 && s > 0.55) { s -= 0.03; L = lay(s); } return +s.toFixed(2); };
        for (const lang of ['en', 'es']) ex.dots.forEach((d, i) => {
          const base = { dot: d, index: i, lang, hasAudio: true, canRead: true, hasMore: !!(d.more || d.law?.original), lawCredit: ex.lawCredit, credit: d.extra === 'height' ? ex.model.credit[lang] : '' };
          out.push({ n: `${lang} dot ${i + 1}`, main: fit({ ...base }), more: fit({ ...base, expanded: true }), notice: fit({ dot: d, index: i, lang, notice: true, wait: true }) });
        });
        return out;
      }, id);
      const small = r.filter((x) => Math.min(x.main, x.more, x.notice) < 0.75).map((x) => `${x.n} (${Math.min(x.main, x.more, x.notice)})`);
      eq(small, [], 'panels whose text shrinks below 75% (cut some words)');
      await p.close();
    });
  }

  test('notice first: prompt, then Show me, then the reading', async () => {
    const p = await page();
    await ready(p, '?room=off&exhibit=rosetta-stone&practice=off');
    await p.evaluate(() => window.__dbg.openInfo(1));
    eq(await p.textContent('#card-title'), 'Look closely', 'prompt title');
    ok(await p.isVisible('#card-showme'), 'Show me button');
    await p.click('#card-showme');
    eq(await p.textContent('#card-title'), 'Sacred writing', 'reading after Show me');
    await p.close();
  });

  test('keyboard and screen readers: dot list, 1–9 keys, Esc, focus', async () => {
    const p = await page();
    await ready(p, '?room=off&exhibit=rosetta-stone&practice=off');
    const labels = await p.$$eval('#tracker button', (bs) => bs.map((b) => b.getAttribute('aria-label')));
    eq(labels.length, 8, 'one button per dot'); ok(labels[1].startsWith('Dot 2: Sacred'), 'buttons are labelled with the dot title');
    await p.keyboard.press('3'); await sleep(150);
    ok(await p.isVisible('#card'), 'key 3 opens a dot'); eq(await p.evaluate(() => document.activeElement.id), 'card-title', 'focus moves into the card');
    await p.keyboard.press('Escape'); await sleep(150);
    ok(!(await p.isVisible('#card')), 'Esc closes it');
    eq(await p.evaluate(() => document.activeElement.dataset.dot), '2', 'focus returns to dot 3 in the list');
    await p.click('#btn-text'); await sleep(150);
    eq(await p.$$eval('#tv-body article', (a) => a.length), 9, 'text page: 8 dots + the big question');
    await p.keyboard.press('Escape');
    ok(!(await p.isVisible('#textview')), 'Esc closes the text page');
    await p.evaluate(() => window.__dbg.setSetting('clues', true)); await sleep(100);
    ok(!(await p.isVisible('#btn-text')), 'text page hidden in Detective mode');
    ok(await p.$eval('#tracker button[data-dot="4"]', (b) => b.disabled), 'hidden dots are disabled in the list');
    await p.close();
  });

  test('supports on the 2D page: bigger text, read to me, calm', async () => {
    const p = await page({ speech: true });
    await ready(p, '?room=off&exhibit=rosetta-stone&practice=off');
    await p.evaluate(() => window.__dbg.openInfo(4));
    ok(!(await p.isVisible('#card-read')), 'no Read button until the support is on');
    await p.click('[data-acc="read"]'); await sleep(100);
    ok(await p.isVisible('#card-read'), 'Read to me appears');
    await p.click('#card-read');
    await p.waitForFunction(() => !window.__dbg.accState().speaking, null, { timeout: 10000 });
    ok((await p.evaluate(() => window.__spoken.join(' '))).includes('only about 12 years old'), 'it read the open panel');
    const before = await p.$eval('#card-body', (e) => parseFloat(getComputedStyle(e).fontSize));
    await p.click('[data-acc="big"]'); await sleep(100);
    ok(await p.$eval('#card-body', (e) => parseFloat(getComputedStyle(e).fontSize)) > before * 1.2, 'bigger text');
    await p.click('[data-acc="calm"]'); await sleep(100);
    ok(await p.evaluate(() => document.body.classList.contains('calm')), 'calm mode');
    await p.close();
  });

  test('read to me never appears without a voice for the language', async () => {
    const p = await page({ init: 'Object.defineProperty(window, "speechSynthesis", { value: { getVoices: () => [], speak() {}, cancel() {}, addEventListener() {} } });' });
    await ready(p, '?room=off&exhibit=rosetta-stone&practice=off&read=on');
    await p.evaluate(() => window.__dbg.openInfo(0));
    ok(!(await p.isVisible('#card-read')), 'no voices → no button');
    await p.close();
  });

  test('teacher picks a kit and artifact → the page switches', async () => {
    const p = await page();
    await ready(p, '?room=5a');
    const send = room(p, '5a');
    await send({ kit: 'g5-egypt', exhibit: null }, 300);
    await p.waitForFunction(() => window.__steleReady && window.__dbg.kitState().exhibit === 'rosetta-stone', null, { timeout: 60000 });
    eq(await p.textContent('#kit-label'), 'Grade 5 · Egypt', 'kit label');
    ok(new URL(p.url()).search.includes('kit=g5-egypt'), 'remembers the kit in the address');
    await p.close();
  });

  test('Spanish switches the interface and the model credit', async () => {
    const p = await page();
    await ready(p, '?room=off&exhibit=rosetta-stone&lang=es&notice=off');
    eq(await p.textContent('#btn-ar'), 'Ponerla en este salón', 'start button');
    await p.evaluate(() => window.__dbg.openInfo(6)); await p.click('#card-moreBtn');
    ok((await p.textContent('#card-credit')).startsWith('Modelo 3D'), 'credit in Spanish on the height dot');
    await p.close();
  });
};
