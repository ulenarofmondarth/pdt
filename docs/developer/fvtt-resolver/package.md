# The package

How `@mondarth/fvtt-resolver` is built, tested and released. The design of what it does starts at {doc}`index`.

## Shape of the package

- **Pure core.** The resolver depends on plain data only: no network, files or Foundry runtime. Its one runtime dependency is zod, for reading manifests, which runs in browsers as well as Node. Fetching and caching manifests will sit behind adapters, so the core stays deterministic and easy to test, and runs wherever its users do.
- **ES modules with types.** `pnpm build` compiles `src/` with {command}`tsc` (`tsconfig.build.json`) into `dist/`, as JavaScript with type declarations, one file per source file. Nothing is bundled. `exports` in `package.json` is the only way in, and `files` ships only `dist/`.
- **No path aliases.** The compiler does not rewrite import paths in its output, so the package imports its own modules by relative path.
- **Tests** live in `tests/` and run with {program}`vitest`. Laws that must hold for any input, such as an order being total or ranges behaving as sets, are property tests with fast-check. Coverage must stay at 100%. `tests/package.test.ts` checks what a consumer of the published package relies on: its name, `exports`, `files` and `repository`. CI also runs `pnpm pack --dry-run` to show what npm would receive. The sources are tested against a fake `fetch`. The checks in `tests-live/` use the real services, and are run by hand with `pnpm check:live`, never in CI.

## Releases

The package is released on its own, from the commits that change files in `packages/fvtt-resolver`, and published to npm through trusted publishing (see {ref}`npm-publishing`). Use the scope `resolver` in its commit messages, as in `feat(resolver): ...`.
