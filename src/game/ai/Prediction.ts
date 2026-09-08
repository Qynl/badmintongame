import { Vector3 } from 'three';
import { integrateFlight } from '../physics/Aerodynamics';
export interface Prediction { position: Vector3; landing: Vector3; time: number; reachable: boolean }
export function predictFlight(position: Vector3, velocity: Vector3, side: 1 | -1 = -1): Prediction {
  const p = position.clone(), v = velocity.clone();
  let intercept: Vector3 | null = null, time = 0;
  for (let i = 0; i < 480; i++) {
    integrateFlight(p, v, 1 / 90);
    if (!intercept && p.z * side > 0.6 && p.y < 2.25 && v.y < 0) { intercept = p.clone(); time = (i + 1) / 90; }
    if (p.y <= 0) break;
  }
  return { position: intercept || p.clone(), landing: p.clone(), time, reachable: intercept !== null };
}
export function solveLaunch(from: Vector3, to: Vector3, loft: number): Vector3 {
  // Shooting method compensates for shuttle drag rather than using a ballistic parabola.
  const horizontal = new Vector3(to.x - from.x, 0, to.z - from.z);
  const distance = horizontal.length(); horizontal.normalize();
  let low = 2, high = 80;
  const test = new Vector3(), p = new Vector3();
  for (let k = 0; k < 16; k++) {
    const speed = (low + high) * 0.5;
    test.copy(horizontal).multiplyScalar(speed); test.y = loft;
    p.copy(from);
    for (let i = 0; i < 500; i++) { integrateFlight(p, test, 1 / 120); if (p.y <= to.y && test.y < 0) break; }
    const travelled = Math.hypot(p.x - from.x, p.z - from.z);
    if (travelled < distance) low = speed; else high = speed;
  }
  horizontal.multiplyScalar((low + high) * 0.5); horizontal.y = loft; return horizontal;
}

export interface FlightSample { landing: Vector3; netY: number | null; flightTime: number }
export function sampleFlight(from: Vector3, velocity: Vector3): FlightSample {
  const p = from.clone(), v = velocity.clone();
  let netY: number | null = null, flightTime = 0;
  for (let i = 0; i < 720; i++) {
    const lastY = p.y, lastZ = p.z;
    integrateFlight(p, v, 1 / 120); flightTime += 1 / 120;
    if (lastZ * p.z <= 0 && lastZ !== p.z && netY === null) netY = lastY + (p.y - lastY) * lastZ / (lastZ - p.z);
    if (p.y <= 0) break;
  }
  return { landing: p, netY, flightTime };
}
/** Increase loft only when necessary to clear the net; solve before impact, never steer in flight. */
export function planReturn(from: Vector3, target: Vector3, preferredLoft: number, clearance = 0.16) {
  let velocity = solveLaunch(from, target, preferredLoft);
  let sample = sampleFlight(from, velocity);
  for (let attempt = 1; attempt <= 12; attempt++) {
    if (sample.netY !== null && sample.netY >= 1.55 + clearance && sample.landing.distanceTo(target) < 0.4) break;
    velocity = solveLaunch(from, target, preferredLoft + attempt * 1.25);
    sample = sampleFlight(from, velocity);
  }
  return { velocity, ...sample };
}

/** Aim at a reachable descending contact point, not a floor point that can sail over the receiver. */
export function planIntercept(from: Vector3, contact: Vector3, loft: number) {
  let velocity = solveLaunch(from, contact, loft), sample = sampleFlight(from, velocity);
  for (let attempt = 1; attempt <= 8 && (sample.netY === null || sample.netY < 1.72); attempt++) {
    velocity = solveLaunch(from, contact, loft + attempt * 1.5); sample = sampleFlight(from, velocity);
  }
  return { velocity, ...sample };
}
