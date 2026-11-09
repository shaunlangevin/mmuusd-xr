// The physics model on its own: the numbers the design promises, and that each variable does what it should.
import { ok, near } from './lib/helpers.mjs';
import { shot, trial, DEFAULTS, VARS, challengeTarget, onTheLine } from '../js/physics.js';
import { handGrabbing } from '../js/grab.js';

const cm = (s) => shot(s).d * 100;
const with_ = (k, id) => ({ ...DEFAULTS, [k]: id });
function seeded(n) { let a = n >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export default (test) => {
  test('the defaults give about 34 cm, and the range is about 1 cm to 1.2 m', async () => {
    near(cm(DEFAULTS), 34, 1, 'defaults');
    near(cm({ ball: 'wood', cannon: 'c2000', powder: 'p1', wheels: 'rolling' }), 1.1, 0.3, 'smallest');
    near(cm({ ball: 'iron', cannon: 'c1000', powder: 'p3', wheels: 'rolling' }), 114, 3, 'largest');
    near(shot({ ...DEFAULTS, powder: 'p3' }).vBall, 440, 5, 'a full charge sends an iron ball out at about 440 m/s');
  });
  test('each variable changes the recoil the right way', async () => {
    const b = VARS.ball.map((l) => cm(with_('ball', l.id)));
    ok(b[0] < b[1] && b[1] < b[2], 'heavier ball → more recoil: ' + b.map(Math.round));
    const c = VARS.cannon.map((l) => cm(with_('cannon', l.id)));
    ok(c[0] > c[1] && c[1] > c[2], 'heavier cannon → less recoil: ' + c.map(Math.round));
    const p = VARS.powder.map((l) => cm(with_('powder', l.id)));
    near(p[1] / p[0], 2, 0.01, 'twice the powder → about twice the distance'); near(p[2] / p[0], 3, 0.01, 'three times');
    ok(cm(with_('wheels', 'blocked')) < cm(DEFAULTS) / 3, 'blocked wheels skid a short way');
  });
  test('equal and opposite: the ball and the cannon get the same momentum', async () => {
    const r = shot(DEFAULTS);
    near(r.mb * r.vBall, r.mc * r.vCannon, 1e-6, 'momentum');
  });
  test('trials vary a little, like real shots (about ±5%), never wildly', async () => {
    const rand = seeded(7), base = cm(DEFAULTS), xs = [...Array(400)].map(() => trial(DEFAULTS, rand).d * 100);
    const mean = xs.reduce((a, x) => a + x, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
    near(mean, base, 0.6, 'average of many trials'); near(sd / base, 0.05, 0.012, 'spread');
    ok(Math.max(...xs) < base * 1.13 && Math.min(...xs) > base * 0.87, 'no trial is more than 12% off');
    ok(new Set(xs.slice(0, 3).map(Math.round)).size > 1, 'three trials do not all read the same: ' + xs.slice(0, 3).map(Math.round));
  });
  test('challenge targets are reachable and the tolerance is fair', async () => {
    const rand = seeded(3);
    for (let i = 0; i < 40; i++) {
      const t = challengeTarget(rand);
      ok(t.cm >= 15 && t.cm <= 110, 'target in range: ' + t.cm);
      near(cm(t.settings), t.cm, 0.6, 'the settings that make the target');
    }
    ok(onTheLine(52, 50) && !onTheLine(58, 50) && onTheLine(17, 15), 'tolerance: ±10% or ±4 cm');
  });

  test('hand grip: a closed hand counts as gripping, an open or pinching hand does not', async () => {
    const at = (d) => ({ x: d, y: 0, z: 0 });
    const hand = (i, m, r) => ({ 'middle-finger-metacarpal': at(0), 'index-finger-tip': at(i), 'middle-finger-tip': at(m), 'ring-finger-tip': at(r) });
    ok(handGrabbing(hand(0.035, 0.03, 0.035)), 'fist');
    ok(!handGrabbing(hand(0.09, 0.095, 0.09)), 'open hand');
    ok(!handGrabbing(hand(0.06, 0.095, 0.09)), 'pinch (only the index curls) is not a grip');
    ok(handGrabbing(hand(0.065, 0.065, 0.06), true) && !handGrabbing(hand(0.065, 0.065, 0.06), false), 'it holds on until the hand clearly opens');
  });
};
