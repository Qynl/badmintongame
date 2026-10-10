// ── Arena geometry & physics tuning ─────────────────────────────────────────
export const TABLE = {
  L: 8.4, // length along z (net at z=0)
  W: 4.6, // width along x
  H: 1.0, // top surface height
  T: 0.12, // top thickness
}

export const HALF_L = TABLE.L / 2
export const HALF_W = TABLE.W / 2

export const NET_H = 0.5
export const BALL_R = 0.13
export const GRAV = -14.5

export const PLAYER_Z = HALF_L + 0.42 // player paddle plane (near side, +z)
export const AI_Z = -(HALF_L + 0.42) // opponent paddle plane (far side, -z)

export const PADDLE_REACH = 0.92
export const PADDLE_TOP = 2.5 // max reachable ball height

export const STEP = 1 / 120 // fixed physics timestep

// ── Opponent tiers ──────────────────────────────────────────────────────────
export interface TierDef {
  name: string
  tagline: string
  speed: number // lateral movement u/s
  error: number // aim/prediction error radius
  reaction: number // seconds before it starts tracking a new shot
  returnSpeed: number // base return ball speed
  smashChance: number
  curveRead: number // 0..1 — how well it compensates for sidespin
  aimMin: number // placement aggression range
  aimMax: number
  color: string
}

export const TIERS: TierDef[] = [
  {
    name: 'ROOKIE-9',
    tagline: 'Rusty servo arms. Telegraphs everything.',
    speed: 3.6,
    error: 0.62,
    reaction: 0.3,
    returnSpeed: 7.8,
    smashChance: 0.03,
    curveRead: 0.35,
    aimMin: 0.6,
    aimMax: 1.4,
    color: '#39e6a3',
  },
  {
    name: 'VECTOR',
    tagline: 'Reads spin. Punishes lazy placement.',
    speed: 5.0,
    error: 0.4,
    reaction: 0.16,
    returnSpeed: 9.6,
    smashChance: 0.12,
    curveRead: 0.65,
    aimMin: 0.9,
    aimMax: 1.8,
    color: '#c084fc',
  },
  {
    name: 'OVERDRIVE',
    tagline: 'Predicts the future. Hunts your weak side.',
    speed: 6.8,
    error: 0.3,
    reaction: 0.07,
    returnSpeed: 11.2,
    smashChance: 0.34,
    curveRead: 0.8,
    aimMin: 1.0,
    aimMax: 1.85,
    color: '#fb3b5c',
  },
]

// Gauntlet ladder (indexes into TIERS + stat multipliers)
export const GAUNTLET: { tier: number; name: string; mult: number }[] = [
  { tier: 0, name: 'RUSTBUCKET', mult: 0.85 },
  { tier: 0, name: 'ROOKIE-9', mult: 1.0 },
  { tier: 1, name: 'VECTOR', mult: 1.0 },
  { tier: 1, name: 'VECTOR PRIME', mult: 1.18 },
  { tier: 2, name: 'OVERDRIVE-X', mult: 1.1 },
]

// ── Paddle skins ────────────────────────────────────────────────────────────
export const SKINS: { name: string; color: string; glow: string; unlock: string }[] = [
  { name: 'CYBYTE', color: '#22d3ee', glow: '#67e8f9', unlock: 'default' },
  { name: 'VIOLETA', color: '#e879f9', glow: '#f0abfc', unlock: 'default' },
  { name: 'EMERALD', color: '#34d399', glow: '#6ee7b7', unlock: 'default' },
  { name: 'MIDAS', color: '#fbbf24', glow: '#fde68a', unlock: 'Clear the GAUNTLET' },
]

export const GAME_TARGET = 11 // points to win a game (win by 2)

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const rand = (a: number, b: number) => a + Math.random() * (b - a)
