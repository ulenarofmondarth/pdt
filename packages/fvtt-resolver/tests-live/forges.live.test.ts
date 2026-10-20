/**
 * GitHub and GitLab against the real services: the history they add to Foundry VTT's listings.
 * Without a token, GitHub allows 60 requests an hour; set GITHUB_TOKEN to raise it.
 */
import { describe, expect, it } from 'vitest';
import { resolveInRounds } from '../src/rounds.js';
import {
  foundryIndexSource,
  githubSource,
  gitlabSource,
  httpClient,
  manifestUrlSource,
  sourceSet,
} from '../src/sources/index.js';

import type { CoreRelease } from '../src/universe.js';

const core: CoreRelease[] = [
  { version: '13.351', generation: 13, channel: 'stable' },
  { version: '14.368', generation: 14, channel: 'stable' },
];
const token = process.env['GITHUB_TOKEN'];

describe('against GitHub and GitLab', () => {
  it('fills in dnd5e’s history from GitHub, beyond what Foundry’s details list', async () => {
    const http = httpClient({ fetch: globalThis.fetch });
    const index = foundryIndexSource(http);
    const listed = await index.releases({ type: 'system', id: 'dnd5e' });
    const set = sourceSet({ sources: [index, githubSource(http, { ...(token && { token }) })], http, core: [] });
    const universe = await set.universe([{ type: 'system', id: 'dnd5e' }]);
    const fromIndex = listed.ok ? listed.value.length : 0;
    console.log(
      `dnd5e: ${fromIndex} versions from Foundry's details, ${universe.releases.length} with GitHub; gaps: ${JSON.stringify(set.gaps())}`,
    );
    expect(set.gaps()).toEqual([]);
    expect(universe.releases.length).toBeGreaterThan(fromIndex);
  });

  it.each(['exclude', 'last', 'include'] as const)(
    'resolves midi-qol with every source, its history from GitLab, under unlisted: %s',
    async unlisted => {
      const http = httpClient({ fetch: globalThis.fetch });
      const sources = [
        foundryIndexSource(http),
        githubSource(http, { ...(token && { token }) }),
        gitlabSource(http),
        manifestUrlSource(http),
      ];
      const set = sourceSet({ sources, http, core, unlisted });
      const universe = await set.universe([{ type: 'module', id: 'midi-qol' }]);
      const midi = universe.releases.filter(r => r.package.id === 'midi-qol');
      const { resolution, rounds } = await resolveInRounds(
        universe,
        { require: [{ package: 'module:midi-qol' }] },
        set.load,
      );
      console.log(
        `${unlisted}: midi-qol ${midi.length} versions known; ${rounds} rounds, ${http.requests()} requests; gaps: ${JSON.stringify(set.gaps())}`,
      );
      expect(resolution.ok).toBe(true);
      if (resolution.ok) {
        console.log(
          `${unlisted}: core ${resolution.setup.core}, ${resolution.setup.system.package.id} ${resolution.setup.system.version},`,
          resolution.setup.modules
            .map(m => `${m.package.id} ${m.version}${m.unlisted === true ? ' (unlisted)' : ''}`)
            .join(', '),
        );
      }
    },
  );
});
