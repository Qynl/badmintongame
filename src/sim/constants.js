// ---------------------------------------------------------------------------
// Pitch, ball and rule constants. All units are metres / seconds / kilograms.
// The pitch is centred on the origin.  +X is the direction team 0 attacks.
// ---------------------------------------------------------------------------

export const PITCH = {
  length: 105,
  width: 68,
  halfLength: 52.5,
  halfWidth: 34,
  goalWidth: 7.32,
  goalHeight: 2.44,
  halfGoalWidth: 3.66,
  goalDepth: 2.0,
  penaltyAreaLength: 16.5, // from goal line
  penaltyAreaHalfWidth: 20.16,
  sixYardLength: 5.5,
  sixYardHalfWidth: 9.16,
  penaltySpot: 11.0,
  centreCircle: 9.15,
  cornerArc: 1.0,
};

export const BALL = {
  radius: 0.11,
  mass: 0.43,
  // drag coefficient bundled with air density and cross-section:
  // Fd = 0.5 * rho * Cd * A * v^2  ->  k = 0.5*1.225*0.25*pi*0.22^2 / 0.43
  dragK: 0.0055,
  magnusK: 0.000165,
  restitution: 0.62,
  groundFriction: 0.42, // rolling deceleration m/s^2 multiplier
  spinDecay: 0.86,
  maxSpeed: 42,
};

export const GRAVITY = 9.81;

export const SIM = {
  dt: 1 / 60,
  maxSubSteps: 5,
};

export const RULES = {
  halfLengthMinutes: 5, // real minutes of match clock per half (scaled)
  timeScale: 6, // 1 real second == 6 match seconds -> 5min half ~ 45 match min
  offsideEnabled: true,
  maxSubs: 5,
  cardYellowFoulThreshold: 0.62,
  cardRedFoulThreshold: 0.94,
};

export const PHASE = {
  KICKOFF: 'kickoff',
  OPEN_PLAY: 'open',
  THROW_IN: 'throw',
  GOAL_KICK: 'goalkick',
  CORNER: 'corner',
  FREE_KICK: 'freekick',
  PENALTY: 'penalty',
  GOAL_CELEBRATION: 'goal',
  HALF_TIME: 'halftime',
  FULL_TIME: 'fulltime',
  PRE_MATCH: 'prematch',
};

export const POS = {
  GK: 'GK',
  CB: 'CB',
  LB: 'LB',
  RB: 'RB',
  DM: 'DM',
  CM: 'CM',
  AM: 'AM',
  LW: 'LW',
  RW: 'RW',
  ST: 'ST',
};

// Which broad unit each position belongs to (used by the team AI layer).
export const UNIT = {
  GK: 'keeper',
  CB: 'defence',
  LB: 'defence',
  RB: 'defence',
  DM: 'midfield',
  CM: 'midfield',
  AM: 'midfield',
  LW: 'attack',
  RW: 'attack',
  ST: 'attack',
};
