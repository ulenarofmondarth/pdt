/**
 * The Foundry VTT package catalogue against the real service: midi-qol resolved with the catalogue first, and with
 * Foundry's index alone, to compare what each found and what it cost. Skipped unless CATALOGUE_URL and CATALOGUE_KEY
 * are set. The first run may find midi-qol pending, as the catalogue crawls it once asked; a run a few minutes later
 * finds it held.
 */
import { describe, expect, it } from 'vitest';
import { resolveInRounds } from '../src/rounds.js';
import { catalogueSource, foundryIndexSource, httpClient, sourceSet } from '../src/sources/index.js';

import type { CoreRelease } from '../src/universe.js';

const core: CoreRelease[] = [
  { version: '13.351', generation: 13, channel: 'stable' },
  { version: '14.368', generation: 14, channel: 'stable' },
];
const url = process.env['CATALOGUE_URL'];
const key = process.env['CATALOGUE_KEY'];
const MIDI = { type: 'module', id: 'midi-qol' } as const;

/** midi-qol resolved with these sources, and what it cost. */
async function resolveMidi(withCatalogue: boolean) {
  let posts = 0;
  const http = httpClient({ fetch: globalThis.fetch });
  const catalogue =
    withCatalogue && url !== undefined && key !== undefined
      ? catalogueSource({
          url,
          key,
          client: 'fvtt-resolver/live-check',
          fetch: (input, init) => {
            posts++;
            return globalThis.fetch(input, init);
          },
        })
      : undefined;
  const set = sourceSet({ sources: [foundryIndexSource(http)], http, core, ...(catalogue && { catalogue }) });
  const started = performance.now();
  const universe = await set.universe([MIDI]);
  const { resolution, rounds } = await resolveInRounds(
    universe,
    { require: [{ package: 'module:midi-qol' }] },
    set.load,
  );
  return {
    resolution,
    rounds,
    posts,
    requests: http.requests(),
    ms: Math.round(performance.now() - started),
    gaps: set.gaps(),
  };
}

describe.skipIf(url === undefined || key === undefined)('against the catalogue', () => {
  it('resolves midi-qol with the catalogue first, as it does with Foundry’s index alone', async () => {
    const [first, alone] = [await resolveMidi(true), await resolveMidi(false)];
    for (const [name, run] of [
      ['catalogue', first],
      ['index alone', alone],
    ] as const) {
      const setup = run.resolution.ok
        ? `core ${run.resolution.setup.core}, ${run.resolution.setup.system.package.id} ${run.resolution.setup.system.version}, ${run.resolution.setup.modules.map(m => `${m.package.id} ${m.version}`).join(', ')}`
        : 'no setup';
      console.log(
        `${name}: ${String(run.rounds)} rounds, ${String(run.posts)} catalogue posts, ${String(run.requests)} other requests, ${String(run.ms)} ms; ${setup}; gaps: ${JSON.stringify(run.gaps)}`,
      );
    }
    expect(first.gaps.filter(gap => gap.source === 'catalogue')).toEqual([]);
    expect(first.resolution.ok).toBe(true);
  });
});
