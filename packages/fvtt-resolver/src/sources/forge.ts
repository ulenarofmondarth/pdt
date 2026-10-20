/**
 * GitHub and GitLab: release lists that give a package's whole history, a manifest attached to
 * each release.
 *
 * Each finds a package's repository from its manifest URLs (see {@link SourceHints}), lists the
 * repository's releases (the newest 100), and makes a listed release of each that has the package's
 * manifest attached: `module.json` for a module, `system.json` for a system. A release's version is
 * read from its tag; loading the manifest checks it. Listings from these give no core bounds.
 */
import { z } from 'zod';

import { packageKey } from '../universe.js';
import { githubRepository, gitlabProject, tagVersion } from './repository.js';

import type { PackageRef, Release } from '../release.js';
import type { HttpClient } from './http.js';
import type { ReleaseSource, SourceHints, SourceResult } from './types.js';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

/** What a forge release gives: its tag, and the URLs of the files attached to it, by name. */
interface ForgeRelease {
  readonly tag: string;
  readonly files: readonly { readonly name: string; readonly url: string }[];
}

/** A listed release of each forge release with the package's manifest attached. */
function listed(ref: PackageRef, releases: readonly ForgeRelease[], origin: string): Release[] {
  const manifestName = `${ref.type}.json`;
  return releases.flatMap(({ tag, files }): Release[] => {
    const version = tagVersion(tag);
    const manifest = files.find(file => file.name === manifestName)?.url;
    if (version === undefined || manifest === undefined) return [];
    return [
      {
        package: ref,
        version,
        compatibility: {},
        relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
        manifest,
        protected: false,
        origin,
        detail: 'listed',
      },
    ];
  });
}

/** A source of a forge: its name, how to find a repository's releases, and how to read them. */
function forgeSource(
  name: string,
  http: HttpClient,
  releasesUrl: (url: string) => string | undefined,
  headers: Readonly<Record<string, string>>,
  read: (value: unknown) => ForgeRelease[] | undefined,
): ReleaseSource {
  return {
    name,
    async releases(ref, hints: SourceHints = { declared: [], seen: [] }): Promise<SourceResult<Release[]>> {
      const urls = [...new Set([...hints.declared, ...hints.seen].map(releasesUrl).filter(url => url !== undefined))];
      const found: Release[] = [];
      for (const url of urls) {
        const fetched = await http.getJson(url, { maxAge: ONE_HOUR, staleIfError: ONE_DAY, headers });
        if (!fetched.ok) return { ok: false, gap: { ...fetched.gap, source: name, package: packageKey(ref) } };
        const releases = read(fetched.value);
        if (releases === undefined)
          return { ok: false, gap: { source: name, url, reason: 'invalid', package: packageKey(ref) } };
        found.push(...listed(ref, releases, url));
      }
      return { ok: true, value: found };
    },
  };
}

const githubReleases = z.array(
  z.looseObject({
    tag_name: z.string(),
    draft: z.boolean().optional(),
    assets: z.array(z.looseObject({ name: z.string(), browser_download_url: z.string() })),
  }),
);

export interface GithubOptions {
  /** A token, to raise the rate limit (60 requests an hour without one). */
  readonly token?: string;
  readonly apiUrl?: string;
}

/** Lists releases from GitHub's API. Drafts are left out. */
export function githubSource(
  http: HttpClient,
  { token, apiUrl = 'https://api.github.com' }: GithubOptions = {},
): ReleaseSource {
  return forgeSource(
    'github',
    http,
    url => {
      const repository = githubRepository(url);
      return repository && `${apiUrl}/repos/${repository.owner}/${repository.repo}/releases?per_page=100`;
    },
    { Accept: 'application/vnd.github+json', ...(token !== undefined && { Authorization: `Bearer ${token}` }) },
    value => {
      const read = githubReleases.safeParse(value);
      return read.success
        ? read.data
            .filter(release => release.draft !== true)
            .map(release => ({
              tag: release.tag_name,
              files: release.assets.map(asset => ({ name: asset.name, url: asset.browser_download_url })),
            }))
        : undefined;
    },
  );
}

const gitlabReleases = z.array(
  z.looseObject({
    tag_name: z.string(),
    assets: z.looseObject({
      links: z.array(z.looseObject({ name: z.string(), url: z.string(), direct_asset_url: z.string().optional() })),
    }),
  }),
);

export interface GitlabOptions {
  /** A token, for private projects or a higher rate limit. */
  readonly token?: string;
  /** The GitLab hosts to recognise; gitlab.com by default. */
  readonly hosts?: readonly string[];
}

/** Lists releases from GitLab's API, of gitlab.com or a self-hosted instance. */
export function gitlabSource(http: HttpClient, { token, hosts = ['gitlab.com'] }: GitlabOptions = {}): ReleaseSource {
  return forgeSource(
    'gitlab',
    http,
    url => {
      const project = gitlabProject(url, hosts);
      return (
        project && `https://${project.host}/api/v4/projects/${encodeURIComponent(project.path)}/releases?per_page=100`
      );
    },
    token === undefined ? {} : { 'PRIVATE-TOKEN': token },
    value => {
      const read = gitlabReleases.safeParse(value);
      return read.success
        ? read.data.map(release => ({
            tag: release.tag_name,
            files: release.assets.links.flatMap(link => {
              // A link's name is a label, which may be the file's name; otherwise the file's name is
              // the last part of its URL.
              const url = link.direct_asset_url ?? link.url;
              return [link.name, url.split('/').at(-1) as string].map(name => ({ name, url }));
            }),
          }))
        : undefined;
    },
  );
}
