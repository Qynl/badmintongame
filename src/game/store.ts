import { create } from 'zustand'
import { GAUNTLET } from './constants'

export type Screen =
  | 'menu'
  | 'difficulty'
  | 'gauntletIntro'
  | 'gauntletClear'
  | 'game'
  | 'result'
export type Mode = 'quick' | 'gauntlet' | 'trick' | 'duel' | 'demo'
export type Side = 'player' | 'ai'

interface SaveData {
  skin: number
  overdriveUnlocked: boolean
  gauntletCleared: boolean
  trickBest: number
}

const SAVE_KEY = 'neon-smash-save-v1'

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) return { skin: 0, overdriveUnlocked: false, gauntletCleared: false, trickBest: 0, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { skin: 0, overdriveUnlocked: false, gauntletCleared: false, trickBest: 0 }
}

function persist(s: SaveData) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export interface Banner {
  text: string
  sub?: string
  tone: 'good' | 'bad' | 'neutral' | 'epic'
  id: number
}

export interface ResultInfo {
  won: boolean
  title: string
  sub: string
}

interface Store {
  screen: Screen
  mode: Mode
  tierIndex: number
  opponentName: string
  gauntletRound: number

  pScore: number
  aScore: number
  server: Side
  rally: number
  bestRally: number
  flow: number
  flowActive: boolean
  charge: number
  matchPoint: Side | null
  banner: Banner | null
  paused: boolean
  muted: boolean

  skin: number
  overdriveUnlocked: boolean
  gauntletCleared: boolean
  trickBest: number
  trickScore: number
  trickTime: number
  trickCombo: number

  result: ResultInfo | null

  // actions
  setScreen(s: Screen): void
  startQuick(tier: number): void
  startGauntlet(round: number): void
  startTrick(): void
  startDuel(): void
  point(side: Side, pScore: number, aScore: number, server: Side): void
  setServer(s: Side): void
  setRally(r: number): void
  setFlow(f: number, active: boolean): void
  setCharge(c: number): void
  setMatchPoint(s: Side | null): void
  showBanner(text: string, tone: Banner['tone'], sub?: string): void
  clearBanner(): void
  setPaused(p: boolean): void
  toggleMute(): void
  setSkin(i: number): void
  unlockOverdrive(): void
  clearGauntlet(): void
  setTrick(score: number, time: number, combo: number): void
  finishGame(r: ResultInfo): void
  backToMenu(): void
}

let bannerId = 0
const save = loadSave()

export const useStore = create<Store>((set, get) => ({
  screen: 'menu',
  mode: 'demo',
  tierIndex: 1,
  opponentName: 'VECTOR',
  gauntletRound: 0,

  pScore: 0,
  aScore: 0,
  server: 'player',
  rally: 0,
  bestRally: 0,
  flow: 0,
  flowActive: false,
  charge: 0,
  matchPoint: null,
  banner: null,
  paused: false,
  muted: false,

  skin: save.skin,
  overdriveUnlocked: save.overdriveUnlocked,
  gauntletCleared: save.gauntletCleared,
  trickBest: save.trickBest,
  trickScore: 0,
  trickTime: 60,
  trickCombo: 0,

  result: null,

  setScreen: (s) => set({ screen: s }),

  startQuick: (tier) =>
    set({
      screen: 'game',
      mode: 'quick',
      tierIndex: tier,
      opponentName: ['ROOKIE-9', 'VECTOR', 'OVERDRIVE'][tier],
      pScore: 0,
      aScore: 0,
      rally: 0,
      bestRally: 0,
      flow: 0,
      flowActive: false,
      charge: 0,
      matchPoint: null,
      banner: null,
      paused: false,
      result: null,
      server: 'player',
    }),

  startGauntlet: (round) =>
    set({
      screen: 'game',
      mode: 'gauntlet',
      gauntletRound: round,
      tierIndex: GAUNTLET[round].tier,
      opponentName: GAUNTLET[round].name,
      pScore: 0,
      aScore: 0,
      rally: 0,
      bestRally: 0,
      flow: 0,
      flowActive: false,
      charge: 0,
      matchPoint: null,
      banner: null,
      paused: false,
      result: null,
      server: 'player',
    }),

  startTrick: () =>
    set({
      screen: 'game',
      mode: 'trick',
      pScore: 0,
      aScore: 0,
      rally: 0,
      bestRally: 0,
      flow: 0,
      flowActive: false,
      charge: 0,
      matchPoint: null,
      banner: null,
      paused: false,
      result: null,
      server: 'player',
      trickScore: 0,
      trickTime: 60,
      trickCombo: 0,
    }),

  startDuel: () =>
    set({
      screen: 'game',
      mode: 'duel',
      tierIndex: 1,
      opponentName: 'PLAYER 2',
      pScore: 0,
      aScore: 0,
      rally: 0,
      bestRally: 0,
      flow: 0,
      flowActive: false,
      charge: 0,
      matchPoint: null,
      banner: null,
      paused: false,
      result: null,
      server: 'player',
    }),

  point: (side, pScore, aScore, server) =>
    set({
      pScore,
      aScore,
      server,
      bestRally: Math.max(get().bestRally, get().rally),
    }),

  setServer: (s) => set({ server: s }),
  setRally: (r) => set({ rally: r }),
  setFlow: (f, active) => set({ flow: f, flowActive: active }),
  setCharge: (c) => set({ charge: c }),
  setMatchPoint: (s) => set({ matchPoint: s }),

  showBanner: (text, tone, sub) => {
    bannerId++
    set({ banner: { text, tone, sub, id: bannerId } })
  },
  clearBanner: () => set({ banner: null }),

  setPaused: (p) => set({ paused: p }),

  toggleMute: () => {
    const m = !get().muted
    set({ muted: m })
  },

  setSkin: (i) => {
    set({ skin: i })
    persist({
      skin: i,
      overdriveUnlocked: get().overdriveUnlocked,
      gauntletCleared: get().gauntletCleared,
      trickBest: get().trickBest,
    })
  },

  unlockOverdrive: () => {
    if (get().overdriveUnlocked) return
    set({ overdriveUnlocked: true })
    persist({ ...saveFrom(get()) })
  },

  clearGauntlet: () => {
    if (get().gauntletCleared) return
    set({ gauntletCleared: true })
    persist({ ...saveFrom(get()) })
  },

  setTrick: (score, time, combo) => set({ trickScore: score, trickTime: Math.ceil(time), trickCombo: combo }),

  finishGame: (r) => {
    const best = Math.max(get().trickBest, get().trickScore)
    if (best !== get().trickBest) persist({ ...saveFrom(get()), trickBest: best })
    set({ screen: 'result', result: r, trickBest: best })
  },

  backToMenu: () =>
    set({
      screen: 'menu',
      mode: 'demo',
      paused: false,
      banner: null,
      result: null,
      matchPoint: null,
    }),
}))

function saveFrom(s: { skin: number; overdriveUnlocked: boolean; gauntletCleared: boolean; trickBest: number }): SaveData {
  return {
    skin: s.skin,
    overdriveUnlocked: s.overdriveUnlocked,
    gauntletCleared: s.gauntletCleared,
    trickBest: s.trickBest,
  }
}

export function unlockedSkins(gauntletCleared: boolean): boolean[] {
  return [true, true, true, gauntletCleared]
}
