import { describe, expect, test } from 'vitest';
import { FOUNDRY_RELEASE_NOTES, httpClient } from '@mondarth/fvtt-resolver/sources';
import { resolveInstall, toOverride } from '@lib/install/resolveInstall.js';
import { tagsUrl } from '@lib/VTT/coreImages.js';
import { vttSettings } from '@lib/projectVtt.js';
import { worldAnswers, worldFetch } from '@tests/unit/mocks/packageWorld.js';

import type { InstallQuestion, InstallResolution } from '@lib/install/resolveInstall.js';
import type { OverrideSettings, VttSettings } from '@schema/config.js';

const project = {
  id: 'my-module',
  title: 'My module',
  version: '0.1.0',
  compatibility: { minimum: '13', verified: '14' },
  relationships: {
    requires: [{ id: 'example-lib', type: 'module' }],
    systems: [{ id: 'example-system', type: 'system' }],
  },
};

function question(
  version: string,
  fields: Partial<InstallQuestion> = {},
  vtt: Partial<VttSettings> = {},
): InstallQuestion {
  return {
    project: { json: project, origin: '/project/module.json', type: 'module' },
    vtt: { ...vttSettings(version), ...vtt },
    noImage: (v, image) => `no ${image} image for ${v}`,
    ...fields,
  };
}

/** What a resolution chose, as `id@version`. */
function chosen(found: InstallResolution) {
  if (found.kind !== 'resolved' || !found.resolution.ok) return found;
  const { setup } = found.resolution;
  return [
    setup.core,
    `${setup.system.package.id}@${setup.system.version}`,
    ...setup.modules.map(m => `${m.package.id}@${m.version}`).sort(),
  ];
}

describe('resolveInstall', () => {
  test('finds the setup for the project’s module on the configured core', async () => {
    const found = await resolveInstall(httpClient({ fetch: worldFetch() }), question('14.363'));
    expect(chosen(found)).toEqual(['14.363', 'example-system@5.0.0', 'example-lib@2.0.0', 'my-module@0.1.0']);
    expect(found).toMatchObject({ kind: 'resolved', core: '14.363', unloaded: [], gaps: [] });
  });

  test('keeps to the configured core, going back to releases that run on it', async () => {
    const found = await resolveInstall(httpClient({ fetch: worldFetch() }), question('13.351'));
    expect(chosen(found)).toEqual(['13.351', 'example-system@5.0.0', 'example-lib@1.0.0', 'my-module@0.1.0']);
  });

  test('takes a build of any channel when the VTT is configured to run it', async () => {
    const found = await resolveInstall(httpClient({ fetch: worldFetch() }), question('13.340'));
    expect(chosen(found)).toContain('13.340');
  });

  test('explains that a build with no image cannot be run', async () => {
    const found = await resolveInstall(httpClient({ fetch: worldFetch() }), question('14.362'));
    expect(found.kind === 'resolved' && !found.resolution.ok && 'failure' in found.resolution).toBe(true);
    if (found.kind !== 'resolved' || found.resolution.ok || !('failure' in found.resolution)) return;
    expect(JSON.stringify(found.resolution.failure)).toContain('no felddy/foundryvtt image for 14.362');
  });

  test('limits nothing when the image’s tags cannot be listed: from another registry, or with a fixed tag', async () => {
    for (const host of [
      { type: 'docker' as const, image: 'felddy/foundryvtt', repository: 'registry.example.org' },
      { type: 'docker' as const, image: 'felddy/foundryvtt', version: 'release' },
    ]) {
      const fetch = worldFetch();
      expect(chosen(await resolveInstall(httpClient({ fetch }), question('14.362', {}, { host })))).toContain('14.362');
      expect(fetch.mock.calls.map(([url]) => String(url))).not.toContain(tagsUrl('felddy/foundryvtt', '14.'));
    }
  });

  test('reads a generation as its newest stable build with an image', async () => {
    expect(chosen(await resolveInstall(httpClient({ fetch: worldFetch() }), question('14')))).toContain('14.363');
    expect(chosen(await resolveInstall(httpClient({ fetch: worldFetch() }), question('13')))).toContain('13.351');
  });

  test('cannot choose a build of a generation without the release notes, or with no build to run', async () => {
    const answers = worldAnswers();
    answers.delete(FOUNDRY_RELEASE_NOTES);
    expect(await resolveInstall(httpClient({ fetch: worldFetch(answers) }), question('14'))).toEqual({
      kind: 'no-core',
      generation: '14',
      gaps: [{ source: 'foundry-releases', url: FOUNDRY_RELEASE_NOTES, reason: 'http', status: 404 }],
    });
    expect(await resolveInstall(httpClient({ fetch: worldFetch() }), question('12'))).toMatchObject({
      kind: 'no-core',
      gaps: [],
    });
  });

  test('installs the system and modules the VTT’s packages name', async () => {
    const vtt = { packages: { system: 'example-system', modules: ['example-premium'], overrides: [] } };
    const found = await resolveInstall(httpClient({ fetch: worldFetch() }), question('14.363', {}, vtt));
    expect(chosen(found)).toEqual([
      '14.363',
      'example-system@5.0.0',
      'example-lib@2.0.0',
      'example-premium@1.0.0',
      'my-module@0.1.0',
    ]);
  });

  test('applies the VTT’s overrides', async () => {
    const overrides: OverrideSettings[] = [
      { kind: 'exclude', package: 'module:example-lib', versions: ['2.0.0'], reason: 'it breaks scenes' },
    ];
    const vtt = { packages: { modules: [], overrides } };
    expect(chosen(await resolveInstall(httpClient({ fetch: worldFetch() }), question('14.363', {}, vtt)))).toContain(
      'example-lib@1.0.0',
    );
  });

  test('finds packages the project’s module names by their manifest URLs, with the tokens configured', async () => {
    const json = {
      ...project,
      relationships: {
        ...project.relationships,
        requires: [
          {
            id: 'forge-lib',
            type: 'module',
            manifest: 'https://github.com/someone/forge-lib/releases/latest/download/module.json',
          },
        ],
      },
    };
    const answers = worldAnswers();
    const fetch = worldFetch(answers);
    await resolveInstall(
      httpClient({ fetch }),
      question('14.363', {
        project: { json, origin: 'x', type: 'module' },
        sources: { github_token: 'gh-token', gitlab_token: 'gl-token' },
      }),
    );
    const github = fetch.mock.calls.find(([url]) =>
      String(url).startsWith('https://api.github.com/repos/someone/forge-lib/'),
    );
    expect(github?.[1]?.headers).toMatchObject({ Authorization: 'Bearer gh-token' });
  });

  test('records what could not be fetched, and what could not be loaded', async () => {
    const answers = worldAnswers();
    answers.delete('https://example.org/example-lib/2.0.0/manifest.json');
    const found = await resolveInstall(httpClient({ fetch: worldFetch(answers) }), question('14.363'));
    expect(found).toMatchObject({
      kind: 'resolved',
      unloaded: [{ package: 'module:example-lib', version: '2.0.0' }],
      gaps: [{ url: 'https://example.org/example-lib/2.0.0/manifest.json', reason: 'http', status: 404 }],
    });
  });

  test('says what is wrong with a project module that cannot be read', async () => {
    const found = await resolveInstall(
      httpClient({ fetch: worldFetch() }),
      question('14.363', { project: { json: { title: 'no id' }, origin: 'x', type: 'module' } }),
    );
    expect(found).toEqual({ kind: 'project-unreadable', problems: [{ code: 'missing-id' }] });
  });
});

describe('toOverride', () => {
  test('leaves out what the settings leave unset', () => {
    expect(toOverride({ kind: 'exclude', package: 'module:a', reason: 'r' })).toEqual({
      kind: 'exclude',
      package: 'module:a',
      reason: 'r',
    });
    expect(
      toOverride({
        kind: 'exclude',
        package: 'module:a',
        versions: ['1'],
        with: { package: 'core', minimum: '14' },
        reason: 'r',
      }),
    ).toEqual({
      kind: 'exclude',
      package: 'module:a',
      versions: ['1'],
      with: { package: 'core', minimum: '14' },
      reason: 'r',
    });
    expect(
      toOverride({ kind: 'exclude', package: 'module:a', with: { package: 'core', maximum: '13' }, reason: 'r' }),
    ).toEqual({
      kind: 'exclude',
      package: 'module:a',
      with: { package: 'core', maximum: '13' },
      reason: 'r',
    });
    expect(
      toOverride({
        kind: 'compatibility',
        package: 'module:a',
        compatibility: { maximum: null, verified: '14' },
        reason: 'r',
      }),
    ).toEqual({
      kind: 'compatibility',
      package: 'module:a',
      compatibility: { maximum: null, verified: '14' },
      reason: 'r',
    });
    expect(toOverride({ kind: 'relationship', package: 'module:a', drop: 'module:b', reason: 'r' })).toEqual({
      kind: 'relationship',
      package: 'module:a',
      drop: 'module:b',
      reason: 'r',
    });
  });
});
