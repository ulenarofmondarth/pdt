/**
 * One version written two ways.
 *
 * Packages write a version with a leading `v` or without: socketlib's manifest gives `v1.1.4`,
 * which Foundry VTT reports as installed, where Foundry's package listing and the release's tag
 * give `1.1.4`. Foundry compares the text, so to it these differ; the resolver counts them as one
 * version, wherever it matches a version it is given against the releases it knows. Any other
 * difference makes another version.
 *
 * A URL can name a version too, as a manifest URL for one release does where one that always gives
 * the newest does not.
 */

/** A version without a leading `v` or `V` before a digit: what counts when matching versions. */
export function unprefixed(version: string): string {
  return version.replace(/^[vV](?=\d)/, '');
}

/** Whether two versions are the same version, a leading `v` or `V` aside. */
export function sameVersion(a: string, b: string): boolean {
  return unprefixed(a) === unprefixed(b);
}

/**
 * Where the version in a release tag starts: at the first digit that starts the tag or follows a
 * separator, a character other than a letter, digit or dot, which is within a version, a `v` or `V`
 * before it aside, so that a name with digits in it before the version is not read as part of it;
 * or else at its first digit.
 */
function versionStart(tag: string): number {
  const bounded = /(?:^|[^\p{L}\p{N}.])[vV]?(\d)/u.exec(tag);
  return bounded === null ? tag.search(/\d/) : bounded.index + bounded[0].length - 1;
}

/**
 * The version a release tag names: the tag without what comes before it, so `v1.1.4`,
 * `release-6.0.6` and `pf2e-8.6.1` name `1.1.4`, `6.0.6` and `8.6.1`. The version starts at the
 * first digit that starts the tag or follows a separator, a `v` before it aside, or else at the
 * first digit, so `release2.0` names `2.0`.
 *
 * @returns The version, or `undefined` when the tag has no digit
 */
export function tagVersion(tag: string): string | undefined {
  const start = versionStart(tag);
  return start === -1 ? undefined : tag.slice(start);
}

/**
 * What a release tag names before its version, without the separators and `v` between them,
 * lowercased: `pf2e` for `pf2e-8.6.1`, and an empty string for `v1.1.4` or `1.1.4`.
 *
 * @returns The name, or `undefined` when the tag has no digit
 */
export function tagName(tag: string): string | undefined {
  const start = versionStart(tag);
  if (start === -1) return undefined;
  return tag
    .slice(0, start)
    .replace(/[vV]$/, '')
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .toLowerCase();
}

/**
 * Whether a URL names a version: one of its path's folders or files, read as a tag is, is the
 * version. A release's own files are found this way, such as
 * `releases/download/v1.1.4/module.json`, where `releases/latest/...` or a branch such as
 * `raw/master/...` gives whatever is newest. A manifest named for its version counts too, read
 * without its `.json`: Foundry VTT's own listing gives a premium package's versions as
 * `packages-public/<id>/module-6.1.0.json`, where `packages-public/<id>/module.json` gives the
 * newest.
 *
 * It is a heuristic: a URL that names a version may still be changed by its author, and any other
 * file named for a version (`archive/1.1.4.zip`) is not counted, as the extension is part of its
 * name.
 */
export function namesVersion(url: string, version: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  const segments = path.split('/');
  const file = path.slice(path.lastIndexOf('/') + 1);
  if (file.endsWith('.json')) segments.push(file.slice(0, -'.json'.length));
  return segments.some(segment => {
    try {
      return tagVersion(decodeURIComponent(segment)) === unprefixed(version);
    } catch {
      return false;
    }
  });
}
