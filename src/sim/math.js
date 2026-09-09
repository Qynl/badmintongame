// ---------------------------------------------------------------------------
// Small allocation-free math helpers used across the simulation hot loop.
// ---------------------------------------------------------------------------

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function dist(ax, az, bx, bz) {
  return Math.sqrt(dist2(ax, az, bx, bz));
}

export function angleTo(fromX, fromZ, toX, toZ) {
  return Math.atan2(toZ - fromZ, toX - fromX);
}

export function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function approachAngle(current, target, maxDelta) {
  const d = angleDiff(target, current);
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

// Shortest distance from point p to the segment a-b, in the XZ plane.
export function pointSegmentDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (len2 < 1e-8) return dist(px, pz, ax, az);
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = clamp(t, 0, 1);
  return dist(px, pz, ax + abx * t, az + abz * t);
}

export function pointSegmentT(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (len2 < 1e-8) return 0;
  return clamp(((px - ax) * abx + (pz - az) * abz) / len2, 0, 1);
}

// Deterministic, seedable PRNG (mulberry32). Every match gets its own stream so
// replays of the same seed unfold identically, but different seeds diverge.
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.int = (lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  // Box-Muller, cached second sample.
  let spare = null;
  rng.gauss = (mean = 0, sd = 1) => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return mean + v * sd;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = rng() * 2 - 1;
      v = rng() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * mul;
    return mean + u * mul * sd;
  };
  return rng;
}

export function normalise(x, z) {
  const l = Math.hypot(x, z);
  if (l < 1e-6) return [0, 0, 0];
  return [x / l, z / l, l];
}
