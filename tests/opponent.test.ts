import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { chooseShot } from '../src/game/ai/DecisionMaking';
import { profiled, styles, styleList, isStyle } from '../src/game/ai/Styles';
import { useGameStore, validateSettings, defaultSettings } from '../src/state/gameStore';

// A smash comes back as a flat, fast reply deep into the front court; a drop stops at 1.7 m.
const from = new Vector3(0.4, 2.6, -2.2), player = new Vector3(-0.5, 0, 4.2);
function tally(attack: number, trials = 400) {
  let smashes = 0, drops = 0;
  for (let i = 0; i < trials; i++) {
    const choice = chooseShot(from, player, 'club', false, { pressure: 0.1, sequence: i, relaxed: false, attack });
    if (choice.loft === 1.0) smashes++; else if (choice.target.z === 1.7) drops++;
  }
  return { smashes, drops };
}

describe('opponent personalities', () => {
  it('keeps every style within a sane range of the base difficulty', () => {
    for (const style of styleList) for (const difficulty of ['casual', 'club', 'expert'] as const) {
      const p = profiled(difficulty, style);
      expect(p.reaction).toBeGreaterThan(0); expect(p.reaction).toBeLessThan(1);
      expect(p.speed).toBeGreaterThan(2); expect(p.speed).toBeLessThan(7);
      expect(p.error).toBeGreaterThan(0); expect(p.miss).toBeLessThanOrEqual(0.4);
    }
  });
  it('makes the attacker reach first and give more away', () => {
    const attack = profiled('club', 'attacker'), steady = profiled('club', 'steady');
    expect(attack.reaction).toBeLessThan(steady.reaction);
    expect(attack.miss).toBeGreaterThan(steady.miss);
    expect(attack.error).toBeGreaterThan(steady.error);
  });
  it('makes the retriever quicker and cleaner but reluctant to attack', () => {
    const retrieve = profiled('club', 'retriever'), steady = profiled('club', 'steady');
    expect(retrieve.speed).toBeGreaterThan(steady.speed);
    expect(retrieve.miss).toBeLessThan(steady.miss);
    expect(styles.retriever.attack).toBeLessThan(1);
  });
  it('lets personality decide how often a chance becomes an attack', () => {
    const aggressive = tally(styles.attacker.attack), steady = tally(1), patient = tally(styles.retriever.attack);
    expect(aggressive.smashes).toBeGreaterThan(steady.smashes + 40);
    expect(steady.smashes).toBeGreaterThan(patient.smashes + 15);
    expect(patient.drops).toBeGreaterThan(aggressive.drops);
  });
  it('leaves friendly practice rallies alone whatever the personality', () => {
    for (const style of styleList) {
      const a = chooseShot(from, player, 'casual', true, { pressure: 0.1, sequence: 2, relaxed: true, attack: styles[style].attack });
      expect(a.loft).toBeGreaterThan(3); expect(a.target.z).toBeGreaterThan(1);
    }
  });
  it('stores a chosen style and falls back on anything else', () => {
    expect(validateSettings({ ...defaultSettings, opponent: 'tactician' }).opponent).toBe('tactician');
    expect(validateSettings({ ...defaultSettings, opponent: 'annihilator' }).opponent).toBe('steady');
    expect(validateSettings(null).opponent).toBe('steady');
    expect(isStyle('retriever')).toBe(true); expect(isStyle(7)).toBe(false);
    useGameStore.getState().setSettings({ opponent: 'retriever' });
    expect(useGameStore.getState().settings.opponent).toBe('retriever');
    useGameStore.getState().setSettings({ opponent: 'steady' });
  });
});
