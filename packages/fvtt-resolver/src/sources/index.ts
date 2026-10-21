/**
 * The sources of releases and core releases: where a universe comes from. Everything here fetches through a `fetch`
 * the caller gives, so it runs in Node or a browser, and nothing in the core depends on it.
 *
 * @packageDocumentation
 */
export { memoryCache, type Cache, type CacheEntry } from './cache.js';
export {
  DEFAULT_BUDGET,
  httpClient,
  type ByteRange,
  type Fetched,
  type FilePart,
  type GetOptions,
  type HttpClient,
  type HttpOptions,
  type RequestBudget,
} from './http.js';
export { FOUNDRY_PACKAGE_INDEX, foundryIndexSource, type FoundryIndexOptions } from './foundry-index.js';
export {
  FOUNDRY_RELEASE_NOTES,
  foundryCoreReleases,
  readReleaseNotes,
  type FoundryReleasesOptions,
} from './foundry-releases.js';
export { proxiedFetch, proxyUrlFor, type ProxyUrl } from './proxy.js';
export { MAX_DIRECTORY, MAX_MANIFEST, zipManifest } from './zip-manifest.js';
export { sourceSet, type SourceSet, type SourceSetOptions } from './source-set.js';
export { githubSource, gitlabSource, type GithubOptions, type GitlabOptions } from './forge.js';
export { manifestUrlSource } from './manifest-url.js';
export { localSource, type LocalManifest, type LocalSource } from './local.js';
export {
  githubRepository,
  gitlabProject,
  tagVersion,
  type GithubRepository,
  type GitlabProject,
} from './repository.js';
export type { ReleaseSource, SourceGap, SourceHints, SourceResult } from './types.js';
