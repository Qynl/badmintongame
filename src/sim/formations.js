import { POS } from './constants.js';

// ---------------------------------------------------------------------------
// Formations are expressed in normalised pitch space:
//   x: 0 = own goal line, 1 = opponent goal line
//   z: 0 = left touchline, 1 = right touchline (from the team's own view)
// The tactics layer then stretches/compresses this shape based on ball
// position, phase of play and instructions.
// ---------------------------------------------------------------------------

export const FORMATIONS = {
  '4-3-3': {
    name: '4-3-3',
    style: 'Possession',
    slots: [
      { pos: POS.GK, x: 0.045, z: 0.5, role: 'sweeper-keeper' },
      { pos: POS.RB, x: 0.24, z: 0.14, role: 'attacking-fb' },
      { pos: POS.CB, x: 0.17, z: 0.37, role: 'ball-playing' },
      { pos: POS.CB, x: 0.17, z: 0.63, role: 'stopper' },
      { pos: POS.LB, x: 0.24, z: 0.86, role: 'attacking-fb' },
      { pos: POS.DM, x: 0.36, z: 0.5, role: 'anchor' },
      { pos: POS.CM, x: 0.50, z: 0.30, role: 'box-to-box' },
      { pos: POS.CM, x: 0.50, z: 0.70, role: 'playmaker' },
      { pos: POS.RW, x: 0.74, z: 0.13, role: 'inside-forward' },
      { pos: POS.ST, x: 0.80, z: 0.5, role: 'complete-forward' },
      { pos: POS.LW, x: 0.74, z: 0.87, role: 'winger' },
    ],
  },
  '4-4-2': {
    name: '4-4-2',
    style: 'Balanced',
    slots: [
      { pos: POS.GK, x: 0.045, z: 0.5, role: 'keeper' },
      { pos: POS.RB, x: 0.22, z: 0.15, role: 'fullback' },
      { pos: POS.CB, x: 0.16, z: 0.38, role: 'stopper' },
      { pos: POS.CB, x: 0.16, z: 0.62, role: 'cover' },
      { pos: POS.LB, x: 0.22, z: 0.85, role: 'fullback' },
      { pos: POS.RW, x: 0.50, z: 0.13, role: 'wide-mid' },
      { pos: POS.CM, x: 0.42, z: 0.40, role: 'holding' },
      { pos: POS.CM, x: 0.48, z: 0.60, role: 'box-to-box' },
      { pos: POS.LW, x: 0.50, z: 0.87, role: 'wide-mid' },
      { pos: POS.ST, x: 0.76, z: 0.40, role: 'poacher' },
      { pos: POS.ST, x: 0.76, z: 0.60, role: 'target-man' },
    ],
  },
  '4-2-3-1': {
    name: '4-2-3-1',
    style: 'Control',
    slots: [
      { pos: POS.GK, x: 0.045, z: 0.5, role: 'keeper' },
      { pos: POS.RB, x: 0.23, z: 0.14, role: 'attacking-fb' },
      { pos: POS.CB, x: 0.16, z: 0.38, role: 'ball-playing' },
      { pos: POS.CB, x: 0.16, z: 0.62, role: 'stopper' },
      { pos: POS.LB, x: 0.23, z: 0.86, role: 'attacking-fb' },
      { pos: POS.DM, x: 0.36, z: 0.38, role: 'anchor' },
      { pos: POS.DM, x: 0.36, z: 0.62, role: 'deep-playmaker' },
      { pos: POS.RW, x: 0.62, z: 0.14, role: 'inside-forward' },
      { pos: POS.AM, x: 0.63, z: 0.5, role: 'playmaker' },
      { pos: POS.LW, x: 0.62, z: 0.86, role: 'winger' },
      { pos: POS.ST, x: 0.80, z: 0.5, role: 'complete-forward' },
    ],
  },
  '3-5-2': {
    name: '3-5-2',
    style: 'Wing-play',
    slots: [
      { pos: POS.GK, x: 0.045, z: 0.5, role: 'keeper' },
      { pos: POS.CB, x: 0.17, z: 0.28, role: 'wide-cb' },
      { pos: POS.CB, x: 0.14, z: 0.5, role: 'sweeper' },
      { pos: POS.CB, x: 0.17, z: 0.72, role: 'wide-cb' },
      { pos: POS.RB, x: 0.46, z: 0.08, role: 'wingback' },
      { pos: POS.DM, x: 0.36, z: 0.5, role: 'anchor' },
      { pos: POS.CM, x: 0.50, z: 0.33, role: 'box-to-box' },
      { pos: POS.CM, x: 0.52, z: 0.67, role: 'playmaker' },
      { pos: POS.LB, x: 0.46, z: 0.92, role: 'wingback' },
      { pos: POS.ST, x: 0.76, z: 0.41, role: 'poacher' },
      { pos: POS.ST, x: 0.76, z: 0.59, role: 'target-man' },
    ],
  },
  '5-3-2': {
    name: '5-3-2',
    style: 'Counter',
    slots: [
      { pos: POS.GK, x: 0.045, z: 0.5, role: 'keeper' },
      { pos: POS.RB, x: 0.24, z: 0.11, role: 'wingback' },
      { pos: POS.CB, x: 0.14, z: 0.30, role: 'wide-cb' },
      { pos: POS.CB, x: 0.12, z: 0.5, role: 'sweeper' },
      { pos: POS.CB, x: 0.14, z: 0.70, role: 'wide-cb' },
      { pos: POS.LB, x: 0.24, z: 0.89, role: 'wingback' },
      { pos: POS.DM, x: 0.34, z: 0.5, role: 'anchor' },
      { pos: POS.CM, x: 0.45, z: 0.30, role: 'box-to-box' },
      { pos: POS.CM, x: 0.45, z: 0.70, role: 'box-to-box' },
      { pos: POS.ST, x: 0.72, z: 0.40, role: 'poacher' },
      { pos: POS.ST, x: 0.70, z: 0.60, role: 'target-man' },
    ],
  },
  '4-1-4-1': {
    name: '4-1-4-1',
    style: 'Compact',
    slots: [
      { pos: POS.GK, x: 0.045, z: 0.5, role: 'keeper' },
      { pos: POS.RB, x: 0.22, z: 0.14, role: 'fullback' },
      { pos: POS.CB, x: 0.15, z: 0.38, role: 'stopper' },
      { pos: POS.CB, x: 0.15, z: 0.62, role: 'cover' },
      { pos: POS.LB, x: 0.22, z: 0.86, role: 'fullback' },
      { pos: POS.DM, x: 0.33, z: 0.5, role: 'anchor' },
      { pos: POS.RW, x: 0.55, z: 0.15, role: 'wide-mid' },
      { pos: POS.CM, x: 0.50, z: 0.39, role: 'box-to-box' },
      { pos: POS.CM, x: 0.50, z: 0.61, role: 'playmaker' },
      { pos: POS.LW, x: 0.55, z: 0.85, role: 'wide-mid' },
      { pos: POS.ST, x: 0.78, z: 0.5, role: 'target-man' },
    ],
  },
};

export const FORMATION_KEYS = Object.keys(FORMATIONS);

// Tactical instruction presets. Each value is 0..1 unless noted.
export function defaultTactics(formationKey = '4-3-3') {
  const f = FORMATIONS[formationKey];
  return {
    formation: formationKey,
    mentality: 0.5,      // 0 = ultra defensive, 1 = all-out attack
    defensiveLine: 0.5,  // 0 = deep block, 1 = very high line
    pressing: 0.5,       // 0 = contain, 1 = gegenpress
    width: 0.5,          // 0 = narrow, 1 = very wide
    tempo: 0.5,          // 0 = slow build, 1 = fast direct
    directness: 0.4,     // 0 = short passing, 1 = long ball
    compactness: 0.5,    // vertical distance between units
    counter: 0.5,        // eagerness to break at speed
    style: f?.style ?? 'Balanced',
  };
}

export const PRESETS = {
  'Tiki-Taka': { mentality: 0.62, defensiveLine: 0.72, pressing: 0.78, width: 0.62, tempo: 0.45, directness: 0.15, compactness: 0.72, counter: 0.3 },
  'Gegenpress': { mentality: 0.7, defensiveLine: 0.8, pressing: 0.95, width: 0.55, tempo: 0.8, directness: 0.4, compactness: 0.8, counter: 0.75 },
  'Counter-Attack': { mentality: 0.35, defensiveLine: 0.28, pressing: 0.3, width: 0.4, tempo: 0.72, directness: 0.68, compactness: 0.68, counter: 0.95 },
  'Balanced': { mentality: 0.5, defensiveLine: 0.5, pressing: 0.5, width: 0.5, tempo: 0.5, directness: 0.4, compactness: 0.5, counter: 0.5 },
  'Park The Bus': { mentality: 0.15, defensiveLine: 0.12, pressing: 0.2, width: 0.3, tempo: 0.4, directness: 0.8, compactness: 0.9, counter: 0.5 },
  'Wing Play': { mentality: 0.58, defensiveLine: 0.52, pressing: 0.55, width: 0.92, tempo: 0.62, directness: 0.5, compactness: 0.45, counter: 0.55 },
  'Direct': { mentality: 0.6, defensiveLine: 0.55, pressing: 0.6, width: 0.6, tempo: 0.85, directness: 0.85, compactness: 0.5, counter: 0.7 },
  'All-Out Attack': { mentality: 0.95, defensiveLine: 0.85, pressing: 0.85, width: 0.7, tempo: 0.9, directness: 0.6, compactness: 0.4, counter: 0.6 },
};
