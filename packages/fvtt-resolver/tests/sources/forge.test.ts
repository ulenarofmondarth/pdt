import { describe, expect, it } from 'vitest';
import { githubSource, gitlabSource } from '../../src/sources/forge.js';
import { httpClient } from '../../src/sources/http.js';
import { fakeFetch } from './fake-fetch.js';

const module = { type: 'module' as const, id: 'example-module' };
const GITHUB_RELEASES = 'https://api.github.com/repos/example/example-module/releases?per_page=100';
const GITLAB_RELEASES = 'https://gitlab.com/api/v4/projects/group%2Fexample-module/releases?per_page=100';
const asset = (tag: string, name = 'module.json') => ({
  name,
  browser_download_url: `https://github.com/example/example-module/releases/download/${tag}/${name}`,
});

const githubReleases = [
  { tag_name: 'v2.0.0', assets: [asset('v2.0.0'), asset('v2.0.0', 'module.zip')] },
  { tag_name: 'v2.1.0-draft', draft: true, assets: [asset('v2.1.0-draft')] },
  { tag_name: 'v1.5.0', assets: [asset('v1.5.0')] },
  { tag_name: 'v1.0.0', assets: [asset('v1.0.0', 'module.zip')] },
  { tag_name: 'nightly', assets: [asset('nightly')] },
];

const declared = (url: string) => ({ declared: [url], seen: [] });

describe('githubSource', () => {
  it('lists the releases with the manifest attached, leaving out drafts and tags without a version', async () => {
    const { fetch, requests } = fakeFetch({ [GITHUB_RELEASES]: { body: githubReleases } });
    const found = await githubSource(httpClient({ fetch })).releases(
      module,
      declared('https://github.com/example/example-module/releases/latest/download/module.json'),
    );
    expect(found).toEqual({
      ok: true,
      value: [
        {
          package: module,
          version: '2.0.0',
          compatibility: {},
          relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
          manifest: asset('v2.0.0').browser_download_url,
          protected: false,
          origin: GITHUB_RELEASES,
          detail: 'listed',
        },
        expect.objectContaining({ version: '1.5.0' }),
      ],
    });
    expect(requests[0]?.headers['Accept']).toBe('application/vnd.github+json');
    expect(requests[0]?.headers['Authorization']).toBeUndefined();
  });

  it('finds the repository from the manifests other sources listed too, asking for each repository once', async () => {
    const { fetch, requests } = fakeFetch({ [GITHUB_RELEASES]: { body: githubReleases } });
    const seen = [asset('v2.0.0').browser_download_url, asset('v1.5.0').browser_download_url];
    const found = await githubSource(httpClient({ fetch })).releases(module, { declared: [], seen });
    expect(found.ok && found.value.map(r => r.version)).toEqual(['2.0.0', '1.5.0']);
    expect(requests).toHaveLength(1);
  });

  it('sends a token when given one', async () => {
    const { fetch, requests } = fakeFetch({
      'https://github.example.org/repos/example/example-module/releases?per_page=100': { body: [] },
    });
    await githubSource(httpClient({ fetch }), { token: 'secret', apiUrl: 'https://github.example.org' }).releases(
      module,
      declared('https://github.com/example/example-module/releases/latest/download/module.json'),
    );
    expect(requests[0]?.headers['Authorization']).toBe('Bearer secret');
  });

  it('knows nothing of a package with no GitHub manifest URL', async () => {
    const { fetch, requests } = fakeFetch({});
    expect(
      await githubSource(httpClient({ fetch })).releases(module, declared('https://example.org/module.json')),
    ).toEqual({
      ok: true,
      value: [],
    });
    expect(await githubSource(httpClient({ fetch })).releases(module)).toEqual({ ok: true, value: [] });
    expect(requests).toEqual([]);
  });

  it.each([
    ['the API refuses, as when its rate limit is reached', { status: 403 }, { reason: 'http', status: 403 }],
    ['the answer cannot be read', { body: { message: 'Not Found' } }, { reason: 'invalid' }],
  ])('records a gap when %s', async (_, answer, gap) => {
    const { fetch } = fakeFetch({ [GITHUB_RELEASES]: answer });
    const found = await githubSource(httpClient({ fetch })).releases(
      module,
      declared('https://github.com/example/example-module/releases/latest/download/module.json'),
    );
    expect(found).toEqual({
      ok: false,
      gap: { source: 'github', url: GITHUB_RELEASES, package: 'module:example-module', ...gap },
    });
  });
});

describe('gitlabSource', () => {
  const link = (tag: string, fields: Record<string, string> = {}) => ({
    name: 'Manifest',
    url: `https://gitlab.com/group/example-module/-/raw/${tag}/module.json`,
    ...fields,
  });
  const gitlabReleases = [
    {
      tag_name: 'v3.0.0',
      assets: {
        links: [
          link('v3.0.0', {
            direct_asset_url: 'https://gitlab.com/group/example-module/-/releases/v3.0.0/downloads/module.json',
          }),
        ],
      },
    },
    {
      tag_name: 'v2.0.0',
      assets: { links: [link('v2.0.0', { name: 'module.json', url: 'https://example.org/files/12345' })] },
    },
    {
      tag_name: 'v1.5.0',
      assets: {
        links: [
          link('v1.5.0', {
            url: 'https://example.org/files/67890',
            direct_asset_url: 'https://gitlab.com/group/example-module/-/releases/v1.5.0/downloads/module.json',
          }),
        ],
      },
    },
    { tag_name: 'v1.0.0', assets: { links: [link('v1.0.0', { url: 'https://example.org/module.zip' })] } },
  ];
  const projectUrl = 'https://gitlab.com/group/example-module/-/releases/v3.0.0/downloads/module.json';

  // Regression: the manifest was loaded from the link's `direct_asset_url`, which redirects to its
  // `url` without CORS headers, so a browser could not load it; its `url` is the same file.
  it('lists the releases with the manifest linked, loading each from the link’s own URL', async () => {
    const { fetch } = fakeFetch({ [GITLAB_RELEASES]: { body: gitlabReleases } });
    const found = await gitlabSource(httpClient({ fetch })).releases(module, declared(projectUrl));
    expect(found.ok && found.value.map(r => [r.version, r.manifest])).toEqual([
      ['3.0.0', 'https://gitlab.com/group/example-module/-/raw/v3.0.0/module.json'],
      ['2.0.0', 'https://example.org/files/12345'],
      ['1.5.0', 'https://example.org/files/67890'],
    ]);
  });

  it('sends a token, to the hosts it is given', async () => {
    const url = 'https://git.example.org/api/v4/projects/team%2Fexample-module/releases?per_page=100';
    const { fetch, requests } = fakeFetch({ [url]: { body: [] } });
    await gitlabSource(httpClient({ fetch }), { token: 'secret', hosts: ['git.example.org'] }).releases(
      module,
      declared('https://git.example.org/team/example-module/-/raw/main/module.json'),
    );
    expect(requests[0]?.headers['PRIVATE-TOKEN']).toBe('secret');
  });

  it('records a gap when the answer cannot be read', async () => {
    const { fetch } = fakeFetch({ [GITLAB_RELEASES]: { body: { message: '404 Project Not Found' } } });
    expect(await gitlabSource(httpClient({ fetch })).releases(module, declared(projectUrl))).toMatchObject({
      ok: false,
      gap: { source: 'gitlab', reason: 'invalid' },
    });
  });
});
