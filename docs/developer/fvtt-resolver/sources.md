# Sources

The solver sees only a universe of releases (see {doc}`domain`). Building that universe means:
- fetching manifests;
- finding which releases exist;
- caching what was found.

All of that is I/O, so it lives outside the core, behind adapters.

## What a universe needs

- **Core releases**: Foundry VTT's builds, each with its generation and channel, limited to the builds the caller can run.
- **Package releases**: for every package that might take part, its releases, each with the manifest data of *that* release (not only the newest), and its download URL.

The second is the hard part. A manifest's `manifest` URL is, in Foundry's words, "a stable URL that describes the latest release version". It answers "what is the newest?", but not "what are all the versions, and what did each declare?". Yet the resolver needs the history: the release of a module that still works on core 13 may be several versions back.

## Where package releases come from

Each adapter implements one way of finding a package's releases. A universe is built from several, tried in order.

### Local

A package on disk: a directory with a `module.json` or `system.json`, or a zip. This is how the package under development takes part. pdt passes the project's own module, so the universe always holds the working copy, whatever has been published.

### Foundry VTT package index

Foundry's own setup screen learns about packages from a public, static index. Reading the 14.368 source, and the files themselves (20 October 2026), shows:

Index
: `https://r2.foundryvtt.com/package-api-public/index-latest.json`, with `https://foundryvtt.com/_api/packages/index/` as Foundry's fallback.
  - It's about 8 MB, with an ETag, and `Cache-Control: max-age=300`; `format: 1`.
  - It holds every listed package: about 7,600, premium ones included.
  - Each entry carries:
    - `id`, `type`, `title`;
    - `requires`: system ids;
    - `premium`, `exclusive`, `status` (archived or not), `latest_version`;
    - `compatibility`: a list of segments, each a core range (`from`, `to`, `verified`) with the best version for it and that version's manifest URL.

Details
: One file per package, at a URL the index gives (`details`, currently `https://r2.foundryvtt.com/package-api-public/detail/{id}.json`). It adds:
  - `versions`: each with `version`, `released`, `minimum`, `verified`, `manifest`, and a `notes` link;
  - the full description.

Manifests
: Every version's manifest URL is public, premium packages included. Their manifests are hosted on `r2.foundryvtt.com/packages-public/`.

This is the one source that covers premium packages, and it gives most packages' history without touching GitHub. Two limits:

- **Downloads of premium packages need the user's licence.** Foundry asks `https://foundryvtt.com/_api/packages/auth` with it. The resolver can include premium packages in a resolution, but an install plan marks them "install through Foundry VTT" (see {doc}`questions`, question 16).
- **The version list may not be complete.** dnd5e lists 28 versions, mostly the last patch of each minor. That may be what its authors chose to list (see {doc}`questions`, "Still to verify"). Where the history matters, the GitHub or GitLab adapter fills the gaps.

The listing's `minimum` and `verified` for a version can be edited on the website after release. Foundry widens an installed package's compatibility from them. The `listingCompatibility` policy decides whether they win over the manifest's.

### Manifest URL

The URL in a release's `manifest` field, or in a relationship's `manifest` field. It gives one release, the newest. That is enough when only the newest is wanted, but not to search the history. Foundry itself fetches a dependency's `manifest` URL to check it, so it checks against the newest release.

### GitHub releases

Many packages publish each version as a GitHub release, with the manifest and zip attached. The adapter:
- recognises a manifest URL of the usual `.../releases/latest/download/module.json` form;
- lists the repository's releases from the GitHub API, which gives the whole history, one manifest per release.

A token is optional, and raises the rate limit.

### GitLab releases

The same for packages on GitLab (gitlab.com, or a self-hosted instance named by the manifest URL's host), from the GitLab releases API. A token is optional.

## Where core releases come from

Foundry has no public API for its releases: its own update check sends the licence. Two public sources together give what pdt needs:

Foundry VTT release notes
: `https://foundryvtt.com/releases/` lists every build (`Release 14.369`) with its channel (stable, testing, development, prototype). It is an HTML page, so the adapter scrapes it, and fails loudly when the layout changes.

felddy/foundryvtt images
: pdt runs Foundry in a container from felddy/foundryvtt, tagged with the core version (`14.368`). The Docker Hub tag list (`https://hub.docker.com/v2/repositories/felddy/foundryvtt/tags`) says which builds have an image. Not every build does: 14.362 has release notes but no image, and neither have generation 14's testing, development and prototype builds, though generation 13's testing builds have. pdt turns the difference into core limits, each with its reason (see {doc}`domain`).

  The list holds thousands of tags (2,941 on 21 October 2026), mostly `sha-…` and dependabot builds, but it can be filtered by name: `?name=14.` gives a generation's tags in one request. pdt keeps only the tags that are exactly a release's version, so that each build has one image tag or none: `14.368` is build 14.368, while `14.368.0`, `14`, `latest` and the rest are ignored.

The second is pdt's concern, not the resolver's: another tool would pass its own limits, or none.

## Building a universe

A universe is built in two kinds of step:

Listing
: For a package, list its releases: each version, with what can be known without its manifest. The Foundry details file gives each version's `minimum` and `verified`. A GitHub or GitLab release list gives versions only. A listing is cheap: one request for a package, or none from the cache.

Loading
: For one release, fetch its manifest, which gives its `maximum` and its relationships. Each manifest costs one request, once ever.

A release that is listed but not loaded is still in the universe; the solver knows its version and, where the listing gives them, its core bounds. Loading is done only for releases the solver actually considers, in rounds (see [Resolving in rounds](resolution.md#resolving-in-rounds)). Listing walks out from the requirements:
1. List the releases of each required package.
2. Load the ones the solver considers, and read their relationships.
3. List every package they name, and repeat.

The walk stops at packages already listed, and can be limited, so a universe holds only what can matter. Two limits matter most:
- **Releases older than the one installed** are left out, unless the question is about downgrading.
- **Releases whose `minimum` is above every core of interest** are dropped without being loaded. A listing cannot rule a release *in*: it lacks `maximum` and relationships.

For a package, the sources are tried in order:
1. local;
2. a mirror, if one is configured;
3. the Foundry index;
4. GitHub or GitLab, for the history the index lacks;
5. the manifest URL.

### A manifest URL for one version

To install a particular version, Foundry needs a manifest URL that gives that version. The `manifest` a manifest gives itself almost never does: socketlib's, lib-wrapper's and tidy5e-sheet's say `releases/latest/...`, and dnd5e's, dae's and dice-so-nice's point into a branch, such as `raw/master/...`. So each release has a `versionManifest`, when one can be found: a URL that **names the version** (`namesVersion(url, version)`). One of its folders, read as a tag is, must be the version: `releases/download/v1.1.4/module.json`, `/-/releases/v14.0.18/downloads/module.json` or `/-/raw/6.4.4/...`, but not `latest`, `master`, or a branch named for a generation such as dae's `raw/v14`. Naming is a heuristic: an author can still replace a release's files.

The source set takes the first of these that names the version:
1. **The URL the release was listed with:** Foundry's details file gives one for each version, and it usually names it.
2. **A URL another source gives for the same version:** monks-tokenbar's listing gives `releases/latest/...` for every version, but GitHub has a `module.json` attached to each tag.
3. **When loading, the manifest beside the download:** a GitHub release usually attaches the manifest beside the zip, so `releases/download/v1.1.4/module.zip` suggests `releases/download/v1.1.4/module.json`. It costs a request, so it is tried only when the others fail, only for a release being loaded, and only if that URL names the version. What it fetches must be of the same package and version. Not finding one is not a gap.

On 21 October 2026, with every source, this found a URL for socketlib, lib-wrapper, dae, midi-qol, monks-tokenbar and dice-so-nice. times-up got none: its listing, its manifest and its download all point at the `master` branch, and it publishes no GitLab releases.

### Manifests from zips

A package's zip always holds its manifest, as Foundry installs it. So when a release's manifest cannot be fetched, or is of another release, and its zip is known, the manifest is read from the zip instead. The release is loaded as usual, with the zip as its `origin` and its `download`.

- **Where zips come from:** GitHub and GitLab listings give each release's zip as its `download`: the asset named for the type of package (`module.zip`, `system.zip`), or else the release's only zip. A listing that gives no zip, such as Foundry's details file, takes one from another source for the same version.
- **Without downloading it:** a zip ends with a directory of its files, so `zipManifest(http, url, type)` reads only parts of it. It asks for the first byte, to learn the zip's size, then the end, then the directory if the end did not hold it all, then the manifest. That is three requests, or four for a zip of many files, of under 140 kB in all. GitHub's file storage refuses a range counted from the end of the file, which is why the size comes first. A server that sends the whole zip instead is not read.
- **Which manifest:** as Foundry does, the `module.json` or `system.json` nearest the top of the zip. It must still be of the package and version listed.
- **Limits:** the directory up to 8 MB, the manifest up to 1 MB, compressed or not. An encrypted manifest, one not stored or deflated, and a ZIP64 zip are not read.
- **Kept:** what is read is kept in the cache, as a release's zip does not change. A zip that cannot be read is a gap, recorded with the manifest's.
- **When:** in loading, and in taking bounds from manifests (`manifestBounds`): only after the manifest has failed, so it costs nothing otherwise.

On 21 October 2026, dae 14.0.10's manifest on GitLab could not be read; its zip's could, giving its bounds and relationships in three requests. dae 13.0.10's could not be read either: the `module.json` in its zip is not valid JSON, so Foundry could not install it. GitHub source archives (`archive/<tag>.zip`) are not read, as their server ignores ranges.

Building is asynchronous and can fail partway: a URL is gone, or a rate limit is hit. Failures do not abort the build. They are recorded in the universe, as "releases of other-module could not be listed: HTTP 404". Explanations can then point at missing information as well as at constraints: "no release of other-module is known that supports core 14 (its releases could not be listed)".

## Request budget

The aim is to keep the requests to each source few, not to tune for scale. An estimate for a large installation:
- **About 150 installed modules.** Most questions concern releases newer than the installed ones.
- **A busy module has about 50 releases;** most have a handful.
- **The worst case loads every listed release:** about 7,500 manifests. In practice, the solver tries the newest acceptable release of each package first, and goes further back only on a conflict. So a package usually costs one or two manifests.

A first run against an empty cache, for 150 modules:

| Source | First run | Later runs |
| --- | --- | --- |
| Foundry index | 1 | 1, usually "not modified" |
| Foundry details | up to 150 | only packages whose `last_updated` changed |
| Manifests | a few per package, a few hundred at most | new versions only |
| GitHub or GitLab release lists | only for history the details file lacks | as for details |
| Core release notes, image tags | 1 each | at most daily |

GitHub's API allows 60 requests an hour without a token, and listing a repository's releases costs at least one. So a first run that lists 150 repositories would exceed it. Hence:
- the Foundry details file comes first;
- GitHub's API is used only for the history the details file lacks;
- a token is recommended for large installations.

Release downloads, where most manifests are, are not API calls. Whether they have a limit of their own is still to verify. GitLab's unauthenticated limits are higher, but the same order applies.

Each source has a budget per run: the most requests it may make, and how many at a time. When a budget runs out, building stops for that source and records a gap ("GitHub rate limit reached; history of other-module not listed"), as for any other failure.

## Caching and offline use

- **A fetched manifest:** a version's manifest does not change once published, so it is cached for good.
- **What expires:** the Foundry index (Foundry keeps it 5 minutes, revalidates with its ETag, and serves a stale copy for up to a day when the site cannot be reached), release lists, and the newest manifests.
- **Where:** the cache is an interface supplied by the caller. pdt would keep it under its user data directory; a browser tool might use IndexedDB; a test passes a map.

With a full cache, or a saved universe, everything works offline. That matters for CI, and for pdt users without a network.

Requests to Foundry's servers follow Foundry's own manners:
- revalidate rather than re-download;
- at most 8 detail requests at a time;
- a `User-Agent` naming the resolver.

See {doc}`questions`, question 15.

### Keeping the cache fresh

The cache need not wait for a question. A refresher keeps it current in the background, and the resolver then reads only from the cache. However often users ask, Foundry's servers see about one small request every few minutes from each refresher. The index makes this cheap, because it says what has changed:

Index
: Revalidated on a timer (every 5 to 15 minutes) with its ETag. When nothing has changed, the reply is an empty "not modified".

Details
: Each index entry carries `last_updated` and `latest_version`. Comparing a new index with the cached one gives exactly the packages that changed. Only their details files are fetched again. That also catches a version's `minimum` and `verified` being edited on the website.

Manifests
: Fetched once per version, and kept.

Release notes and image tags
: Checked daily at most. They change a few times a month.

The refresher caches only what matters:
- the installed packages;
- the packages their relationships name;
- what the user has asked about.

It never fetches the details of all 7,600 packages.

Foundry keeps its own copy of the index, in `Config/package-index.json` under its user data directory. The refresher can read it to start from, but not rely on it. Foundry refreshes that file only when someone browses for packages, and its format is private.

The cache, its refresh rules and its storage are part of the sources, with the storage and the clock passed in, so the same code runs in three places:
- **pdt**, which refreshes whenever it runs, under its user data directory;
- **a background task in a self-hosted Foundry server**, loaded with `node --import` like the proxy (see [A proxy for a Foundry module](#a-proxy-for-a-foundry-module)), which serves the cache to a Foundry module;
- **a container of its own**, beside Foundry's.

Inside Foundry's process, the task must never harm the server:
- **Errors:** an unhandled error or rejected promise can stop the server. Every timer callback catches its errors.
- **Work:** it runs in a `worker_thread`, so parsing the 8 MB index does not block Foundry.
- **Timers:** they are `unref()`'d, so they never keep the server from shutting down.
- **Storage:** the cache lives outside `Data`, which Foundry serves over HTTP.

A single mirror shared by every user would reduce requests further (see [A shared mirror](#a-shared-mirror)).

## A shared mirror

A mirror is a central cache: a separate project, not part of this one, that keeps Foundry's package data and serves it to everyone. To the resolver it is one more source, an adapter whose only option is the mirror's URL. The core and the other adapters do not change, and no user needs the mirror.

:::{note}
**As built:** the [Foundry VTT package catalogue](https://github.com/Mondarth/fvtt-package-catalogue) is such a mirror, though a server with a database rather than static files: it crawls a package when it is first asked for, with everything its releases require or run in, and keeps them up to date. `catalogueSource` reads it (see [As built](#as-built)). Its format is its own contract, `@mondarth/fvtt-package-catalogue-contract`, whose types are the resolver's.

It is not quite "one more source": `sourceSet` asks every source for every package, so a mirror among them would save nothing. `sourceSet` asks it first instead, and the other sources only for what it does not hold.
:::

### What it would give

Politeness
: Foundry's servers see one requester, however many users there are. The mirror applies the rules of [Keeping the cache fresh](#keeping-the-cache-fresh) once, for everyone.

Browsers
: The mirror can send CORS headers, so a Foundry module or a web tool reads it directly, with no proxy and no change to anyone's Foundry server.

History
: The mirror keeps every version it has seen, even after a details file drops one. It can add GitHub and GitLab release history once, centrally, rather than each user spending their own rate limit.

Core releases
: It can publish the core builds with their channels, scraped once from the release notes. It can also publish which builds have a felddy/foundryvtt image.

Normalised data and snapshots
: It can publish releases already normalised, with their warnings. Dated snapshots let a universe be rebuilt exactly as it was.

### How it could run

As static files rebuilt by a scheduled job: for example, a GitHub Actions workflow on a cron schedule, publishing to GitHub Pages or an object store. There is no server to run. Each run:
1. revalidates the index;
2. fetches the details of the packages that changed;
3. fetches the manifests of new versions;
4. commits the difference.

The repository's history then holds the snapshots.

### Format

The mirror publishes the resolver's own serialised universe: core releases, releases with their provenance, and gaps, split per package so a client fetches only what it needs. A saved universe, a lockfile replay and a mirror are then all read the same way. The format is documented and versioned with the resolver, so that another project can publish it.

### Cautions

Terms and content
: A mirror republishes Foundry's data, so it waits on Foundry's terms of use (see {doc}`questions`, question 15).
  - **It carries only what resolving needs:** ids, versions, compatibility, relationships and manifest URLs.
  - **It carries none of the authors' content:** no descriptions, media or other text.
  - **Premium packages:** whether even their compatibility may be republished is worth asking Foundry about on its own.

Trust
: A mirror is a single point of failure, and a single point to tamper with.
  - The resolver treats it as one source among several.
  - It falls back to the direct sources when the mirror is stale or cannot be reached.
  - Every record keeps its original URL in its provenance, so it can be checked against the source.

Freshness
: Data lags Foundry by up to the refresh interval. Each snapshot carries its date, so an explanation can say how old its data is.

Ownership
: Someone has to keep it running. A project of its own, open to other Foundry tools (perhaps under the League of Foundry Developers), has a better chance than one tied to pdt.

Before building one, ask Foundry to send `Access-Control-Allow-Origin: *` from `r2.foundryvtt.com/package-api-public/` and `r2.foundryvtt.com/packages-public/`. That alone removes the browser problem for Foundry's own data, though not the other benefits of a mirror.

## Browsers

Browser support is required, so the sources use only `fetch`, with no Node built-ins. Not every server lets a browser read it. Checked on 21 October 2026, with an `Origin` header:

| Server | Used for | CORS |
| --- | --- | --- |
| GitHub API (`api.github.com`) | GitHub release lists | yes, with preflights |
| GitHub release downloads (`github.com/…/releases/download/…`) | GitHub manifests, and most manifest URLs in Foundry's details files | no: neither the redirect nor `release-assets.githubusercontent.com` sends CORS headers |
| `raw.githubusercontent.com` | declared manifest URLs | yes, but preflights are refused |
| GitLab API (`gitlab.com/api/v4`) | GitLab release lists, and release links on the API | yes, with preflights |
| GitLab release links' permanent URLs (`/-/releases/…/downloads/…`) | not used | no: they redirect to the link's own URL, without CORS headers |
| GitLab release links' own URLs, such as the package registry (`/api/v4/projects/<id>/packages/…`) | GitLab manifests | yes, when the link is to GitLab itself; a link elsewhere is as that host allows |
| Foundry index and details (`r2.foundryvtt.com`) | the listing | only for the origin `https://foundryvtt.com`; preflights are refused |
| Foundry release notes (`foundryvtt.com`) | core releases | no |
| Docker Hub | image tags | no |

So every adapter takes a `fetch` supplied by the caller. Node passes the global one. A browser tool passes one that goes through a proxy, reads a mirror that sends CORS headers (see [A shared mirror](#a-shared-mirror)), or builds no universe at all and loads one made elsewhere. The core runs in a browser unchanged. See {doc}`questions`, question 14.

A download that CORS blocks fails as a network error. The release it was for stays listed, marked `loadFailed`, and `check` reports it among the releases checked from their listing (see [Resolving in rounds](resolution.md#resolving-in-rounds)). The gaps name each URL that failed.

### Through a CORS proxy

`proxiedFetch(fetch, proxy)` sends every request through a proxy. `proxy` is a template, such as `https://proxy.example/?url={url}`, in which `{url}` becomes the target, percent-encoded, or a function from the target to the proxy's URL. Encoding matters: unencoded, a GitLab project path's `%2F` is decoded on the way, so GitLab answers 404, and Docker Hub's `&name=14.` ends the proxy's own parameter, so Docker Hub returns every tag unfiltered.

```typescript
const http = httpClient({ fetch: proxiedFetch(globalThis.fetch, 'https://proxy.example/?url={url}') });
```

The proxy must follow redirects itself, since release downloads redirect to storage hosts. If it has a list of allowed hosts, the list needs every host the sources reach, and the hosts they redirect to:
- `r2.foundryvtt.com` and `foundryvtt.com`;
- `api.github.com`, `github.com`, `release-assets.githubusercontent.com` and `raw.githubusercontent.com`;
- `gitlab.com`, or the self-hosted GitLab;
- `hub.docker.com`.

Without `release-assets.githubusercontent.com`, every GitHub release download fails, and so does every manifest Foundry's details files point at GitHub.

Checked with [corsproxy](https://github.com/melihbirim/corsproxy) (commit 6fc4117, run locally) on 21 October 2026:
- With its defaults, every source works through it: it follows redirects, passes compressed answers through (the index, 8.3 MB, arrives as 731 kB, within its 10 MB limit), and passes `ETag` and `If-None-Match`.
- It never forwards `Authorization`, so a GitHub token does not reach GitHub, and GitHub's limit of 60 requests an hour applies to the proxy's address, shared by everyone using it. GitLab's `PRIVATE-TOKEN` is forwarded.
- `ALLOWED_HOSTS`, `RATE_LIMIT_PER_MINUTE` and `DAILY_REQUEST_LIMIT` can each make requests fail partway through a run. The sources load up to eight manifests at a time.
- For [manifests from zips](#manifests-from-zips), it forwards `Range` and passes on the parts, but does not expose `Content-Range` to the page (by its source; not run). Without the size, the end of a zip is asked for from the end, which GitLab allows and GitHub's file storage refuses: in a browser, GitHub zips cannot be read through it. A proxy that sends `Access-Control-Expose-Headers: Content-Range` can read both.

### A proxy for a Foundry module

When the browser tool is a Foundry VTT module, the Foundry server is the natural proxy: the module's page comes from it, so requests to it are same-origin and CORS does not arise. Foundry does not offer this, so the proxy is an addition, and only self-hosted servers can have it.

What Foundry has
: In 14.368 the server can already read the package index, fetch a remote manifest and check a package (`getPackages`, `getPackageFromRemoteManifest` and `checkPackage` in `dist/server/views/setup.mjs`). These serve the setup screen only: they need the administrator's login, and are refused while a world is running. Modules cannot add code to the server.

How to add it
: The server is a Node process, so a module can be loaded before Foundry starts: `node --import ./proxy.mjs main.mjs`, or `NODE_OPTIONS=--import=./proxy.mjs`. That module wraps Node's `http.createServer` and `https.createServer`, answers requests under a path of its own (such as `/fvtt-resolver/proxy?url=…`), and passes everything else to Foundry unchanged.
  - **No Foundry file is changed**, so nothing has to be re-applied after an update.
  - **It uses only Node's public API**, not Foundry's internals, so it does not depend on a build.

  Patching `main.mjs` or the minified `dist` files would also work, but would break with every build.

What it must do
: - **Forward `GET` only, and only to an allowlist of hosts.** The list is the package sources above: `r2.foundryvtt.com`, `foundryvtt.com/releases/`, `api.github.com`, GitHub release downloads, GitLab, and Docker Hub. Without the allowlist, anyone who can reach the server could use it to reach the user's network.
  - **Add no CORS headers**, so that other sites cannot read through it.
  - **Cache, and limit concurrent requests**, as described under [Caching and offline use](#caching-and-offline-use). Many module users then don't mean many requests to Foundry's servers.

Where it cannot work
: - **Hosted services**, such as The Forge, where the user does not control how the server starts.
  - **The desktop app**, which cannot be started this way without unpacking it, and whose updates would undo that.

With pdt
: pdt starts the container, so it can set `NODE_OPTIONS` and mount the proxy module. felddy/foundryvtt may also be able to run patch scripts at startup (`CONTAINER_PATCHES`; to verify). Or pdt can run the proxy as a small container beside Foundry's, and leave Foundry's server untouched.

:::{admonition} Open
:class: warning
- Whether to restrict the proxy to GM sessions. That means reading Foundry's session state, which is private API. The data it fetches is public, so the allowlist may be enough.
- Where GitHub and GitLab tokens live: in the browser, or in the proxy's configuration.
- Whether Foundry VTT's licence says anything about changing how its server is started. This proxy leaves Foundry's files untouched.
:::

## Where the adapters live

The core package (`@mondarth/fvtt-resolver`) contains no I/O at all. The sources are a subpath export of the same package, `@mondarth/fvtt-resolver/sources`, built on a `fetch` the caller gives. They would split into a package of their own only if they grew dependencies that users of the core should not have to install, such as zip reading.

### As built

`httpClient({ fetch, cache, now, budget, userAgent })`
: Fetches JSON:
  - from the cache while a value is fresh;
  - revalidating with its ETag when it is not;
  - serving a stale copy for a while when the server fails or cannot be reached.

  It works within a request budget (1,000 requests and 8 at once by default), and records a gap rather than throwing. The `Cache` is an interface; `memoryCache()` is one in memory.

  `getBytes(url, range)` fetches part of a file, within the budget but not cached, with the file's size when the server shows it. `remember(key, maxAge, make)` keeps a value made from what was fetched, such as a manifest read from a zip.

`foundryIndexSource(http)`
: Lists a package's releases from Foundry's index and its details file, as listed releases with the listing's `minimum` and `verified`.
  - **The index** is kept for 5 minutes, and serves stale for up to a day.
  - **A details file** is kept under the package's `last_updated`, so it is fetched again only when the package changes.

`sourceSet({ sources, http, core })`
: Works the sources together.
  - **`universe(packages)`** lists the packages: each version comes from the first source that lists it, and releases whose `minimum` is newer than every core of interest are left out.
  - **`load(needs)`** is the loader for `resolveInRounds`. It reads each release's manifest and keeps the listing's bounds. It also lists the packages the loaded releases require or run in that are not yet known, so the next round has them.
  - **A manifest of another version** than the one listed is refused, since a "latest" manifest URL would describe another release. A leading `v` is not another version: socketlib's manifest says `v1.1.4` where the listing says `1.1.4`, and the release keeps the listed version. Nor is the text before the number of a version listed from a tag: a manifest saying `release-6.0.6` is of the release listed as `6.0.6`.
  - **`gaps()`** gives what could not be fetched or read.

`githubSource(http, { token })` and `gitlabSource(http, { token, hosts })`
: List a repository's releases (the newest 100) from GitHub's or GitLab's API. Each with the package's manifest attached (`module.json` or `system.json`) becomes a listed release.
  - **Version:** read from the tag (`v1.1.4`, `release-6.0.6`). Loading the manifest checks it.
  - **Repository:** found from the package's manifest URLs, through the hints the source set gives each source:
    - *declared* URLs, from a relationship's `manifest` or the caller;
    - *seen* URLs, of the releases earlier sources listed.
  - **GitLab** recognises `gitlab.com`, or the self-hosted hosts given. A release link matches by its name, or by the file at the end of either of its URLs.
    - **The manifest is loaded from the link's own `url`,** not its `direct_asset_url`. The latter is a permanent link that redirects to the former, and the redirect sends no CORS headers, so a browser could not follow it.
    - **API URLs** (`/api/v4/…`), such as links into the package registry, name a project by number, so they give no project to find releases in.
  - **Tokens** are optional.

`manifestUrlSource(http)`
: Reads the release a *declared* manifest URL describes, already loaded. It never reads the URLs other sources listed, since those are one per version, and reading them all would spend the request budget.

`catalogueSource({ url, key, fetch, client })`
: Asks the [catalogue](#a-shared-mirror) for the universe of some packages: `POST {url}/api/v1/universe`, with the key in `X-API-Key` and the client, such as `EMMA/0.7.0`, in `X-Catalogue-Client`. Not a source of its own, but `sourceSet`'s `catalogue` option.
  - **One request** for up to 1,000 packages, more for more, gives every release of each, loaded, and of every package their releases require or run in, all the way down, with Foundry's builds and the catalogue's own gaps.
  - **`pending`:** the packages it does not hold yet. It crawls them once asked, so they are held the next time.
  - **Checked:** the answer is read with the contract's `UniverseResponse`. An error answer is an `http` gap, an unreachable catalogue a `network` gap, and an answer the contract refuses an `invalid` one, all from `catalogue`.
  - **Outside the budget:** it fetches with its own `fetch`, not through the `httpClient`, as its answers are not cached: the catalogue keeps its own data fresh.

`sourceSet({ …, catalogue })`
: With a catalogue, `universe(packages)` asks it first. What it holds comes from it alone, still left out by `core` like any release; the sources list only what it does not hold (worlds aside), with the manifests its releases declare as hints. A package it gave is known, so `load` does not list it again. When the catalogue fails, its gap is recorded and the sources list every package, as without one. `unlisted` and `manifestBounds` do not change what it gives: it decides those itself.

`localSource(manifests)`
: The caller's own manifests, read by the caller, such as the working copy of the package under development. Those it cannot read are listed in `problems`.

`foundryCoreReleases(http, { url })`
: Foundry's builds since version 9, each with its generation and channel, from the release notes. `httpClient` fetches the page with `getText`, which works as `getJson` does.
  - **Version:** read from each release's link text (`Release 14.368`), not its link: old releases are linked by id (`/releases/8.102` is 0.8.9). Releases before version 9 (`0.8.9`) are skipped, since core versions are `<generation>.<build>`.
  - **Channel:** the tag after the link, before the next release's (`release-tag stable`).
  - **Loudly:** a page with no builds, or a build without a channel, is an `invalid` gap, not a shorter list. Either means the layout has changed.
  - **Kept** for a day, and a stale copy serves for a week when the site cannot be reached.

  `readReleaseNotes(html)` reads a page already fetched.

`sourceSet({ …, manifests, listing, unlisted })`
: `manifests` declares manifest URLs for packages. `unlisted` decides what happens to releases of a listed package, from other sources, that are newer than the newest the listing offers. midi-qol shows why this needs a choice: its author publishes 14.6.x, 14.0.x and 13.0.x lines on GitLab, while Foundry's listing offers the 14.0.x line.
  - `exclude` (the default): leave them out, as Foundry's users cannot install them from it.
  - `last`: keep them, marked `unlisted`; `resolve` ranks every listed version ahead of them.
  - `include`: keep them as they are.

  Older releases from other sources always fill in the history. A package the listing does not list keeps every release. `listing` names the source whose listing counts: Foundry's index by default.

`sourceSet({ …, manifestBounds })`
: GitHub's and GitLab's release lists give versions only, and Foundry's details file may leave a version's bounds out. With `manifestBounds` (on by default), a listed release with no core bounds takes them from its manifest when it is listed: `minimum`, `verified` and `maximum`.
  - **It stays listed:** its relationships are unknown until it is loaded. Loading it later costs no request, since the manifest is kept.
  - **What it gains:** `check` gives such a release Foundry's real verdict rather than `UNKNOWN`. `resolve` drops releases that need a newer core than any of interest at listing, rather than loading them one round at a time.
  - **Failure:** a release whose manifest can't be read, or describes another release, is marked `loadFailed`, with a gap.
  - **Cost:** a request for each such release, once. On 21 October 2026, a first run resolving midi-qol with every source made 226 requests rather than 17, and took 3 rounds rather than 10 with `unlisted: include`. Later runs ask only for new releases' manifests. Turn it off for a tight budget.

### Live checks

`pnpm --filter @mondarth/fvtt-resolver check:live` runs the checks in `tests-live/` against the real services. It is never run in CI. It resolves midi-qol against Foundry's index, and reports the rounds, requests, gaps and setup found. On 20 October 2026, with Foundry's index alone, it took 3 rounds and 11 requests to find:
- core 14.368;
- dnd5e 5.3.3;
- midi-qol 14.0.15, dae 14.0.18, lib-wrapper 1.13.5.1 and socketlib 1.1.4.

With GitHub, dnd5e's history grew from the 28 versions Foundry's details list to 102. With every source:

| `unlisted` | Setup | Rounds | Requests |
| --- | --- | --- | --- |
| `exclude` | the same as above | 3 | 17 |
| `last` | the same as above | 4 | 19 |
| `include` | GitLab's midi-qol 14.6.0 and dae 14.6.0, with dnd5e 6.0.6 | 8 | 22 |

Without a token, GitHub allows 60 requests an hour; the live checks read `GITHUB_TOKEN`.

The release notes, on 21 October 2026, gave 109 builds since version 9, the newest 14.369: 58 stable, 24 testing, 13 development and 14 prototype.
