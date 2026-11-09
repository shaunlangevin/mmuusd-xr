// Is a tracked hand making a fist (gripping)? Used so students can grab the lanyard handle with their
// whole hand, not only pinch it. WebXR has no "grab" event for hands, so we measure the joints:
// when the index, middle and ring fingertips are close to the palm, the hand is closed.
// Hysteresis (close below 5.5 cm, open again above 7.5 cm) stops it flickering on the boundary.
export const GRAB_CLOSE = 0.055, GRAB_OPEN = 0.075;
const TIPS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip'];
// joints: { name: {x,y,z} } (positions in metres); wasGrabbing: the previous answer
export function handGrabbing(joints, wasGrabbing = false) {
  const palm = joints['middle-finger-metacarpal'] || joints.wrist;
  if (!palm) return false;
  const ds = TIPS.map((n) => joints[n]).filter(Boolean).map((p) => Math.hypot(p.x - palm.x, p.y - palm.y, p.z - palm.z));
  if (ds.length < 2) return false;
  const avg = ds.reduce((a, d) => a + d, 0) / ds.length;
  return wasGrabbing ? avg < GRAB_OPEN : avg < GRAB_CLOSE;
}
