// In an emulated Quest 3 (IWER), driven with the controller like a student would.
import { ok, eq, near, page, ready, st, idle, aim, trigger, setTrigger, tap, press, CP, sleep, pageErrors } from './lib/helpers.mjs';

// recentre simulation + "anchor lost" switch (same tools as the artifact viewer's tests), installed before the page loads
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
  Object.defineProperty(XRFrame.prototype, 'trackedAnchors', { get() { const s = desc.get.call(this), dead = window.__deadAnchor; return dead ? new Set([...s].filter((a) => a !== dead)) : s; } });
  // the emulator hands back the same anchor object when it is restored; on a real headset the restored anchor is found again
  const restore = XRSession.prototype.restorePersistentAnchor;
  XRSession.prototype.restorePersistentAnchor = function (h) { window.__restored = (window.__restored || 0) + 1; window.__deadAnchor = null; return restore.call(this, h); };`;
const labPose = (p) => p.evaluate(() => ({ p: window.__dbg.lab.position.toArray(), r: window.__dbg.lab.rotation.y }));

export default (test) => {
  test('desk size: the lab appears in front, the lanyard fires it, pointing places the prediction', async () => {
    const p = await page({ xr: true });
    await ready(p, '?path=full');
    ok(await p.evaluate(() => !document.getElementById('btn-ar').hidden), 'the headset button shows');
    await p.click('#btn-ar'); await sleep(2500);
    let s = await st(p); eq([s.mode, s.size, s.labVisible, s.placing], ['ar', 'desk', true, false], 'desk size places itself');
    const lab = await p.evaluate(() => { const D = window.__dbg, C = D.camera.position; return { d: Math.hypot(D.lab.position.x - C.x, D.lab.position.z - C.z), below: C.y - D.lab.position.y, scale: D.lab.scale.x }; });
    ok(lab.d > 0.4 && lab.d < 0.9 && lab.below > 0.3, 'in front, at desk height: ' + JSON.stringify(lab));
    near(lab.scale, 1 / 7, 1e-6, 'desk scale 1:7');
    // pull the lanyard: grab the handle, tug 20 cm
    const h = await p.evaluate(() => window.__dbg.handleWorld());
    await aim(p, CP, h); await setTrigger(p, 1);
    await p.evaluate(() => { const c = window.__xr.controllers.right; c.position.set(c.position.x, c.position.y, c.position.z + 0.2); }); await sleep(500);
    s = await st(p); eq(s.anim?.kind, 'live', 'a tug on the lanyard fires the cannon');
    await setTrigger(p, 0); await idle(p);
    s = await st(p); eq(s.phase, 'q3', 'question next'); ok(s.cannonX < -0.2, 'the cannon rolled back');
    await tap(p, 'q3:same'); eq((await st(p)).phase, 'watch', 'buttons work with the controller');
    await tap(p, 'rp:done'); await tap(p, 'toPlan'); await tap(p, 'plan:ball'); await tap(p, 'startTest');
    await idle(p);   // the cannon rolls back to the start line first
    s = await st(p); eq([s.phase, s.planKey], ['test', 'ball'], 'testing');
    ok(await p.evaluate(() => window.__dbg.panel.spec.blocks.some((b) => b.p && b.p.includes('pull the trigger'))), 'in the headset, the panel says to point and pull the trigger');
    const at = await p.evaluate(() => window.__dbg.trackWorld(30));
    await aim(p, CP, at); await trigger(p);
    s = await st(p); near(s.predCm, 30, 4, 'pointing at the track places the prediction flag');
    ok(await p.evaluate(() => window.__dbg.L.predFlag.visible), 'flag shows');
    await tap(p, 'fire'); await idle(p);
    s = await st(p); eq(Object.values(s.data)[0].length, 1, 'one trial recorded'); ok(s.loupe && s.awaitRecord, 'magnifier, and "Record your results"');
    await tap(p, 'recorded'); await idle(p); ok(!(await st(p)).awaitRecord, '"I recorded it" works with the controller');
    eq(pageErrors(p), [], 'page errors'); eq(p.offsite, [], 'requests to other sites');
    await p.close();
  }, { slow: true });

  test('half size: point at the floor to place it, Spanish from Options, exit', async () => {
    const p = await page({ xr: true });
    await ready(p, '?size=half');
    await p.click('#btn-ar'); await p.waitForFunction(() => window.__dbg.state().placing, null, { timeout: 60000 });
    let s = await st(p); eq([s.placing, s.labVisible], [true, false], 'asks the student to point at the floor');
    ok(await p.evaluate(() => window.__dbg.hint.mesh.visible), 'with a hint');
    await aim(p, CP, [0, 0, -2.2]); await trigger(p);
    s = await st(p); eq([s.placing, s.labVisible], [false, true], 'placed');
    const pos = await p.evaluate(() => [window.__dbg.lab.position.toArray(), window.__dbg.lab.scale.x]);
    near(pos[1], 0.5, 1e-6, 'half scale'); near(pos[0][1], 0, 0.01, 'on the floor');
    await tap(p, 'options'); await tap(p, 'lang:es');
    ok(await p.evaluate(() => window.__dbg.panel.spec.title === 'Opciones'), 'Spanish');
    await tap(p, 'acc:big'); await sleep(2500);   // the bigger panel glides to a new spot above the lab
    near(await p.evaluate(() => window.__dbg.panel.zoom), 1.3, 1e-6, 'Bigger text makes the panel bigger');
    await tap(p, 'size:life'); s = await st(p); eq([s.size, s.placing], ['life', true], 'changing the size asks to place it again');
    await aim(p, CP, [0, 0, -3]); await trigger(p);
    near(await p.evaluate(() => window.__dbg.lab.scale.x), 1, 1e-6, 'life size');
    await tap(p, 'exit'); await sleep(1500);
    eq((await st(p)).mode, 'desktop', 'Exit leaves the headset view');
    ok(await p.evaluate(() => !document.getElementById('start').hidden), 'back to the start page');
    eq(pageErrors(p), [], 'page errors');
    await p.close();
  }, { slow: true });

  test('taking the headset off: a lost anchor comes back from the headset\'s saved copy, in the same spot', async () => {
    const p = await page({ xr: true, xrInit: ANCHOR_TOOLS });
    await ready(p);
    await p.click('#btn-ar'); await sleep(3000);
    let a = await p.evaluate(() => window.__dbg.anchorState());
    ok(a.anchor && a.saved, 'the lab is pinned with an anchor, and a copy is saved on the headset: ' + JSON.stringify(a));
    const before = await labPose(p);
    await p.evaluate(() => { window.__deadAnchor = window.__dbg.anchorObj(); });   // the headset slept: the anchor is lost
    await sleep(6000);
    a = await p.evaluate(() => window.__dbg.anchorState());
    const after = await labPose(p), s = await st(p);
    ok(!s.placing && s.labVisible, 'no need to place it again');
    ok(a.anchor && a.restores >= 1, 'restored from the saved copy: ' + JSON.stringify(a));
    eq(a.replaced, 0, 'it was not simply put back in front of the student');
    ok(after.p.every((v, i) => Math.abs(v - before.p[i]) < 0.02), `same spot (before ${before.p.map((v) => v.toFixed(2))}, after ${after.p.map((v) => v.toFixed(2))})`);
    near(after.r, before.r, 0.05, 'same turn');
    await p.close();
  }, { slow: true });

  test('recentring: the lab stays put on the real desk', async () => {
    const p = await page({ xr: true, xrInit: ANCHOR_TOOLS });
    await ready(p);
    await p.click('#btn-ar'); await sleep(3000);
    ok((await p.evaluate(() => window.__dbg.anchorState())).anchor, 'pinned');
    await p.evaluate(() => { const d = window.__xr; d.position.set(0.3, 1.2, -0.2); const a = 0.6; d.quaternion.set(0, Math.sin(a / 2), 0, Math.cos(a / 2)); }); await sleep(600);
    const rel = () => p.evaluate(() => { const D = window.__dbg; return D.lab.position.clone().sub(D.camera.position).applyQuaternion(D.camera.quaternion.clone().invert()).toArray(); });
    const before = await rel();
    await p.evaluate(() => { const { THREE } = window.__dbg, d = window.__xr;
      const W = new THREE.Matrix4().makeRotationY(-0.6).setPosition(-0.4, 0, 0.7);
      const H = new THREE.Matrix4().compose(new THREE.Vector3(d.position.x, d.position.y, d.position.z), new THREE.Quaternion(d.quaternion.x, d.quaternion.y, d.quaternion.z, d.quaternion.w), new THREE.Vector3(1, 1, 1)).premultiply(W);
      const pp = new THREE.Vector3(), qq = new THREE.Quaternion(), ss = new THREE.Vector3(); H.decompose(pp, qq, ss);
      d.position.set(pp.x, pp.y, pp.z); d.quaternion.set(qq.x, qq.y, qq.z, qq.w); window.__W = W; });
    await sleep(1200);
    const after = await rel();
    ok(before.every((v, i) => Math.abs(v - after[i]) < 0.03), `kept its place in the room (before ${before.map((v) => v.toFixed(2))}, after ${after.map((v) => v.toFixed(2))})`);
    await p.close();
  }, { slow: true });

  test('the lanyard: grip button at the handle, and a pinch right at the handle, both pull it', async () => {
    const p = await page({ xr: true });
    await ready(p, '?path=full');
    await p.click('#btn-ar'); await sleep(2500);
    const h = await p.evaluate(() => window.__dbg.handleWorld());
    // grip (squeeze) with the controller held at the handle
    await p.evaluate((h) => { const c = window.__xr.controllers.right; c.position.set(h[0], h[1], h[2] + 0.03); c.quaternion.set(0, 0, 0, 1); }, h); await sleep(400);
    ok(await p.evaluate(() => window.__dbg.L.handle.userData.glow.material.opacity > 0.4), 'the handle lights up when a hand is close enough to grab it');
    await p.evaluate(() => window.__xr.controllers.right.updateButtonValue('squeeze', 1)); await sleep(400);
    await p.evaluate(() => { const c = window.__xr.controllers.right; c.position.set(c.position.x, c.position.y - 0.05, c.position.z + 0.18); }); await sleep(500);
    eq((await st(p)).anim?.kind, 'live', 'gripping and pulling fires the cannon');
    await p.evaluate(() => window.__xr.controllers.right.updateButtonValue('squeeze', 0)); await idle(p);
    // a small tug that isn't far enough does nothing
    await tap(p, 'q3:same'); await tap(p, 'rp:done'); await tap(p, 'toPlan'); await tap(p, 'plan:powder'); await tap(p, 'startTest');
    await idle(p);   // the cannon rolls back to the start line first
    await p.evaluate(() => window.__dbg.predictCm(30));
    const h2 = await p.evaluate(() => window.__dbg.handleWorld());
    await p.evaluate((h) => { const c = window.__xr.controllers.right; c.position.set(h[0], h[1], h[2] + 0.02); c.quaternion.set(0, 0, 0, 1); }, h2); await sleep(400);
    await setTrigger(p, 1);   // a pinch / trigger right at the handle (not pointing from afar)
    await p.evaluate(() => { const c = window.__xr.controllers.right; c.position.set(c.position.x, c.position.y, c.position.z + 0.05); }); await sleep(400);
    eq((await st(p)).anim, null, 'a 5 cm nudge does not fire');
    await p.evaluate(() => { const c = window.__xr.controllers.right; c.position.set(c.position.x, c.position.y, c.position.z + 0.12); }); await sleep(500);
    eq((await st(p)).anim?.kind, 'live', 'a real tug does');
    await setTrigger(p, 0); await idle(p);
    eq(pageErrors(p), [], 'page errors');
    await p.close();
  }, { slow: true });

  test('moving by hand: grip the knob to slide the lab (it stays pinned there), point at the panel’s bar to move the panel', async () => {
    const p = await page({ xr: true });
    await ready(p);
    await p.click('#btn-ar'); await sleep(2500);
    let m = await p.evaluate(() => window.__dbg.movers()); eq([m.knob, m.bar, m.dock], [true, true, 'above'], 'the knob and the bar show');
    const ctl = (fn, arg) => p.evaluate(fn, arg);
    // grip at the knob, slide 25 cm to the right and 5 cm up (desk size can be lifted), let go
    const k = await p.evaluate(() => window.__dbg.knobWorld());
    const before = await labPose(p);
    await ctl((k) => { const c = window.__xr.controllers.right; c.position.set(k[0], k[1], k[2] + 0.03); c.quaternion.set(0, 0, 0, 1); }, k); await sleep(400);
    await ctl(() => window.__xr.controllers.right.updateButtonValue('squeeze', 1)); await sleep(400);
    eq((await p.evaluate(() => window.__dbg.movers())).grab, 'lab', 'gripping the knob grabs the lab');
    await ctl(() => { const c = window.__xr.controllers.right; c.position.set(c.position.x + 0.25, c.position.y + 0.05, c.position.z); }); await sleep(800);
    await ctl(() => window.__xr.controllers.right.updateButtonValue('squeeze', 0)); await sleep(1500);
    const k2 = await p.evaluate(() => window.__dbg.knobWorld()), after = await labPose(p);
    near(k2[0] - k[0], 0.25, 0.04, 'the knob followed the hand sideways');
    near(after.p[1] - before.p[1], 0.05, 0.01, 'desk size: lifted 5 cm');
    ok(Math.abs(after.r - before.r) < 0.6, 'still roughly facing the student');
    const a = await p.evaluate(() => window.__dbg.anchorState()); eq(a.anchor, 'ok', 'pinned again where it was let go');
    // the lab stays there (recentring and walking don't undo it)
    await sleep(800); near((await labPose(p)).p[0], after.p[0], 0.002, 'it stays put');
    // point at the panel's bar from here and drag it 30 cm left
    const b = await p.evaluate(() => window.__dbg.barWorld());
    await aim(p, CP, b); await setTrigger(p, 1);
    eq((await p.evaluate(() => window.__dbg.movers())).grab, 'panel', 'pointing at the bar grabs the panel');
    await ctl(([b]) => { const { THREE } = window.__dbg, c = window.__xr.controllers.right; const to = new THREE.Vector3(b[0] - 0.3, b[1], b[2]);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(c.position.clone(), to, new THREE.Vector3(0, 1, 0))); c.quaternion.set(q.x, q.y, q.z, q.w); }, [b]); await sleep(800);
    await setTrigger(p, 0); await sleep(400);
    const b2 = await p.evaluate(() => window.__dbg.barWorld());
    ok(b2[0] < b[0] - 0.15, `the panel moved left: ${b[0].toFixed(2)} → ${b2[0].toFixed(2)}`);
    eq((await p.evaluate(() => window.__dbg.movers())).dock, 'user', 'and stays where the student put it');
    await tap(p, 'fire'); eq((await st(p)).anim?.kind, 'live', 'its buttons still work there'); await idle(p);
    const b3 = await p.evaluate(() => window.__dbg.barWorld());
    near(b3[0], b2[0], 0.01, 'it stayed put while the content changed');
    eq(pageErrors(p), [], 'page errors');
    await p.close();
  }, { slow: true });

  test('moving by hand at half size: point at the knob and drag the lab across the floor', async () => {
    const p = await page({ xr: true });
    await ready(p, '?size=half');
    await p.click('#btn-ar'); await sleep(2500);
    await p.waitForFunction(() => window.__dbg.state().placing, null, { timeout: 60000 });
    await aim(p, CP, [0, 0, -2.2]); await trigger(p); await sleep(800);
    const k = await p.evaluate(() => window.__dbg.knobWorld()), y0 = (await labPose(p)).p[1];
    ok(k[1] > 0.7 && k[1] < 1.0, 'the knob floats at waist height: ' + k[1].toFixed(2));
    await aim(p, CP, k); await setTrigger(p, 1);
    eq((await p.evaluate(() => window.__dbg.movers())).grab, 'lab', 'pointing at the knob grabs the lab');
    await aim(p, CP, [k[0] + 0.5, k[1], k[2] + 0.3]); await sleep(400);
    await setTrigger(p, 0); await sleep(1500);
    const k2 = await p.evaluate(() => window.__dbg.knobWorld()), after = await labPose(p);
    ok(Math.hypot(k2[0] - k[0], k2[2] - k[2]) > 0.3, 'the lab slid across the floor');
    near(after.p[1], y0, 0.001, 'and stayed on the floor');
    eq((await p.evaluate(() => window.__dbg.anchorState())).anchor, 'ok', 'pinned again');
    eq(pageErrors(p), [], 'page errors');
    await p.close();
  }, { slow: true });

  test('the panel never covers the cannon (desk, half and life size, tallest screen)', async () => {
    for (const size of ['desk', 'half', 'life']) {
      const p = await page({ xr: true });
      await ready(p, '?path=full&size=' + size);
      await p.click('#btn-ar'); await sleep(2500);
      if (size !== 'desk') { await p.waitForFunction(() => window.__dbg.state().placing, null, { timeout: 60000 }); await aim(p, CP, [0, 0, size === 'life' ? -3 : -2.2]); await trigger(p); }
      ok((await st(p)).labVisible, size + ': placed');
      await press(p, 'fire'); await idle(p); await press(p, 'q3:same'); await press(p, 'rp:done'); await press(p, 'toPlan'); await press(p, 'plan:cannon'); await press(p, 'startTest');
      await p.evaluate(() => window.__dbg.predictCm(30)); await press(p, 'fire'); await idle(p); await sleep(1500);
      const o = await p.evaluate(() => window.__dbg.panelHits());
      ok(!o.overlap, `${size}: panel and lab overlap in view: ${JSON.stringify(o)}`);
      await p.close();
    }
  }, { slow: true });
};
