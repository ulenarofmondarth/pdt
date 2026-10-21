/**
 * Where a package's code lives, as its manifest URLs show it.
 */

/** A GitHub repository. */
export interface GithubRepository {
  readonly owner: string;
  readonly repo: string;
}

/** A GitLab project, on gitlab.com or a self-hosted instance. */
export interface GitlabProject {
  readonly host: string;
  /** The project's full path, groups included: `group/subgroup/project`. */
  readonly path: string;
}

function parse(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

/**
 * The GitHub repository a URL is in: a release download (`github.com/<owner>/<repo>/releases/...`)
 * or a raw file (`raw.githubusercontent.com/<owner>/<repo>/...`).
 */
export function githubRepository(url: string): GithubRepository | undefined {
  const parsed = parse(url);
  if (parsed === undefined || !['github.com', 'raw.githubusercontent.com'].includes(parsed.hostname)) return undefined;
  const [owner, repo] = parsed.pathname.split('/').filter(s => s !== '');
  return owner === undefined || repo === undefined ? undefined : { owner, repo: repo.replace(/\.git$/, '') };
}

/** The path segments after which a GitLab URL is no longer the project's path. */
const GITLAB_STOPS = new Set(['-', 'raw', 'blob', 'releases', 'uploads', 'tree', 'archive', 'jobs']);

/**
 * The GitLab project a URL is in, such as `gitlab.com/tposney/midi-qol/-/releases/...` or
 * `gitlab.com/tposney/times-up/raw/master/...`.
 *
 * @param hosts - The GitLab hosts to recognise; gitlab.com by default
 */
export function gitlabProject(url: string, hosts: readonly string[] = ['gitlab.com']): GitlabProject | undefined {
  const parsed = parse(url);
  if (parsed === undefined || !hosts.includes(parsed.hostname)) return undefined;
  const segments = parsed.pathname.split('/').filter(s => s !== '');
  // An API URL, such as a release link's into the package registry, names a project by number.
  if (segments[0] === 'api') return undefined;
  const end = segments.findIndex(segment => GITLAB_STOPS.has(segment));
  const path = (end === -1 ? segments : segments.slice(0, end)).join('/');
  return path.includes('/') ? { host: parsed.hostname, path } : undefined;
}

/**
 * The version a release tag names: the tag without what comes before its first digit, so
 * `v1.1.4` and `release-6.0.6` name `1.1.4` and `6.0.6`.
 *
 * @returns The version, or `undefined` when the tag has no digit
 */
export function tagVersion(tag: string): string | undefined {
  const start = tag.search(/\d/);
  return start === -1 ? undefined : tag.slice(start);
}
