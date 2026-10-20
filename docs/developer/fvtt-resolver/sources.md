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
: `https://foundryvtt.com/releases/` lists every build (`Release 14.369`) with its channel (stable, testing, development, prototype). It is an HTML page, so the adapter scrapes it, and must be tested against a saved copy so a layout change fails loudly.

felddy/foundryvtt images
: pdt runs Foundry in a container from felddy/foundryvtt, tagged with the core version (`14.368`). The Docker Hub tag list (`https://hub.docker.com/v2/repositories/felddy/foundryvtt/tags`) says which builds have an image. Not every build does: 14.362 has release notes but no image. pdt turns the difference into core limits, each with its reason (see {doc}`domain`).

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

Browser support is required, so the sources use only `fetch`, with no Node built-ins. Not every server lets a browser read it. Checked on 20 October 2026, with an `Origin` header:

| Server | CORS |
| --- | --- |
| GitHub API (`api.github.com`) | yes |
| GitLab API (`gitlab.com/api/v4`) | yes |
| GitHub release downloads | no |
| Foundry index, details and manifests (`r2.foundryvtt.com`) | no |
| Foundry release notes (`foundryvtt.com`) | no |
| Docker Hub | no |

So every adapter takes a `fetch` supplied by the caller. Node passes the global one. A browser tool passes one that goes through its own proxy, reads a mirror that sends CORS headers (see [A shared mirror](#a-shared-mirror)), or builds no universe at all and loads one made elsewhere. The core runs in a browser unchanged. See {doc}`questions`, question 14.

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

The core package (`@mondarth/fvtt-resolver`) contains no I/O at all. The adapters go in one of two places:
- a subpath export of the same package (`@mondarth/fvtt-resolver/sources`), built on `fetch` only;
- or a second package (`@mondarth/fvtt-resolver-sources`), if they grow dependencies (zip reading, HTML parsing) that users of the core should not have to install.

Start with the subpath, and split only if it is needed.
