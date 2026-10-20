/**
 * The sources of releases: where a universe comes from. Everything here fetches through a `fetch`
 * the caller gives, so it runs in Node or a browser, and nothing in the core depends on it.
 *
 * @packageDocumentation
 */
export { memoryCache, type Cache, type CacheEntry } from './cache.js';
export {
  DEFAULT_BUDGET,
  httpClient,
  type Fetched,
  type GetOptions,
  type HttpClient,
  type HttpOptions,
  type RequestBudget,
} from './http.js';
export { FOUNDRY_PACKAGE_INDEX, foundryIndexSource, type FoundryIndexOptions } from './foundry-index.js';
export { sourceSet, type SourceSet, type SourceSetOptions } from './source-set.js';
export type { ReleaseSource, SourceGap, SourceResult } from './types.js';
