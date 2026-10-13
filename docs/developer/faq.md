# FAQ

More an 'expected questions'.

## Why reimplement `pack`/`unpack`?

I'm learning Typescript, NodeJS, and Foundry VTT all at the same time, so this seemed like a reasonable exercise. Having a reference implementation in [foundry-cli](https://github.com/foundryvtt/foundryvtt-cli/blob/main/lib/package.mjs) helps clarify 'how' the compendium packs work.

I'll likely be reimplementing other elements as I go, again as part of a learning exercise.

## Why use `vite`?

{program}`vite` is typically used to create bundles for web tooling, why use it for this CLI tool?

Initially I had used a simple `tsc` build chain but I ended up running in to issues with ESM code so I decided to 'bite the bullet' and go all in on ESM. This had consequences.

Anyway, I was using {program}`vite` for other (web) projects and it plays nicely with ESM, so adopting it was consistent with that approach.

There where a couple of issues though.

### Hoisting

I am using [node-config](https://www.npmjs.com/package/config) but wanted to mangle the `NODE_CONFIG_DIR` to provide a better user experience within {program}`pdt`. Problem is that this requires code to run prior to the import of `node-config`. No problem in CJS, but in ESM the imports are all hoisted and the code runs after them. The solution was to put the code to mangle the envirnment variable into a module of its own, import this before `node-config` and voila problem solved. For a while. {program}`vite` wants to create a single bundle by default and it takes local modules (those in our source tree) and expands them out, tree shakes them, then mangles them together into a file. The upshot of all this being that we are back to square one, the code to mangle `NODE_CONFIG_DIR` ends up *after* the import for `node-config`.

The simplest solution (I have at the moment) is to have {program}`vite` build all the source files individually into the output (this maintaining *all* imports, the import order, and their relative paths). This 'fixes' all the issues with load/execution order and config works as expected.

## Why use `vitest`?

I had initially used [Jest](https://jestjs.io) for testing but its support for ESM is a bit second class (or as they say 'experimental'). Since {program}`vitest` exists and integrates with the {program}`vite` tool chain (and is *almost* a drop in for Jest) it was a no brainer to switch to using {program}`vitest` on the project.

The one significant difference between Jest and vitest is the details of ther mock/spy implementation. Nothing major but did require a few tweaks.
