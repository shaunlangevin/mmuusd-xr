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
    await p.evaluate(() => window.__dbg.openInfo(2));
    eq(await p.textContent('#card-title'), 'Look closely', 'prompt title');
    ok(await p.isVisible('#card-showme'), 'Show me button');
    ok(await p.isVisible('#card-extra img.lens'), 'the magnifier shows with the question');
    await p.waitForFunction(() => document.querySelector('#card-extra img.lens')?.naturalWidth > 0, null, { timeout: 8000 });
    await p.click('#card-showme');
    eq(await p.textContent('#card-title'), 'Pictures or sounds?', 'reading after Show me');
    ok(!(await p.isVisible('#card-extra img.lens')), 'the magnifier goes away once the reading shows');
    await p.close();
  });

  test('recorded notice prompts: Listen on the prompt, stops when the reading appears', async () => {
    const p = await page();
    // pretend Hammurabi's prompt clips exist by serving dot 1's reading clip for any NN-notice.mp3
    await p.route(/audio\/(en|es)\/\d\d-notice\.mp3/, (r) => r.fulfill({ path: new URL('../exhibits/hammurabi/audio/en/01.mp3', import.meta.url).pathname, contentType: 'audio/mpeg' }));
    await ready(p, '?room=off&exhibit=hammurabi&practice=off');
    await p.waitForFunction(() => window.__dbg.state().noticeAudio.en.filter(Boolean).length === 9, null, { timeout: 20000 });
    await p.evaluate(() => window.__dbg.openInfo(2));
    eq(await p.textContent('#card-title'), 'Look closely', 'prompt');
    ok(await p.isVisible('#card-listen'), 'Listen appears on the prompt');
    await p.click('#card-listen');
    await p.waitForFunction(() => window.__dbg.state().playing, null, { timeout: 8000 }).catch(() => {});   // play() resolves late in the emulator
    eq(await p.evaluate(() => [window.__dbg.state().playing, window.__dbg.state().playingKind]), [true, 'notice'], 'plays the prompt clip');
    eq(await p.textContent('#card-listen'), 'Stop', 'button turns into Stop');
    await p.click('#card-showme'); await sleep(200);
    eq(await p.evaluate(() => window.__dbg.state().playing), false, 'the prompt clip stops when the reading appears');
    ok(await p.isVisible('#card-listen'), 'the reading has its own Listen');
    await p.close();
  });

  test('recorded Tell me more: Listen switches to the extra part once it is opened', async () => {
    const p = await page();
    await p.route(/audio\/(en|es)\/\d\d-more\.mp3/, (r) => r.fulfill({ path: new URL('../exhibits/hammurabi/audio/en/01.mp3', import.meta.url).pathname, contentType: 'audio/mpeg' }));
    await ready(p, '?room=off&exhibit=hammurabi&practice=off&notice=off');
    await p.waitForFunction(() => window.__dbg.state().audio.en.length === 9, null, { timeout: 20000 });
    await p.evaluate(() => window.__dbg.openInfo(5)); await sleep(800);
    eq(await p.textContent('#card-listen'), 'Listen', 'collapsed: Listen plays the reading');
    await p.click('#card-moreBtn'); await sleep(200);
    eq(await p.textContent('#card-listen'), 'Listen to more', 'opened: Listen to more');
    await p.click('#card-listen');
    await p.waitForFunction(() => window.__dbg.state().playing, null, { timeout: 8000 }).catch(() => {});   // play() resolves late in the emulator
    eq(await p.evaluate(() => [window.__dbg.state().playing, window.__dbg.state().playingKind]), [true, 'more'], 'plays the Tell me more clip');
    await p.evaluate(() => window.__dbg.setSetting('lang', 'es')); await sleep(200);
    ok((await p.textContent('#card-orig-text')).startsWith('“Si un hombre le saca el ojo'), 'Spanish panel shows the Spanish quote');
    ok((await p.textContent('#card-orig-src')).includes('traducido al español'), 'and says it was translated');
    await p.close();
  });

  test('keyboard and screen readers: dot list, 1–9 keys, Esc, focus', async () => {
    const p = await page();
    await ready(p, '?room=off&exhibit=rosetta-stone&practice=off');
    const labels = await p.$$eval('#tracker button', (bs) => bs.map((b) => b.getAttribute('aria-label')));
    eq(labels.length, 9, 'one button per dot'); ok(labels[1].startsWith('Dot 2: The part they could read'), 'buttons are labelled with the dot title');
    await p.keyboard.press('3'); await sleep(150);
    ok(await p.isVisible('#card'), 'key 3 opens a dot'); eq(await p.evaluate(() => document.activeElement.id), 'card-title', 'focus moves into the card');
    await p.keyboard.press('Escape'); await sleep(150);
    ok(!(await p.isVisible('#card')), 'Esc closes it');
    eq(await p.evaluate(() => document.activeElement.dataset.dot), '2', 'focus returns to dot 3 in the list');
    await p.click('#btn-text'); await sleep(150);
    eq(await p.$$eval('#tv-body article', (a) => a.length), 10, 'text page: 9 dots + the big question');
    await p.keyboard.press('Escape');
    ok(!(await p.isVisible('#textview')), 'Esc closes the text page');
    await p.evaluate(() => window.__dbg.setSetting('clues', true)); await sleep(100);
    ok(!(await p.isVisible('#btn-text')), 'text page hidden in Detective mode');
    ok(await p.$eval('#tracker button[data-dot="4"]', (b) => b.disabled), 'hidden dots are disabled in the list');
    await p.close();
  });

  test('supports on the 2D page: bigger text, read to me, calm', async () => {
    const p = await page({ speech: true });
    await p.route(/rosetta-stone\/audio\//, (r) => r.fulfill({ status: 404, body: '' }));   // as if not yet recorded: Read to me only shows where there is no recording
    await ready(p, '?room=off&exhibit=rosetta-stone&practice=off');
    await p.evaluate(() => window.__dbg.openInfo(5));   // A god on Earth?
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

  test('self-guided tour on a Chromebook: Show me, Next stop, Finish tour', async () => {
    const p = await page();
    await ready(p, '?room=5a&exhibit=hammurabi');
    const send = room(p, '5a');
    await send({ selfTourAt: Date.now(), stops: '1,2' }, 1200);
    ok(await p.isVisible('#card') && await p.isVisible('#card-showme'), 'stop 1 opens with its prompt and the big Next');
    eq(await p.textContent('#card-showme'), 'Next ▶', 'one big Next on the question'); ok(await p.$eval('#card-showme', (b) => b.classList.contains('hero')), 'it is the big button');
    ok(!(await p.isVisible('#card-close')), 'no Close to wander off the tour');
    ok(!(await p.isVisible('#card-nextstop')), 'no Next stop on the prompt');
    await p.click('#card-showme'); await sleep(300);
    eq(await p.textContent('#card-nextstop'), 'Next ▶', 'the same Next after the reading'); ok(!(await p.isVisible('#card-moreBtn')), 'Tell me more steps back during the tour');
    await p.click('#card-nextstop'); await sleep(800);
    eq(await p.evaluate(() => window.__dbg.state().openIndex), 1, 'dot 2 opens');
    await p.click('#card-showme'); await sleep(300);
    eq(await p.textContent('#card-nextstop'), 'Done ✓', 'the last stop says Done');
    await p.click('#card-nextstop'); await sleep(500);
    eq(await p.evaluate(() => window.__dbg.tourState().touring), false, 'finished: free exploring');
    ok(!(await p.isVisible('#card-nextstop')), 'Next stop is gone');
    eq(pageErrors(p), [], 'page errors');
    await p.close();
  });

  test('Rosetta cartouche dot: the king’s-name picture, with the hieroglyph font', async () => {
    const p = await page();
    await ready(p, '?room=off&exhibit=rosetta-stone&notice=off');
    await p.evaluate(() => window.__dbg.openInfo(3)); await sleep(800);
    eq(await p.textContent('#card-title'), 'A name in a loop', 'dot 4 is the cartouche');
    ok(await p.isVisible('#card-extra img'), 'the picture shows');
    ok(await p.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'SteleHiero' && f.status === 'loaded')), 'the hieroglyph font loaded');
    // the seven signs really draw (not empty boxes): each is wider than a space in the font
    const widths = await p.evaluate(async () => { const { CARTOUCHE_CHARS } = await import('./js/i18n.js'); const c = document.createElement('canvas').getContext('2d'); c.font = '100px SteleHiero';
      return CARTOUCHE_CHARS.map((ch) => Math.round(c.measureText(ch).width)); });
    ok(widths.length === 7 && widths.every((w) => w > 20), `every sign has a shape (${widths})`);
    eq(pageErrors(p), [], 'page errors');
    await p.close();
  });

  test('Key words: a narrated reading shows key words; All the words brings the full text back', async () => {
    const p = await page();
    // pretend the Rosetta readings are recorded (serve Hammurabi's dot 1 clip for any NN.mp3)
    await p.route(/rosetta-stone\/audio\/(en|es)\/\d\d\.mp3/, (r) => r.fulfill({ path: new URL('../exhibits/hammurabi/audio/en/01.mp3', import.meta.url).pathname, contentType: 'audio/mpeg' }));
    await ready(p, '?room=off&exhibit=rosetta-stone&notice=off');
    await p.waitForFunction(() => window.__dbg.state().audio.en.filter(Boolean).length === 9, null, { timeout: 20000 });
    await p.evaluate(() => window.__dbg.openInfo(3)); await sleep(500);
    ok(await p.isVisible('#card-keys'), 'key words show');
    eq(await p.$$eval('#card-keys li', (l) => l.map((x) => x.textContent)), ['Cartouche [kar-TOOSH]: a loop around a royal name', 'Inside: Ptolemy [TOL-uh-mee]', 'Signs can stand for sounds'], 'the dot’s key terms');
    ok(!(await p.isVisible('#card-body')) && !(await p.isVisible('#card-think')), 'the long reading and the question wait');
    eq(await p.textContent('#card-words'), 'All the words', 'button to see everything');
    await p.click('#card-words'); await sleep(200);
    ok(await p.isVisible('#card-body') && !(await p.isVisible('#card-keys')), 'All the words: full text');
    await p.evaluate(() => window.__dbg.openInfo(1)); await sleep(300);
    ok(await p.isVisible('#card-body'), 'the choice sticks for the next dot');
    eq(await p.textContent('#card-words'), 'Key words', 'and can be switched back');
    await p.close();
    // no recording → nothing narrates, so the full text shows and there is no Key words button
    const q = await page();
    await q.route(/rosetta-stone\/audio\//, (r) => r.fulfill({ status: 404, body: '' }));   // as if not yet recorded: Read to me only shows where there is no recording
    await ready(q, '?room=off&exhibit=rosetta-stone&notice=off');
    await q.evaluate(() => window.__dbg.openInfo(3)); await sleep(500);
    ok(await q.isVisible('#card-body') && !(await q.isVisible('#card-keys')) && !(await q.isVisible('#card-words')), 'without a recording: the full text');
    eq(pageErrors(q), [], 'page errors');
    await q.close();
  });

  test('Spanish switches the interface and the model credit', async () => {
    const p = await page();
    await ready(p, '?room=off&exhibit=rosetta-stone&lang=es&notice=off');
    eq(await p.textContent('#btn-ar'), 'Ponerla en este salón', 'start button');
    await p.evaluate(() => window.__dbg.openInfo(7)); await p.click('#card-moreBtn');   // the temple-wall dot carries the height ruler and credit
    ok((await p.textContent('#card-credit')).startsWith('Modelo 3D'), 'credit in Spanish on the height dot');
    await p.close();
  });
};
