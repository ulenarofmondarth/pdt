/**
 * GitHub and GitLab: release lists that give a package's whole history, a manifest attached to
 * each release.
 *
 * Each finds a package's repository from its manifest URLs (see {@link SourceHints}), lists the
 * repository's releases (the newest 100), and makes a listed release of each that has the package's
 * manifest attached: `module.json` for a module, `system.json` for a system. A release's version is
 * read from its tag; loading the manifest checks it. Listings from these give no core bounds. A
 * release's zip, when it can tell which file that is, is its `download`: the manifest can be read
 * from it when the attached one cannot.
 */
import { z } from 'zod';

import { packageKey } from '../universe.js';
import { githubRepository, gitlabProject, tagName, tagVersion } from './repository.js';

import type { PackageRef, Release } from '../release.js';
import type { HttpClient } from './http.js';
import type { ReleaseSource, SourceGap, SourceHints, SourceResult } from './types.js';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

/** What a forge release gives: its tag, and the URLs of the files attached to it, by name. */
interface ForgeRelease {
  readonly tag: string;
  readonly files: readonly { readonly name: string; readonly url: string }[];
}

/** A release's zip: the one named `module.zip` or `system.zip`, or else its only zip. */
function zipOf(ref: PackageRef, files: ForgeRelease['files']): string | undefined {
  const zips = files.filter(file => file.name.endsWith('.zip'));
  const named = zips.find(file => file.name === `${ref.type}.zip`)?.url;
  const urls = new Set(zips.map(file => file.url));
  return named ?? (urls.size === 1 ? [...urls][0] : undefined);
}

/**
 * Whether a release tag may be of a package, for a repository that holds several, each tagging its
 * releases with its ID, as `pf2e-8.6.1` and `sf2e-1.6.1` are of one repository. Once any tag names
 * the package, only those that name it, or name nothing before the version, are its own. So are
 * they once the tags give two names or more, though none is the package's: the repository holds
 * other packages, which a manifest URL another package declares for this one may lead to, and their
 * tags are not this one's versions. Tags that all give one name, as `release-2.0.0` does, are the
 * package's own, named otherwise.
 */
function ownTags(ref: PackageRef, releases: readonly ForgeRelease[]): (tag: string) => boolean {
  const id = ref.id.toLowerCase();
  const names = new Set(
    releases.map(({ tag }) => tagName(tag)).filter((name): name is string => name !== undefined && name !== ''),
  );
  const several = names.has(id) || names.size > 1;
  return tag => {
    const name = tagName(tag);
    return !several || name === id || name === '';
  };
}

/** A listed release of each forge release with the package's manifest attached. */
function listed(ref: PackageRef, releases: readonly ForgeRelease[], origin: string): Release[] {
  const manifestName = `${ref.type}.json`;
  const own = ownTags(ref, releases);
  return releases.flatMap(({ tag, files }): Release[] => {
    if (!own(tag)) return [];
    const version = tagVersion(tag);
    const manifest = files.find(file => file.name === manifestName)?.url;
    if (version === undefined || manifest === undefined) return [];
    const download = zipOf(ref, files);
    return [
      {
        package: ref,
        version,
        compatibility: {},
        relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
        manifest,
        ...(download !== undefined && { download }),
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
      const gaps: SourceGap[] = [];
      // Each repository apart: one that cannot be read, such as an old home of the package, takes nothing from the
      // others.
      for (const url of urls) {
        const fetched = await http.getJson(url, { maxAge: ONE_HOUR, staleIfError: ONE_DAY, headers });
        if (!fetched.ok) {
          // A repository that is not there has no releases: it was deleted, or made private, and asking again will
          // not find it. (A renamed one is redirected to its new name, which the request follows.)
          if (fetched.gap.reason !== 'http' || fetched.gap.status !== 404) {
            gaps.push({ ...fetched.gap, source: name, package: packageKey(ref) });
          }
          continue;
        }
        const releases = read(fetched.value);
        if (releases === undefined) {
          gaps.push({ source: name, url, reason: 'invalid', package: packageKey(ref) });
          continue;
        }
        found.push(...listed(ref, releases, url));
      }
      // Nothing found, and something could not be read: the source failed, as it did before it asked several.
      const [first] = gaps;
      if (found.length === 0 && first !== undefined && gaps.length === urls.length) return { ok: false, gap: first };
      return { ok: true, value: found, ...(gaps.length > 0 && { gaps }) };
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
              // the last part of either of its URLs.
              const fileOf = (url: string) => url.split('/').at(-1) as string;
              const names = new Set([link.name, fileOf(link.url)]);
              if (link.direct_asset_url !== undefined) names.add(fileOf(link.direct_asset_url));
              // The file is loaded from the link's own URL. Its `direct_asset_url` only redirects
              // there, and the redirect has no CORS headers, so a browser could not follow it.
              return [...names].map(name => ({ name, url: link.url }));
            }),
          }))
        : undefined;
    },
  );
}
