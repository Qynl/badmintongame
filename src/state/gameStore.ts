import { create } from 'zustand';
import type { RallyRun } from '../game/training/RallyRun';
import type { AssistedShot } from '../game/player/ShotPlanner';
import { isStyle, type OpponentStyle } from '../game/ai/Styles';

export type Mode = 'match' | 'practice' | 'training';
export type Difficulty = 'casual' | 'club' | 'expert';
export type ControlMode = 'assisted' | 'simulation';
export type Quality = 'performance' | 'balanced' | 'ultra';
export type ContactQuality = 'Perfect' | 'Good' | 'Late' | 'Early' | 'Off-center' | 'Miss';
export type ShotType = 'Serve' | 'Clear' | 'Drop' | 'Smash' | 'Drive' | 'Lift' | 'Net shot' | 'Push';
export type TrainingShot = 'Clear' | 'Drop' | 'Smash' | 'Net shot';
export interface Settings { volume: number; sensitivity: number; quality: Quality; difficulty: Difficulty; opponent: OpponentStyle; trajectory: boolean; impact: boolean; landing: boolean; headMotion: boolean; controls: ControlMode; guides: boolean }
export const defaultSettings: Settings = { volume: 0.55, sensitivity: 1, quality: 'balanced', difficulty: 'casual', opponent: 'steady', controls: 'assisted', guides: true, trajectory: true, impact: true, landing: true, headMotion: true };
export function validateSettings(saved: unknown): Settings {
  const result = { ...defaultSettings };
  if (!saved || typeof saved !== 'object') return result;
  const s = saved as Record<string, unknown>;
  if (typeof s.volume === 'number' && Number.isFinite(s.volume)) result.volume = Math.max(0, Math.min(1, s.volume));
  if (typeof s.sensitivity === 'number' && Number.isFinite(s.sensitivity)) result.sensitivity = Math.max(0.3, Math.min(2, s.sensitivity));
  if (['performance', 'balanced', 'ultra'].includes(s.quality as string)) result.quality = s.quality as Quality;
  if (['casual', 'club', 'expert'].includes(s.difficulty as string)) result.difficulty = s.difficulty as Difficulty;
  if (['assisted', 'simulation'].includes(s.controls as string)) result.controls = s.controls as ControlMode;
  if (isStyle(s.opponent)) result.opponent = s.opponent;
  for (const key of ['guides', 'trajectory', 'impact', 'landing', 'headMotion'] as const) if (typeof s[key] === 'boolean') result[key] = s[key];
  return result;
}
function savedSettings(): Settings {
  try { return validateSettings(JSON.parse(localStorage.getItem('feather-settings') || '{}')); } catch { return { ...defaultSettings }; }
}
const freshSession = () => ({
  score: [0, 0] as [number, number], games: [0, 0] as [number, number], game: 1, server: 0 as 0 | 1,
  gameHistory: [] as [number, number][], rally: 0, rallyActive: false, message: 'Your court. Your rhythm.',
  run: null as ReturnType<RallyRun['snapshot']> | null,
  contact: null as ContactQuality | null, shot: null as ShotType | null, speed: 0, racketSpeed: 0, contacts: 0,
  trainingHits: 0, trainingAttempts: 0, trainingSuccess: 0, trainingStreak: 0, trainingBestStreak: 0,
  winner: null as 0 | 1 | null, impactPoint: null as [number, number] | null,
  feedback: '', lastLanding: null as 'Target' | 'In' | 'Out' | null, nextFeed: 0, courtFade: 0, rallies: 0, bestRally: 0, swingReady: false, reachReady: false, contactPulse: 0, smashReady: false, selectedShot: 'rally' as AssistedShot, timedContact: false, swingPower: 1, flail: 0, opponentShot: '' as string, replyPulse: 0, winners: 0, smashWinners: 0, touchWinners: 0,
  /** Aim readout: where the marker sits, and how close the last shot landed to it (metres). */
  aimLabel: 'DEEP CENTRE', aimArmed: false, aimVisible: false,
  placement: null as number | null, placementAvg: 0, placementShots: 0, placementOnTarget: 0,
});
type SessionState = ReturnType<typeof freshSession>;
interface GameStore extends SessionState {
  phase: 'menu' | 'playing' | 'paused' | 'result';
  matchFormat: 'duel' | 'classic'; setMatchFormat: (format: 'duel' | 'classic') => void;
  mode: Mode; settings: Settings; trainingShot: TrainingShot; session: number;
  start: (mode: Mode) => void; pause: () => void; resume: () => void; home: () => void;
  setSettings: (settings: Partial<Settings>) => void; setTrainingShot: (shot: TrainingShot) => void;
}
export const useGameStore = create<GameStore>((set) => ({
  ...freshSession(), matchFormat: 'duel', setMatchFormat: (matchFormat) => set({ matchFormat }), phase: 'menu', mode: 'match', settings: savedSettings(), trainingShot: 'Clear', session: 0,
  start: (mode) => set((s) => ({ ...freshSession(), phase: 'playing', mode, session: s.session + 1 })),
  pause: () => set((s) => s.phase === 'playing' ? { phase: 'paused' } : {}),
  resume: () => set({ phase: 'playing' }),
  home: () => set({ phase: 'menu', rallyActive: false, courtFade: 0 }),
  setSettings: (update) => set((s) => {
    const settings = validateSettings({ ...s.settings, ...update });
    try { localStorage.setItem('feather-settings', JSON.stringify(settings)); } catch { /* Preferences work without persistent storage. */ }
    return { settings };
  }),
  setTrainingShot: (trainingShot) => set({ trainingShot }),
}));
