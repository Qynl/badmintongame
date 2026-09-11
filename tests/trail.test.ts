import { describe, expect, it } from 'vitest';
import { trail } from '../src/game/rendering/Trail';
const settings = { controls: 'assisted' as const, guides: true, trajectory: true };

describe('shuttle trail', () => {
  it('draws the whole recorded flight outside a match', () => {
    const free = trail('practice', settings);
    expect(free).toMatchObject({ visible: true, opacity: 0.5, points: 140 });
    expect(trail('practice', { ...settings, trajectory: false }).visible).toBe(false);
  });
  it('keeps a high shuttle findable during a match in both control modes', () => {
    const assisted = trail('match', settings);
    expect(assisted.visible).toBe(true); expect(assisted.points).toBeLessThan(30);
    expect(assisted.opacity).toBeLessThan(0.5);
    const simulated = trail('match', { ...settings, controls: 'simulation' });
    expect(simulated.visible).toBe(true); expect(simulated.points).toBeLessThan(30);
  });
  it('listens to the setting that belongs to the mode', () => {
    expect(trail('match', { ...settings, guides: false }).visible).toBe(false);
    expect(trail('match', { ...settings, trajectory: false }).visible).toBe(true);
    expect(trail('match', { ...settings, controls: 'simulation', trajectory: false }).visible).toBe(false);
    expect(trail('match', { ...settings, controls: 'simulation', guides: false }).visible).toBe(true);
  });
});
