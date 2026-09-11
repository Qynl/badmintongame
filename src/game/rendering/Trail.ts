import type { Mode, Settings } from '../../state/gameStore';

export interface TrailStyle { visible: boolean; opacity: number; points: number }

/**
 * Which trail the shuttle leaves. Outside a match the full recorded flight is drawn for reading
 * trajectory; in a match a short one, because its job is to keep a high shuttle findable against
 * the roof rather than to teach the arc. Assisted keys it to the guide setting, Simulation to the
 * trail setting, so each mode stays consistent with the rest of its aids.
 */
export function trail(mode: Mode, settings: Pick<Settings, 'controls' | 'guides' | 'trajectory'>): TrailStyle {
  if (mode !== 'match') return { visible: settings.trajectory, opacity: 0.5, points: 140 };
  return settings.controls === 'assisted'
    ? { visible: settings.guides, opacity: 0.26, points: 16 }
    : { visible: settings.trajectory, opacity: 0.32, points: 12 };
}
