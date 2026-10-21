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
 * The version a release tag names: the tag without what comes before its first digit, so
 * `v1.1.4` and `release-6.0.6` name `1.1.4` and `6.0.6`.
 *
 * @returns The version, or `undefined` when the tag has no digit
 */
export function tagVersion(tag: string): string | undefined {
  const start = tag.search(/\d/);
  return start === -1 ? undefined : tag.slice(start);
}

/**
 * Whether a URL names a version: one of its path's folders or files, read as a tag is, is the
 * version. A release's own files are found this way, such as
 * `releases/download/v1.1.4/module.json`, where `releases/latest/...` or a branch such as
 * `raw/master/...` gives whatever is newest.
 *
 * It is a heuristic: a URL that names a version may still be changed by its author, and a file
 * named for a version (`archive/1.1.4.zip`) is not counted, as the extension is part of its name.
 */
export function namesVersion(url: string, version: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return path.split('/').some(segment => {
    try {
      return tagVersion(decodeURIComponent(segment)) === unprefixed(version);
    } catch {
      return false;
    }
  });
}
