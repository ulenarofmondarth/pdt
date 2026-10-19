# FAQ

More an 'expected questions'.

## Why reimplement `pack`/`unpack`?

I'm learning Typescript, NodeJS, and Foundry VTT all at the same time, so this seemed like a reasonable exercise. Having a reference implementation in [foundry-cli](https://github.com/foundryvtt/foundryvtt-cli/blob/main/lib/package.mjs) helps clarify 'how' the compendium packs work.

I'll likely be reimplementing other elements as I go, again as part of a learning exercise.

## Why use `vite`?

{program}`vite` is typically used to create bundles for web tooling, why use it for this CLI tool?

Initially I had used a simple `tsc` build chain but I ended up running in to issues with ESM code so I decided to 'bite the bullet' and go all in on ESM. This had consequences.

Anyway, I was using {program}`vite` for other (web) projects and it plays nicely with ESM, so adopting it was consistent with that approach.

## Why use `vitest`?

I had initially used [Jest](https://jestjs.io) for testing but its support for ESM is a bit second class (or as they say 'experimental'). Since {program}`vitest` exists and integrates with the {program}`vite` tool chain (and is *almost* a drop in for Jest) it was a no brainer to switch to using {program}`vitest` on the project.

The one significant difference between Jest and vitest is the details of their mock/spy implementation. Nothing major but did require a few tweaks.
