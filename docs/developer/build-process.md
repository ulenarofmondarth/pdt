(build-process)=

# Build Process

(repository-layout)=

## Repository layout

The repository is a [pnpm workspace](https://pnpm.io/workspaces). Each package lives in a directory of its own under `packages/`:

| Directory | What it holds |
| --- | --- |
| `packages/pdt` | The {program}`pdt` command line tool (`@mondarth/pdt`): its source, tests, test data, messages and build configuration |
| `packages/fvtt-resolver` | `@mondarth/fvtt-resolver`, the library that works out which versions of Foundry VTT, systems and modules go together, published to npm on its own (see {doc}`fvtt-resolver`) |
| the root | What the whole repository shares: the workspace (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`), the TypeScript, ESLint, Prettier and Vitest settings, the git hooks, commitlint and semantic-release, the workflows, these docs, and `tests/`, which checks that tooling |

Paths in the developer documentation about {program}`pdt`'s code, such as `src/main.ts` or `tests/unit/`, are relative to `packages/pdt`.

Run the scripts from the root. Most run in every package (`pnpm -r`); `build:watch`, `dev:link` and `dev:unlink` run in `packages/pdt`. To run a script in one package only, use `pnpm --filter @mondarth/pdt <script>`. A package depends on another in the workspace with `"workspace:*"`, so it always uses the copy in the repository.

Running the build is as simple as `pnpm build`. This invokes {program}`vite` and it does all the heavy lifting.

`pnpm build:watch` builds, then rebuilds whenever a source file changes, for running your working copy as `pdt` (see {ref}`running-development-version`). Every build, including each rebuild, makes `dist/index.js` executable, so it also runs as a program of its own through its `#!` line.

## Typescript configuration

`tsconfig.base.json` at the root holds the compiler options every package shares. Each package's `tsconfig.json` extends it and adds its own `paths` (see {ref}`shortform-paths`); the root `tsconfig.json` covers the repository's own tooling (`tests/`, `scripts/` and the configuration files). {command}`pnpm typecheck` checks the root, then each package.

The shared options run the compiler in `strict` mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `noImplicitOverride` enabled. It targets `esnext` with `lib: ["esnext"]`; the `dom` library is deliberately left out because {program}`pdt` runs on Node, so accidental use of browser globals fails the type check.

The compiler never emits files (`noEmit`); {program}`vite` produces the build output.

`allowJs` is enabled because the root's tooling tests import `release.config.js`, which semantic-release needs as JavaScript. There is no JavaScript in `src/`.

(typescript-compilers)=

### Compiler versions

Two TypeScript compilers are installed:

- **TypeScript 7** (the native compiler) is installed as `typescript7` and provides the {command}`tsc` binary.
- **TypeScript 6** is installed under the name `typescript` (an alias for `@typescript/typescript6`) and provides the {command}`tsc6` binary. It is a fallback for tools that import the compiler's JavaScript API, which TypeScript 7 does not ship.

| Stage | Compiler |
| --- | --- |
| {command}`pnpm typecheck`, the pre-commit hook, the CI type check | TypeScript 7 ({command}`tsc`) |
| {command}`pnpm typecheck:fallback` (CI only, keeps the fallback honest) | TypeScript 6 ({command}`tsc6`) |
| ESLint (`typescript-eslint`), `typedoc`, the paraglide plugin | TypeScript 6 (via `import 'typescript'`) |
| {command}`pnpm build` and {command}`pnpm test` | Neither; {program}`vite` and {program}`vitest` strip types with Oxc (through Rolldown) |

```{todo}
Remove the TypeScript 6 fallback once `typescript-eslint`, `typedoc` and paraglide support TypeScript 7 natively.
```

(shortform-paths)=

### Short-form Paths

In `tsconfig.json` the entry `"paths"` (see [Paths](https://www.typescriptlang.org/tsconfig/#paths)) provides mappings from a shortened form to a longer form. Besides providing brevity these also account for arbitrary relative paths. So referring to `@/constants` will resolve to `src/constants` regardless of where the enclosing source file is in the `src` structure. This saves a lot of `import constants from '../../../constants'` along with having to maintain these relative paths if refactoring moves the file.

Paths defined in `tsconfig.json` are used by the typescript transpiler (and consequently any language server).

These `paths` are also used during testing (see {doc}`testing`)

The paths are repeated in `vite.config.ts` for use during the build.

### Version

`pdt --version` reports the version in `packages/pdt/package.json`. `vite.config.ts` reads it when the build (or a test run) starts and writes it into the bundle as `__PDT_VERSION__` (declared in `src/build-constants.d.ts`). Left to itself, yargs would look for a `package.json` above its own installed copy, which finds the right one only by chance of where pnpm puts its packages.

(building-the-docs)=

## Documentation

The documentation lives in `docs/`. It is written in Markdown ([MyST](https://myst-parser.readthedocs.io)) and built with [Sphinx](https://www.sphinx-doc.org) using the [furo](https://pradyunsg.me/furo/) theme.

All of the Python tooling runs inside a Docker image built from `docs/Dockerfile`; nothing Python is installed on your machine or added to the Node project. Docker is the only requirement.

| Command | What it does |
| --- | --- |
| {command}`pnpm build:docs` | Builds the HTML into `docs/_build/html`. The image is built on first use. |
| {command}`pnpm devserve:docs` | Serves a live preview on <http://localhost:8088> that rebuilds on every change. Stop it with {kbd}`Ctrl+C`. |

{command}`pnpm build:docs` treats every Sphinx warning as an error, so a broken cross-reference fails the build locally and in CI. `todo` notes are the exception: they are shown in the pages and listed on the front page, but do not fail the build. The live preview does not stop on warnings.

The Python requirements are pinned in `docs/requirements.txt`. Keep that list minimal: add a Sphinx extension only when a page needs it. Dependabot proposes updates to the requirements and to the base image. After changing either file, rebuild the image with {command}`docker compose -f docs/compose.yaml build`.
