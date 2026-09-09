import { Player } from './player.js';
import { makeAttributes, overall } from './attributes.js';
import { FORMATIONS, defaultTactics, PRESETS } from './formations.js';
import { POS } from './constants.js';
import { FIRST_NAMES, LAST_NAMES, NATIONS } from '../data/names.js';
import { clamp } from './math.js';

// Bench composition: enough cover for every unit.
const BENCH_TEMPLATE = [POS.GK, POS.CB, POS.LB, POS.DM, POS.CM, POS.AM, POS.LW, POS.ST, POS.CB];

export function makePlayer(team, position, quality, rng, shirt, opts = {}) {
  const attrs = makeAttributes(position, quality, rng);
  const first = opts.firstName ?? rng.pick(FIRST_NAMES);
  const last = opts.lastName ?? rng.pick(LAST_NAMES);
  const p = new Player({
    team,
    name: opts.name ?? `${first[0]}. ${last}`,
    fullName: `${first} ${last}`,
    shirt,
    position,
    role: opts.role,
    attrs,
    slotX: opts.slotX ?? 0.5,
    slotZ: opts.slotZ ?? 0.5,
    footedness: opts.footedness ?? (rng.chance(0.22) ? 'L' : 'R'),
    age: opts.age ?? rng.int(18, 35),
  });
  p.fullName = `${first} ${last}`;
  p.firstName = first;
  p.lastName = last;
  p.nation = opts.nation ?? rng.pick(NATIONS);
  p.value = Math.round(Math.pow(Math.max(1, p.ovr - 40), 2.35) * 1200 * (p.age < 24 ? 1.45 : p.age > 30 ? 0.5 : 1));
  p.form = opts.form ?? 0.5;
  p.morale = opts.morale ?? 0.6;
  return p;
}

export function makeTeam(clubData, teamIndex, rng, opts = {}) {
  const formationKey = opts.formation ?? rng.pick(['4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '4-1-4-1']);
  const formation = FORMATIONS[formationKey];
  const baseQuality = (clubData.rating - 72) * 1.0;

  const players = [];
  let shirtNo = 1;
  formation.slots.forEach((slot, i) => {
    const q = baseQuality + rng.gauss(0, 3.5);
    const p = makePlayer(teamIndex, slot.pos, q, rng, shirtNo++, {
      role: slot.role,
      slotX: slot.x,
      slotZ: slot.z,
    });
    players.push(p);
  });

  const bench = BENCH_TEMPLATE.map((pos) => {
    const q = baseQuality - 5 + rng.gauss(0, 4);
    const slot = formation.slots.find(s => s.pos === pos) ??
                 formation.slots.find(s => s.pos !== POS.GK);
    return makePlayer(teamIndex, pos, q, rng, shirtNo++, {
      role: slot?.role,
      slotX: slot?.x ?? 0.5,
      slotZ: slot?.z ?? 0.5,
    });
  });

  const tactics = defaultTactics(formationKey);
  // Give each club a tactical identity.
  const presetName = opts.preset ?? pickPreset(clubData, rng);
  Object.assign(tactics, PRESETS[presetName]);
  tactics.formation = formationKey;
  tactics.presetName = presetName;

  return {
    name: clubData.name,
    shortName: clubData.short,
    colors: clubData.colors,
    rating: clubData.rating,
    city: clubData.city,
    players,
    bench,
    tactics,
    isHumanControlled: !!opts.isHumanControlled,
  };
}

function pickPreset(clubData, rng) {
  const names = Object.keys(PRESETS);
  if (clubData.rating >= 80) return rng.pick(['Tiki-Taka', 'Gegenpress', 'Balanced', 'Wing Play']);
  if (clubData.rating >= 72) return rng.pick(['Balanced', 'Wing Play', 'Direct', 'Gegenpress']);
  return rng.pick(['Counter-Attack', 'Park The Bus', 'Direct', 'Balanced']);
}

// Re-assign slots when the formation changes mid-match.
export function applyFormationToTeam(teamState, formationKey) {
  const formation = FORMATIONS[formationKey];
  if (!formation) return false;
  const players = teamState.players;
  const gk = players.find(p => p.isGK);
  const outfield = players.filter(p => !p.isGK);
  const slots = formation.slots.filter(s => s.pos !== POS.GK);

  // Assign each slot the best-suited available player.
  const used = new Set();
  const assigned = [];
  for (const slot of slots) {
    let best = null;
    let bestFit = -Infinity;
    for (const p of outfield) {
      if (used.has(p.id)) continue;
      let fit = 0;
      if (p.position === slot.pos) fit += 10;
      else if (unitOf(p.position) === unitOf(slot.pos)) fit += 5;
      // Prefer keeping players on their side of the pitch.
      fit -= Math.abs(p.slotZ - slot.z) * 4;
      fit -= Math.abs(p.slotX - slot.x) * 3;
      fit += p.ovr * 0.03;
      if (fit > bestFit) { bestFit = fit; best = p; }
    }
    if (best) { used.add(best.id); assigned.push({ p: best, slot }); }
  }
  for (const { p, slot } of assigned) {
    p.slotX = slot.x;
    p.slotZ = slot.z;
    p.role = slot.role;
  }
  if (gk) {
    gk.slotX = formation.slots[0].x;
    gk.slotZ = formation.slots[0].z;
  }
  teamState.tactics.formation = formationKey;
  return true;
}

function unitOf(pos) {
  if (pos === POS.GK) return 'keeper';
  if (pos === POS.CB || pos === POS.LB || pos === POS.RB) return 'defence';
  if (pos === POS.DM || pos === POS.CM || pos === POS.AM) return 'midfield';
  return 'attack';
}
