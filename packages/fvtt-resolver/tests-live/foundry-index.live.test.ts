/**
 * Resolves a real module against Foundry VTT's real package index, and the manifests it points to.
 * Real data changes, so this checks what must hold, and reports the rest.
 */
import { describe, expect, it } from 'vitest';
import { explain, explanationText } from '../src/explain.js';
import { resolveInRounds } from '../src/rounds.js';
import { foundryIndexSource, httpClient, sourceSet } from '../src/sources/index.js';

import type { CoreRelease } from '../src/universe.js';

const core: CoreRelease[] = [
  { version: '13.351', generation: 13, channel: 'stable' },
  { version: '14.368', generation: 14, channel: 'stable' },
];

describe('against Foundry VTT’s package index', () => {
  it('resolves midi-qol: a setup with dnd5e and every module it requires', async () => {
    const http = httpClient({ fetch: globalThis.fetch });
    const set = sourceSet({ sources: [foundryIndexSource(http)], http, core });
    const universe = await set.universe([{ type: 'module', id: 'midi-qol' }]);
    expect(universe.releases.length).toBeGreaterThan(0);

    const { resolution, rounds, unloaded } = await resolveInRounds(
      universe,
      { require: [{ package: 'module:midi-qol' }] },
      set.load,
    );
    console.log(
      `${rounds} rounds, ${http.requests()} requests, ${unloaded.length} not loaded, ${set.gaps().length} gaps`,
    );
    for (const gap of set.gaps()) console.log('gap:', JSON.stringify(gap));
    if (!resolution.ok) {
      console.log('failure' in resolution ? explanationText(explain(resolution.failure)) : resolution.needs);
    }

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    const { setup } = resolution;
    console.log(
      `core ${setup.core}, ${setup.system.package.id} ${setup.system.version},`,
      setup.modules.map(m => `${m.package.id} ${m.version}`).join(', '),
    );
    expect(setup.system.package.id).toBe('dnd5e');
    expect(setup.modules.map(m => m.package.id)).toEqual(
      expect.arrayContaining(['midi-qol', 'socketlib', 'lib-wrapper']),
    );
  });
});
