# Decisions and open questions

## Decisions

From the first review (20 October 2026):

| # | Question | Decision | Effect on the design |
| --- | --- | --- | --- |
| 1 | What are "declared valid combinations"? | The support matrix, overrides and pins serve for the first pass | As in {doc}`domain` |
| 2 | Scope of the first version | As proposed: modules, systems, core, `requires`, `systems`, `conflicts`; check, resolve and explain. The matrix, upgrade, `recommends` as installs and worlds as dependencies come later | — |
| 3 | Policy defaults | As proposed | See {ref}`policy` |
| 4a | May the resolver read Foundry's website? | Yes: it is the only practical way to learn about premium packages | Foundry's public package index is a source (see {doc}`sources`) |
| 4b | Which sources to start with | GitHub, manifest URLs, local packages, and GitLab | GitLab adapter added |
| 4c | Tokens for rate limits | Optional, for GitHub and GitLab | Each adapter takes an optional token. GitHub's API allows 60 requests an hour without one, so it is used only for history Foundry's details file lacks, and a token is recommended for large installations (see [Request budget](sources.md#request-budget)) |
| 5 | Core release list | Fetch it, and match it against the felddy/foundryvtt images, since pdt can only run builds that have one | Core limits (see {doc}`domain`) |
| 6 | Own solver or a library | Own PubGrub | As in {doc}`resolution` |
| 7 | Browsers | Essential | No Node built-ins in the core or the sources; see question 14 |
| 8 | Lockfile | pdt's business | As in {doc}`api` |
| 9 | Package version order | An option, defaulting to Foundry's order | `versionOrder` policy |

From the second review (20 October 2026), accepting the proposals that came out of reading Foundry's source:

| # | Question | Decision | Effect on the design |
| --- | --- | --- | --- |
| 10 | Relationship bounds: Foundry compares a relationship's `maximum` exactly, so `maximum: "4"` rules out `4.1.0`, though authors almost certainly mean "4.x" | Follow Foundry by default; offer `prefix`, so `"4"` reads as every `4.x`; report every release the two readings disagree on | `relationshipBounds` policy, default `foundry` |
| 11 | System version ranges: Foundry marks a mismatch unverified, not refused | Treat them like `verified` | `systemCompatibility` policy, default `prefer` |
| 12 | Stricter than Foundry: where Foundry's checks are partial, the resolver applies the full rules (a dependency's range, dependencies of dependencies) | Each verdict carries both what Foundry would show and what the resolver found. Where Foundry would let a setup through that the resolver refuses, the result says so | See [Setups](domain.md#setups) |
| 13 | The listing against the manifest: authors can edit a version's `minimum` and `verified` on the website after release, and Foundry widens installed compatibility from them | Take the listing's values when they are known. Keep both in the provenance, so an explanation can say "the listing says 14, the manifest says 13" | `listingCompatibility` policy, default `prefer` |
| 17 | Pre-v10 `dependencies`: v14 ignores them, but releases that use them were written for cores that read them | Normalise them into `requires`, with a warning | See [Normalising manifests](domain.md#normalising-manifests) |

## Foundry VTT behaviour, verified

Checked against the source of Foundry VTT 14.368 (the server and client code in its distribution). The paths below are within that distribution. Each finding becomes a test.

| Question | Finding | Where |
| --- | --- | --- |
| How a generation-form bound is compared with a core build | `maximum` and `verified`: generation only, when the bound is a whole number (`"13"` admits every 13.x). `minimum`: `"13"` is never newer than a 13.x build, so it admits them all. Build-form bounds compare exactly | `common/packages/base-package.mjs`, `testAvailability` |
| The rules of `isNewerVersion` | See [Package versions](domain.md#package-versions). Notably, `1.0.0-beta` counts as newer than `1.0.0` | `common/utils/helpers.mjs` |
| `PACKAGE_AVAILABILITY_CODES` in v14 | Twelve codes, 0 to 11; a package is unusable when its code is above 4 | `common/constants.mjs` |
| Whether `conflicts` is enforced | No. `conflicts` and `recommends` are in the manifest schema and read by nothing else | Searched all of `common`, `client` and `dist` |
| Whether `relationships.systems` constrains the system's version | The system's id is hard: a module is offered only in worlds of a listed system. The version range is soft: a mismatch gives `UNVERIFIED_SYSTEM`, which is still usable | `dist/packages/module.mjs`, `common/packages/base-package.mjs` (`_testSupportedSystems`) |
| What a `requires` entry of type `system` or `world` means | Nothing: every check skips `requires` entries that are not modules | `base-package.mjs`, `base-world.mjs`, `client/applications/sidebar/apps/module-management.mjs` |
| How relationship ranges are compared | With plain `isNewerVersion`, no generation form: `maximum: "4"` admits `4` but not `4.1.0`. A relationship's `verified` is not read | `base-package.mjs`, `testDependencyCompatibility`; `module-management.mjs` |
| Pre-v10 manifest fields in v14 | Mapped: `name`, `author`, `minimumCoreVersion`, `compatibleCoreVersion`, `maximumCoreVersion`, `systems`. Not mapped: `dependencies`, which v14 ignores | `base-package.mjs`, the legacy key table |
| Whether the package listing has an API for release history | Yes: a public, static package index and a details file per package, listing versions with a manifest URL each, premium packages included | `common/constants.mjs`, `dist/packages/package.mjs`; see {doc}`sources` |
| How Foundry resolves a dependency given by `id` only | From the installed packages, or the package index. A dependency with a `manifest` URL is fetched from it, which gives the newest release | `base-package.mjs`, `_testRequiredDependencies` |
| Whether Foundry has a public list of core releases | No API without a licence (its update check sends the licence). The release notes page lists every build with its channel | `dist/core/update.mjs`; foundryvtt.com/releases/ |

Checked against the services themselves, on 21 October 2026:

| Question | Finding | Where |
| --- | --- | --- |
| Which builds felddy/foundryvtt has images for | No fixed rule by channel: generation 13's testing builds have images, generation 14's testing, development and prototype builds have none, and some stable builds have none (14.362). So pdt reads the tags rather than assuming | Docker Hub's tag list; see {doc}`sources` |
| How the release notes link old releases | By id, not version: `/releases/8.102` is 0.8.9. The link text gives the version | foundryvtt.com/releases/ |

Foundry's own checks are partial, and its source says so in `FIXME` comments:
- a package's availability does not consider its dependencies;
- a world checks that its required modules suit the core, but not that they are in the required range.

The module management screen does check the ranges before a module is activated. See decision 12.

## Open questions

These came out of the first review and the reading of the source. They concern the sources and pdt's integration, not the core.

14. **Browsers and CORS.** On 20 October 2026, the following sent no CORS headers:
    - Foundry's package index and details;
    - Foundry's release notes;
    - Docker Hub;
    - GitHub's release downloads.

    GitHub's and GitLab's APIs did. A browser tool can therefore run the core, and list releases from GitHub and GitLab, directly. Their manifests are another matter: checked again on 21 October 2026, GitHub's release downloads and GitLab's `/-/releases/…/downloads/` links redirect without CORS headers, so a browser cannot load them. GitLab's are only permanent links to each link's own URL, so the GitLab source loads that instead, which a browser can read when it is on GitLab. For those, and the rest, it needs a proxy, or a universe built elsewhere. Proposal: every source takes a caller-supplied `fetch`, so a browser tool can route requests through its own proxy. As built: `proxiedFetch` (see [Through a CORS proxy](sources.md#through-a-cors-proxy)).

    When the browser tool is a Foundry module, the proxy can be the user's own Foundry server, if they host it themselves. A small module loaded with `node --import` would forward `GET` requests to an allowlist of hosts. It changes no Foundry file, and can't work on hosted services or the desktop app. See [A proxy for a Foundry module](sources.md#a-proxy-for-a-foundry-module). Acceptable, and is the proxy worth building, either as part of the resolver or as a pdt feature?
15. **Using Foundry's index politely.** The index is public, static and unauthenticated, and Foundry itself uses it, but I found no published terms of use. Proposal: behave as Foundry does:
    - send `If-None-Match` (the index has an ETag), and keep a copy for 5 minutes;
    - make at most 8 detail requests at a time;
    - send a `User-Agent` naming the resolver.

    Beyond that, a background refresher keeps the cache current and the resolver reads only from the cache (see [Keeping the cache fresh](sources.md#keeping-the-cache-fresh)):
    - the index is revalidated every 5 to 15 minutes;
    - only the details of packages whose `last_updated` changed are fetched again;
    - each manifest is fetched once;
    - only installed packages, the packages they name, and what the user asked about are cached.

    It runs in pdt, as a background task in a self-hosted Foundry server, or in a container of its own.

    A mirror would be politer still: a separate project that keeps Foundry's data centrally and serves it to everyone (see [A shared mirror](sources.md#a-shared-mirror)). It would:
    - make one requester of all users;
    - send CORS headers, so browsers need no proxy;
    - keep the full history, and the core build list.

    It would carry only what resolving needs (no descriptions or media), and publish the resolver's own universe format. The resolver would treat it as one source among several and fall back to the direct sources. It republishes Foundry's data, though, and needs an owner.

    Ask Foundry before any heavy use. In the same conversation, ask:
    - whether a mirror may republish compatibility data, premium packages' included;
    - whether Foundry would send `Access-Control-Allow-Origin: *` from its package files.

    Are the refresher and its intervals acceptable, and is the mirror worth starting as a project of its own?

    As built: the [Foundry VTT package catalogue](https://github.com/Mondarth/fvtt-package-catalogue), read by `catalogueSource` and asked first by `sourceSet` (see [As built](sources.md#as-built)). The direct sources remain the fallback.
16. **Premium downloads.** Premium manifests are public, so the resolver can include premium packages in a resolution. Downloading them needs the user's licence (Foundry's `/_api/packages/auth`). Proposal: an install plan marks them "install through Foundry VTT", and pdt does not download them for now.

## Still to verify

| Question | Why it matters |
| --- | --- |
| Whether the details file lists every version, or only those an author lists on the website. dnd5e shows 28 versions, mostly the last patch of each minor | Whether GitHub is still needed for history |
| How stable the index format is (it carries `format: 1`) | Breakage of the listing source |
| Whether GitHub release downloads (where most manifests are) have a rate limit of their own | The request budget for manifests |
