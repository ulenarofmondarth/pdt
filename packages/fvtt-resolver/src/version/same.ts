/**
 * One version written two ways.
 *
 * Packages write a version with a leading `v` or without: socketlib's manifest gives `v1.1.4`,
 * which Foundry VTT reports as installed, where Foundry's package listing and the release's tag
 * give `1.1.4`. Foundry compares the text, so to it these differ; the resolver counts them as one
 * version, wherever it matches a version it is given against the releases it knows. Any other
 * difference makes another version.
 */

/** A version without a leading `v` or `V` before a digit: what counts when matching versions. */
export function unprefixed(version: string): string {
  return version.replace(/^[vV](?=\d)/, '');
}

/** Whether two versions are the same version, a leading `v` or `V` aside. */
export function sameVersion(a: string, b: string): boolean {
  return unprefixed(a) === unprefixed(b);
}
