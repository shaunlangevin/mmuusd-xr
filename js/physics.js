// Cannon Recoil Lab: the physics, kept separate so it can be checked on its own (tests/physics.test.mjs).
// A simple one-direction model, accurate enough for Grade 6 (MS-PS2-2: qualitative, one variable at a time).
//
//  1. The powder comes in cloth cartridge bags (as in the Civil War), 0.4 kg each; each bag releases the same
//     energy (E_BAG). Three bags (1.2 kg) is about a real 12-pounder's full charge (2.5 lb).
//  2. The powder pushes the ball forward and the cannon backward with EQUAL force for the same time
//     (Newton's 3rd law), so they leave with equal and opposite momentum p.
//     Sharing the energy: E = p²/2m_ball + p²/2m_cannon  →  p = √(2E · m_ball · m_cannon / (m_ball + m_cannon))
//     (a heavier ball is harder to get moving, so the push lasts longer and p is bigger, as with real cannons)
//  3. The cannon rolls back at v = p / m_cannon until friction stops it: d = v² / (2 μ g).
//     Blocked wheels can't roll, so the carriage skids: much more friction, much shorter distance.
//  4. Real shots are never identical (no two bags of powder burn exactly the same), so each shot's
//     energy varies a little (about ±5%), and repeated trials land a few cm apart.

export const G = 9.8;
export const E_BAG = 174000;            // J per bag: 3 bags send a 5.4 kg iron ball out at about 440 m/s, like a real 12-pounder
export const MU = { rolling: 0.25, blocked: 0.9 };
export const SPREAD = 0.05;             // ±5% (one standard deviation) shot-to-shot variation in the powder

export const VARS = {
  ball:   [ { id: 'wood', kg: 0.6, color: 0xa87a4a }, { id: 'stone', kg: 2.3, color: 0x8d8a84 }, { id: 'iron', kg: 5.4, color: 0x2c2c2e } ],
  cannon: [ { id: 'c1000', kg: 1000, blocks: 0 }, { id: 'c1500', kg: 1500, blocks: 1 }, { id: 'c2000', kg: 2000, blocks: 2 } ],
  powder: [ { id: 'p1', bags: 1 }, { id: 'p2', bags: 2 }, { id: 'p3', bags: 3 } ],
  wheels: [ { id: 'rolling' }, { id: 'blocked' } ],
};
export const VAR_KEYS = ['ball', 'cannon', 'powder', 'wheels'];
// what stays the same when a variable isn't being tested
export const DEFAULTS = { ball: 'iron', cannon: 'c1500', powder: 'p2', wheels: 'rolling' };
export const level = (key, id) => VARS[key].find((l) => l.id === id);

// the expected (average) result for a set of choices; variation = 0
export function shot(settings, variation = 0) {
  const mb = level('ball', settings.ball).kg;
  const mc = level('cannon', settings.cannon).kg;
  const bags = level('powder', settings.powder).bags;
  const mu = MU[settings.wheels];
  const E = E_BAG * bags * (1 + variation);
  const p = Math.sqrt((2 * E * mb * mc) / (mb + mc));
  const vBall = p / mb, vCannon = p / mc;
  const d = (vCannon * vCannon) / (2 * mu * G);          // metres
  const tStop = vCannon / (mu * G);                       // seconds
  return { mb, mc, bags, mu, E, p, vBall, vCannon, d, tStop, variation };
}

// a normal-ish random number (mean 0, sd 1), clipped so no shot is wildly off
export function gauss(rand = Math.random) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-2.4, Math.min(2.4, z));
}
export const trial = (settings, rand = Math.random) => shot(settings, SPREAD * gauss(rand));

// "Land it on the line": a target that some combination of settings reaches on average
export function challengeTarget(rand = Math.random) {
  const pick = (k) => VARS[k][Math.floor(rand() * VARS[k].length)].id;
  for (let i = 0; i < 50; i++) {
    const s = { ball: pick('ball'), cannon: pick('cannon'), powder: pick('powder'), wheels: 'rolling' };
    const cm = Math.round(shot(s).d * 100);
    if (cm >= 15 && cm <= 110) return { cm, settings: s };
  }
  return { cm: Math.round(shot(DEFAULTS).d * 100), settings: { ...DEFAULTS } };
}
// within the tolerance for the challenge (powder varies, so allow a little)
export const onTheLine = (cm, target) => Math.abs(cm - target) <= Math.max(4, target * 0.1);
