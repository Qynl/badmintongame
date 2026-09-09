import { POS } from './constants.js';
import { clamp } from './math.js';

// ---------------------------------------------------------------------------
// Player attributes. All ratings are 1..99 like a real scouting scale.
// They feed directly into physics limits and AI decision quality -- the AI
// never cheats by exceeding what its attributes allow.
// ---------------------------------------------------------------------------

export const ATTRS = [
  'pace',          // top speed
  'acceleration',  // how fast they reach it
  'agility',       // turning rate, change of direction
  'stamina',       // fatigue resistance
  'strength',      // shielding, duels, holding off
  'passing',       // accuracy + weight of pass
  'vision',        // how far / how creatively they see options
  'technique',     // first touch, dribble control
  'dribbling',     // close control at speed
  'shooting',      // shot power and accuracy
  'finishing',     // composure in the box
  'tackling',      // clean challenges
  'marking',       // staying tight, denying space
  'interception',  // reading passes
  'positioning',   // being in the right place off the ball
  'decisions',     // choosing the right action
  'teamwork',      // following tactical instructions
  'workrate',      // pressing intensity, distance covered
  'composure',     // performance under pressure
  'reactions',     // response latency
  'aggression',    // committing to challenges, foul risk
  'heading',
  'reflexes',      // GK
  'handling',      // GK
  'gkPositioning', // GK
];

// Positional templates: mean values per attribute for a "typical" player.
const TEMPLATES = {
  GK: { pace: 55, acceleration: 55, agility: 68, stamina: 60, strength: 72, passing: 58, vision: 55, technique: 55, dribbling: 35, shooting: 25, finishing: 20, tackling: 25, marking: 30, interception: 45, positioning: 55, decisions: 70, teamwork: 65, workrate: 50, composure: 72, reactions: 80, aggression: 40, heading: 45, reflexes: 78, handling: 76, gkPositioning: 78 },
  CB: { pace: 66, acceleration: 64, agility: 60, stamina: 72, strength: 82, passing: 66, vision: 60, technique: 62, dribbling: 52, shooting: 45, finishing: 40, tackling: 82, marking: 82, interception: 78, positioning: 79, decisions: 74, teamwork: 76, workrate: 70, composure: 72, reactions: 72, aggression: 72, heading: 82, reflexes: 20, handling: 20, gkPositioning: 20 },
  LB: { pace: 79, acceleration: 78, agility: 74, stamina: 84, strength: 66, passing: 71, vision: 68, technique: 70, dribbling: 70, shooting: 55, finishing: 48, tackling: 72, marking: 72, interception: 71, positioning: 72, decisions: 70, teamwork: 78, workrate: 84, composure: 68, reactions: 71, aggression: 62, heading: 60, reflexes: 20, handling: 20, gkPositioning: 20 },
  RB: { pace: 79, acceleration: 78, agility: 74, stamina: 84, strength: 66, passing: 71, vision: 68, technique: 70, dribbling: 70, shooting: 55, finishing: 48, tackling: 72, marking: 72, interception: 71, positioning: 72, decisions: 70, teamwork: 78, workrate: 84, composure: 68, reactions: 71, aggression: 62, heading: 60, reflexes: 20, handling: 20, gkPositioning: 20 },
  DM: { pace: 68, acceleration: 68, agility: 70, stamina: 84, strength: 76, passing: 78, vision: 76, technique: 74, dribbling: 66, shooting: 60, finishing: 50, tackling: 79, marking: 76, interception: 82, positioning: 80, decisions: 79, teamwork: 82, workrate: 82, composure: 76, reactions: 75, aggression: 70, heading: 68, reflexes: 20, handling: 20, gkPositioning: 20 },
  CM: { pace: 71, acceleration: 71, agility: 76, stamina: 86, strength: 68, passing: 82, vision: 80, technique: 80, dribbling: 74, shooting: 68, finishing: 58, tackling: 68, marking: 64, interception: 70, positioning: 74, decisions: 80, teamwork: 80, workrate: 84, composure: 78, reactions: 76, aggression: 60, heading: 58, reflexes: 20, handling: 20, gkPositioning: 20 },
  AM: { pace: 76, acceleration: 78, agility: 84, stamina: 74, strength: 60, passing: 84, vision: 86, technique: 86, dribbling: 84, shooting: 78, finishing: 72, tackling: 48, marking: 45, interception: 55, positioning: 70, decisions: 80, teamwork: 66, workrate: 66, composure: 80, reactions: 80, aggression: 46, heading: 52, reflexes: 20, handling: 20, gkPositioning: 20 },
  LW: { pace: 87, acceleration: 88, agility: 86, stamina: 78, strength: 58, passing: 74, vision: 74, technique: 84, dribbling: 87, shooting: 76, finishing: 72, tackling: 42, marking: 42, interception: 50, positioning: 70, decisions: 72, teamwork: 66, workrate: 72, composure: 74, reactions: 80, aggression: 48, heading: 50, reflexes: 20, handling: 20, gkPositioning: 20 },
  RW: { pace: 87, acceleration: 88, agility: 86, stamina: 78, strength: 58, passing: 74, vision: 74, technique: 84, dribbling: 87, shooting: 76, finishing: 72, tackling: 42, marking: 42, interception: 50, positioning: 70, decisions: 72, teamwork: 66, workrate: 72, composure: 74, reactions: 80, aggression: 48, heading: 50, reflexes: 20, handling: 20, gkPositioning: 20 },
  ST: { pace: 84, acceleration: 85, agility: 78, stamina: 74, strength: 78, passing: 68, vision: 68, technique: 78, dribbling: 76, shooting: 84, finishing: 86, tackling: 38, marking: 38, interception: 46, positioning: 84, decisions: 74, teamwork: 62, workrate: 68, composure: 82, reactions: 84, aggression: 58, heading: 78, reflexes: 20, handling: 20, gkPositioning: 20 },
};

export function makeAttributes(position, quality, rng) {
  const t = TEMPLATES[position] || TEMPLATES.CM;
  const out = {};
  // quality is a -25..+25 style offset from the template baseline.
  for (const k of ATTRS) {
    const base = t[k] ?? 50;
    const isGk = k === 'reflexes' || k === 'handling' || k === 'gkPositioning';
    const relevant = position === POS.GK ? true : !isGk;
    const q = relevant ? quality : 0;
    out[k] = clamp(Math.round(base + q + rng.gauss(0, 6)), 12, 99);
  }
  return out;
}

// Overall rating: weighted by what matters for the position.
const OVR_WEIGHTS = {
  GK: { reflexes: 3, handling: 3, gkPositioning: 3, decisions: 1.5, composure: 1, reactions: 1.5, passing: 0.5 },
  CB: { marking: 2.5, tackling: 2.5, positioning: 2, heading: 1.5, strength: 1.5, interception: 2, decisions: 1.5, passing: 1, pace: 1 },
  LB: { pace: 2, stamina: 1.5, marking: 1.5, tackling: 1.5, passing: 1.5, workrate: 1.5, positioning: 1.5, dribbling: 1 },
  RB: { pace: 2, stamina: 1.5, marking: 1.5, tackling: 1.5, passing: 1.5, workrate: 1.5, positioning: 1.5, dribbling: 1 },
  DM: { interception: 2.5, positioning: 2, tackling: 2, passing: 2, decisions: 2, stamina: 1.5, teamwork: 1.5 },
  CM: { passing: 2.5, vision: 2, technique: 2, stamina: 2, decisions: 2, workrate: 1.5, dribbling: 1 },
  AM: { vision: 2.5, passing: 2.5, technique: 2.5, dribbling: 2, decisions: 2, shooting: 1.5, agility: 1.5 },
  LW: { pace: 2.5, dribbling: 2.5, acceleration: 2, technique: 2, finishing: 1.5, agility: 1.5, passing: 1 },
  RW: { pace: 2.5, dribbling: 2.5, acceleration: 2, technique: 2, finishing: 1.5, agility: 1.5, passing: 1 },
  ST: { finishing: 3, shooting: 2.5, positioning: 2.5, pace: 2, composure: 1.5, strength: 1.5, heading: 1.5 },
};

export function overall(attrs, position) {
  const w = OVR_WEIGHTS[position] || OVR_WEIGHTS.CM;
  let sum = 0;
  let tot = 0;
  for (const k in w) {
    sum += (attrs[k] ?? 50) * w[k];
    tot += w[k];
  }
  return Math.round(sum / tot);
}
