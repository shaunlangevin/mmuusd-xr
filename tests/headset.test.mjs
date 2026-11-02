// The exhibit inside an emulated Quest 3 (IWER), driven like a student and a teacher would.
import { ok, eq, near, page, ready, room, aim, trigger, sleep, pageErrors } from './lib/helpers.mjs';

const CP = [0.2, 1.3, -0.2];   // where the student holds the controller
const btn = (p, obj, id) => p.evaluate(([o, id]) => window.__dbg[o].buttonWorld(id)?.toArray(), [obj, id]);
const press = async (p, obj, id) => { const at = await btn(p, obj, id); ok(at, `${obj} has no "${id}" button`); await aim(p, CP, at); await trigger(p); };
const st = (p) => p.evaluate(() => { const D = window.__dbg, s = D.state(), t = D.tourState(); return { open: s.openIndex, panel: s.panel, tb: s.toolbarItems, btns: D.panel.buttons.map((b) => b.id), touring: t.touring, step: t.tourStep, frozen: t.frozen, room: t.room, notice: D.noticeState().phase, playing: s.playing, rotY: s.rotY }; });
// recentre simulation + "anchor lost" switch, installed before the page loads
const ANCHOR_TOOLS = `
  const orig = XRFrame.prototype.getPose;
  XRFrame.prototype.getPose = function (space, base) {
    const pose = orig.call(this, space, base), a = window.__dbg && window.__dbg.anchorObj && window.__dbg.anchorObj();
    if (!pose || !window.__W || !a || space !== a.anchorSpace) return pose;
    const { THREE } = window.__dbg, M = new THREE.Matrix4().fromArray(pose.transform.matrix).premultiply(window.__W);
    const pp = new THREE.Vector3(), qq = new THREE.Quaternion(), ss = new THREE.Vector3(); M.decompose(pp, qq, ss);
    return { transform: new XRRigidTransform({ x: pp.x, y: pp.y, z: pp.z }, { x: qq.x, y: qq.y, z: qq.z, w: qq.w }) };
  };
  const desc = Object.getOwnPropertyDescriptor(XRFrame.prototype, 'trackedAnchors');
  Object.defineProperty(XRFrame.prototype, 'trackedAnchors', { get() { const s = desc.get.call(this), dead = window.__deadAnchor; return dead ? new Set([...s].filter((a) => a !== dead)) : s; } });`;

export default (test) => {
  test('VR gallery: open a dot, hide it, bring it back, close it', async () => {
    const p = await page({ xr: true });
    await ready(p, '?room=off&practice=off&notice=off');
    await p.click('#btn-vr'); await sleep(2000);
    eq((await st(p)).tb, ['left', 'right', 'move', 'options', 'exit'], 'toolbar');
    const m0 = await p.evaluate(() => window.__dbg.markers[0].position.toArray());
    await aim(p, CP, m0); await trigger(p);
    let s = await st(p); eq(s.open, 0, 'pointing at dot 1 opens it'); ok(s.panel, 'panel visible');
    await press(p, 'handle', 'hide');
    ok(await p.evaluate(() => window.__dbg.tab.mesh.visible && !window.__dbg.panel.mesh.visible), 'Hide leaves a small tab');
    await press(p, 'tab', 'show');
    ok(await p.evaluate(() => window.__dbg.panel.mesh.visible), 'the tab brings it back');
    await press(p, 'panel', 'next'); eq((await st(p)).open, 1, 'Next opens dot 2');
    await press(p, 'panel', 'close'); eq((await st(p)).open, -1, 'Close');
    eq(pageErrors(p), [], 'page errors');
    await p.close();
  });

  test('grab bar: drag a panel and later panels open there', async () => {
    const p = await page({ xr: true });
    await ready(p, '?room=off&practice=off&notice=off');
    await p.click('#btn-vr'); await sleep(2000);
    await aim(p, CP, await p.evaluate(() => window.__dbg.markers[0].position.toArray())); await trigger(p);
    const before = await p.evaluate(() => window.__dbg.rig.position.toArray());
    await aim(p, CP, await btn(p, 'handle', 'grab'));
    await p.evaluate(() => window.__xr.controllers.right.updateButtonValue('trigger', 1)); await sleep(300);
    for (let k = 1; k <= 6; k++) await aim(p, CP, [0.9 - k * 0.3, 1.45, -0.9]);
    await sleep(400); await p.evaluate(() => window.__xr.controllers.right.updateButtonValue('trigger', 0)); await sleep(400);
    const g = await p.evaluate(() => window.__dbg.grabState());
    ok(g.placePref, 'the spot is remembered');
    const after = await p.evaluate(() => window.__dbg.rig.position.toArray());
    ok(Math.hypot(after[0] - before[0], after[2] - before[2]) > 0.3, 'the panel moved');
    await press(p, 'panel', 'next'); await sleep(300);
    const next = await p.evaluate(() => window.__dbg.rig.position.toArray());
    ok(Math.hypot(next[0] - after[0], next[2] - after[2]) < 0.2, 'the next panel opens where the student put the last one');
    await p.close();
  });

  test('guided tour: notice, reveal, narration, next, end', async () => {
    const p = await page({ xr: true });
    await ready(p, '?headset=2&exhibit=hammurabi');
    const send = room(p, 'south');
    await send({ practice: false });
    await p.click('#btn-vr'); await sleep(2000);
    const now = Date.now();
    await send({ tour: true, tourDot: 1, tourAt: now }, 1500);
    let s = await st(p); eq([s.touring, s.open, s.notice], [true, 0, true], 'step 1 opens with the look-closely prompt'); eq(s.tb, [], 'no turning during a tour');
    const rot = s.rotY;
    await p.evaluate(() => window.__xr.controllers.right.updateAxes('thumbstick', 0.9, 0)); await sleep(500); await p.evaluate(() => window.__xr.controllers.right.updateAxes('thumbstick', 0, 0));
    eq((await st(p)).rotY, rot, 'the thumbstick cannot turn the stone during a tour');
    await send({ reveal: 1, revealAt: Date.now() }); s = await st(p); eq(s.notice, false, 'teacher reveals the reading'); ok(s.btns.includes('listen'), 'Listen is there');
    await send({ tourDot: 2, tourAt: Date.now() + 5 }, 1500); s = await st(p); eq([s.open, s.notice], [1, true], 'next step starts with the prompt again');
    await send({ narrate: 2, narrateAt: Date.now() + 10 }); s = await st(p); eq(s.notice, false, 'narration reveals the reading');
    await send({ tour: false, tourAt: Date.now() + 20 }); s = await st(p); eq(s.touring, false, 'tour ended'); eq(s.tb, ['left', 'right', 'move', 'options', 'exit'], 'toolbar back');
    await p.close();
  });

  test('freeze everyone, and pause one headset by its number', async () => {
    const p = await page({ xr: true });
    await ready(p, '?headset=2');
    const send = room(p, 'south');
    await send({ practice: false });
    await p.click('#btn-vr'); await sleep(1500);
    await send({ freeze: 'eyes', freezeAt: Date.now() }); eq((await st(p)).frozen, 'eyes', 'Eyes up');
    await send({ freeze: 'none', freezeAt: Date.now() }); eq((await st(p)).frozen, null, 'Resume');
    await send({ paused: { h3: Date.now() } }); eq((await st(p)).frozen, null, 'a pause for headset 3 leaves headset 2 alone');
    await send({ paused: { h2: Date.now() } }); eq((await st(p)).frozen, 'paused', 'headset 2 paused');
    await send({ paused: null }); eq((await st(p)).frozen, null, 'resumed');
    await p.close();
  });

  test('headset number picks the room (South End 0–5, North End 6–11)', async () => {
    const p = await page({ xr: true });
    await ready(p, '?headset=8');
    eq((await st(p)).room, 'north', 'headset 8 follows North End');
    await p.evaluate(() => window.__dbg.setHeadset(3)); await sleep(500);
    eq((await st(p)).room, 'south', 'switching to 3 moves it to South End');
    eq(await p.evaluate(() => localStorage.getItem('xr-headset')), '3', 'the number is kept on the headset');
    await p.close();
  });

  test('practice card: pinch, hide, show, close', async () => {
    const p = await page({ xr: true });
    await ready(p, '?room=off&practice=on');
    await p.click('#btn-vr'); await sleep(2500);
    ok((await p.evaluate(() => window.__dbg.practiceState())).card, 'the Practice card waits');
    await press(p, 'practiceCard', 'go'); eq((await p.evaluate(() => window.__dbg.practiceState())).stage, 'hide', 'pinching starts it');
    await press(p, 'handle', 'hide'); eq((await p.evaluate(() => window.__dbg.practiceState())).stage, 'show', 'then Show');
    await press(p, 'tab', 'show'); eq((await p.evaluate(() => window.__dbg.practiceState())).stage, 'close', 'then Close');
    await press(p, 'panel', 'close'); eq((await p.evaluate(() => window.__dbg.practiceState())).done, true, 'done');
    await p.close();
  });

  test('supports from the console: room-wide and for one headset', async () => {
    const p = await page({ xr: true, speech: true });
    await ready(p, '?headset=2&exhibit=rosetta-stone&kit=g5-egypt');
    const send = room(p, 'south');
    await send({ kit: 'g5-egypt', exhibit: 'rosetta-stone', practice: false });
    await p.click('#btn-vr'); await sleep(2000);
    await send({ dot: 6, dotAt: Date.now() }, 1500);
    const acc = () => p.evaluate(() => window.__dbg.accState());
    eq((await acc()).zoom, 1, 'normal size');
    await send({ bigText: true }); near((await acc()).zoom, 1.3, 0.01, 'room-wide Bigger text');
    await send({ access: { h3: 'r' } }); eq((await acc()).read, false, 'a support for headset 3 does not reach headset 2');
    await send({ access: { h2: 'rc' } }); const a = await acc(); eq([a.read, a.calm], [true, true], 'headset 2 gets Read to me + Calm');
    ok((await st(p)).btns.includes('read'), 'Read to me button on the panel');
    await p.evaluate(() => window.__dbg.toggleRead()); await p.waitForFunction(() => !window.__dbg.accState().speaking, null, { timeout: 10000 });
    ok((await p.evaluate(() => window.__spoken.join(' '))).startsWith('Look closely.'), 'reads the prompt');
    const halo = await p.evaluate(async () => { const m = window.__dbg.markers[0].userData.halo.material, a = m.opacity; await new Promise((r) => setTimeout(r, 300)); return a === m.opacity; });
    ok(halo, 'Calm mode: dots stop pulsing');
    await send({ access: null, bigText: null }); const c = await acc(); eq([c.big, c.read, c.calm, c.zoom], [false, false, false, 1], 'cleared');
    await p.close();
  });

  test('passthrough: place the stone; it stays put when the headset recentres', async () => {
    const p = await page({ xr: true, xrInit: ANCHOR_TOOLS });
    await ready(p, '?room=off&practice=off&notice=off');
    await p.click('#btn-ar'); await sleep(2000);
    await aim(p, [0.2, 1.2, -0.2], [0, 0, -1.8]); await trigger(p); await sleep(1500);
    ok((await p.evaluate(() => window.__dbg.anchorState())).anchor, 'the stone is pinned with an anchor');
    await p.evaluate(() => { const d = window.__xr; d.position.set(0.8, 1.6, -0.4); const a = 0.9; d.quaternion.set(0, Math.sin(a / 2), 0, Math.cos(a / 2)); }); await sleep(600);
    const rel = () => p.evaluate(() => { const D = window.__dbg; return D.root.position.clone().sub(D.camera.position).applyQuaternion(D.camera.quaternion.clone().invert()).toArray(); });
    const before = await rel();
    await p.evaluate(() => { const { THREE } = window.__dbg, d = window.__xr;
      const W = new THREE.Matrix4().makeRotationY(-0.9).setPosition(-0.5, 0, 0.9);
      const H = new THREE.Matrix4().compose(new THREE.Vector3(d.position.x, d.position.y, d.position.z), new THREE.Quaternion(d.quaternion.x, d.quaternion.y, d.quaternion.z, d.quaternion.w), new THREE.Vector3(1, 1, 1)).premultiply(W);
      const pp = new THREE.Vector3(), qq = new THREE.Quaternion(), ss = new THREE.Vector3(); H.decompose(pp, qq, ss);
      d.position.set(pp.x, pp.y, pp.z); d.quaternion.set(qq.x, qq.y, qq.z, qq.w); window.__W = W; });
    await sleep(1000);
    const after = await rel();
    ok(before.every((v, i) => Math.abs(v - after[i]) < 0.03), `the stone kept its place in the room (before ${before.map((v) => v.toFixed(2))}, after ${after.map((v) => v.toFixed(2))})`);
    await p.close();
  });

  test('passthrough: a lost anchor (headset slept) is recovered from the saved spot', async () => {
    const p = await page({ xr: true, xrInit: ANCHOR_TOOLS });
    await ready(p, '?room=off&practice=off&notice=off');
    await p.click('#btn-ar'); await sleep(2000);
    await aim(p, [0.2, 1.2, -0.2], [0, 0, -1.8]); await trigger(p); await sleep(1500);
    await p.evaluate(() => { window.__dbg.root.rotation.y += 0.4; });   // the student turned it a little
    const pos = await p.evaluate(() => ({ p: window.__dbg.root.position.toArray(), r: window.__dbg.root.rotation.y }));
    ok((await p.evaluate(() => window.__dbg.anchorState())).saved, 'walking mode saved the spot');
    await p.evaluate(() => { window.__deadAnchor = window.__dbg.anchorObj(); });
    await sleep(6000);
    const s = await p.evaluate(() => ({ p: window.__dbg.root.position.toArray(), r: window.__dbg.root.rotation.y, placing: window.__dbg.state().placing, a: window.__dbg.anchorState(), lines: window.__dbg.debugLines().join(' | ') }));
    ok(!s.placing, 'no need to place it again'); ok(s.a.anchor, 'a new anchor holds it');
    ok(s.p.every((v, i) => Math.abs(v - pos.p[i]) < 0.05), 'same spot'); near(s.r, pos.r, 0.05, 'same turn');
    await p.close();
  });
};
