import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Setup } from '../src/components/Menus/Setup';
import { useGameStore } from '../src/state/gameStore';
import { styleList, styles } from '../src/game/ai/Styles';

describe('setup screen', () => {
  // renderToStaticMarkup reads the store's INITIAL state (useSyncExternalStore's server
  // snapshot), so these assert the default setup screen, not a mutated store.
  it('offers every opponent personality before a match', () => {
    expect(useGameStore.getInitialState().settings.opponent).toBe('steady');
    const html = renderToStaticMarkup(<Setup mode="match" onClose={() => {}}/>);
    for (const id of styleList) expect(html).toContain(styles[id].name);
    expect((html.match(/class="style-option[ "]/g) || []).length).toBe(4);
    expect(html.match(/style-option selected/g)?.length).toBe(1);
  });
  it('does not offer personalities in a training feed', () => {
    const html = renderToStaticMarkup(<Setup mode="training" onClose={() => {}}/>);
    expect(html).not.toContain('HOW THEY PLAY');
  });
});

