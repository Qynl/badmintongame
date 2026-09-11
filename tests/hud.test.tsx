// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PracticeMetrics } from '../src/components/HUD/PracticeMetrics';
import { SwingCoach } from '../src/components/HUD/SwingCoach';
import { defaultSettings, useGameStore, validateSettings } from '../src/state/gameStore';
import { GameHUD } from '../src/components/HUD/GameHUD';
import { GameEngine } from '../src/game/GameEngine';
import type { InputManager } from '../src/game/input/InputManager';

// Mounted for real, so the DOM is the evidence: a tag that ended up inside a string shows up
// as text here instead of as an element.
let root: Root | null = null, host: HTMLDivElement | null = null;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function mount(node: ReactElement) {
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });

describe('placement readout', () => {
  it('shows metres as a unit, not as escaped markup', () => {
    useGameStore.getState().setSettings({ controls: 'assisted', impact: true });
    useGameStore.setState({ placement: 0.4231, placementAvg: 0.51, placementShots: 4, placementOnTarget: 2 });
    const el = mount(<PracticeMetrics/>);
    const row = [...el.querySelectorAll('.metric-row')].find((r) => r.textContent?.includes('Placement'));
    expect(row?.textContent).toContain('0.42');
    expect(row?.textContent).not.toContain('<small>');
    expect(row?.querySelector('strong > small')?.textContent).toBe('M');
    expect(el.innerHTML).not.toContain('&lt;small&gt;');
    expect(row?.textContent).toContain('AVG 0.51');
    expect(row?.textContent).toContain('2/4 ON MARK');
  });
  it('still shows a dash before the first contact', () => {
    useGameStore.getState().setSettings({ controls: 'assisted', impact: true });
    useGameStore.setState({ placement: null, placementAvg: 0, placementShots: 0 });
    const el = mount(<PracticeMetrics/>);
    const row = [...el.querySelectorAll('.metric-row')].find((r) => r.textContent?.includes('Placement'));
    expect(row?.querySelector('strong')?.textContent).toBe('—');
  });
});

describe('swing coach states', () => {
  const assist = { controls: 'assisted' as const, guides: true };
  it('says the shuttle is out of view rather than inviting a swing', () => {
    useGameStore.getState().setSettings(assist);
    useGameStore.setState({ rally: 4, rallyActive: true, shuttleSeen: false, swingMissed: false, contactPulse: 0, swingReady: true, reachReady: false });
    const el = mount(<SwingCoach/>);
    expect(el.querySelector('.swing-coach')?.className).toContain('looking-away');
    expect(el.textContent).toContain('The shuttle is out of view.');
  });
  it('says a swing met nothing, and that a clean hit never waits', () => {
    useGameStore.getState().setSettings(assist);
    useGameStore.setState({ rally: 4, rallyActive: true, shuttleSeen: true, swingMissed: true, contactPulse: 0 });
    const el = mount(<SwingCoach/>);
    expect(el.textContent).toContain('You swung at nothing.');
    expect(el.textContent).toContain('CONNECT AND YOU CAN SWING STRAIGHT AWAY');
    act(() => useGameStore.setState({ swingMissed: false }));
    expect(el.textContent).not.toContain('You swung at nothing.');
  });
});

describe('a smaller, quieter HUD', () => {
  it('fades the panels while the shuttle is in the air', () => {
    useGameStore.getState().setSettings({ controls: 'assisted', guides: true, minimal: false });
    useGameStore.setState({ phase: 'playing', mode: 'match', rallyActive: true });
    const el = mount(<GameHUD/>);
    expect(el.querySelector('.game-hud')?.className).toContain('hud-quiet');
    act(() => useGameStore.setState({ rallyActive: false }));
    expect(el.querySelector('.game-hud')?.className).not.toContain('hud-quiet');
  });
  it('hides the coach and the metrics when the player asks for a minimal HUD', () => {
    useGameStore.getState().setSettings({ controls: 'assisted', guides: true, minimal: true });
    useGameStore.setState({ rally: 4, rallyActive: true, shuttleSeen: true, swingMissed: false, contactPulse: 0 });
    expect(mount(<SwingCoach/>).innerHTML).toBe('');
    useGameStore.getState().setSettings({ impact: true });
    expect(mount(<PracticeMetrics/>).querySelector('.practice-metrics')).toBeNull();
    const el = mount(<GameHUD/>);
    expect(el.querySelector('.game-hud')?.className).toContain('minimal');
  });
  it('names the personality you are playing against', () => {
    useGameStore.getState().setSettings({ controls: 'assisted', minimal: false, opponent: 'retriever' });
    useGameStore.setState({ phase: 'playing', mode: 'match', rallyActive: false });
    const el = mount(<GameHUD/>);
    expect(el.querySelector('.opponent-score')?.textContent).toContain('Retriever');
  });
  it('stores the preference and defaults to the full HUD', () => {
    expect(defaultSettings.minimal).toBe(false);
    expect(validateSettings({ ...defaultSettings, minimal: true }).minimal).toBe(true);
    expect(validateSettings({ ...defaultSettings, minimal: 'yes' }).minimal).toBe(false);
  });
  it('remembers the fastest shot of the session', () => {
    useGameStore.getState().setSettings({ controls: 'assisted', guides: true, minimal: false, difficulty: 'casual' });
    useGameStore.getState().start('practice');
    const e = new GameEngine();
    e.input = { keys: new Set(), locked: true, swinging: false, dropHeld: false, swingPressed: false, pendingShot: null, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
    e.frame(1 / 120); e.cooldown = 0; e.input.swinging = true;
    for (let i = 0; i < 900 && !useGameStore.getState().contacts; i++) e.frame(1 / 120);
    const state = useGameStore.getState();
    expect(state.contacts).toBeGreaterThan(0);
    expect(state.topSpeed).toBeGreaterThan(10);
    expect(state.topSpeed).toBeCloseTo(state.speed, 6);
  });
});
