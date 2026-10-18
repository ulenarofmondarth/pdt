(build-process)=

# Build Process

Running the build is as simple as `pnpm build`. This invokes {program}`vite` and it does all the heavy lifting.

## Typescript configuration

`tsconfig.json` runs the compiler in `strict` mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `noImplicitOverride` enabled. It targets `esnext` with `lib: ["esnext"]`; the `dom` library is deliberately left out because {program}`pdt` runs on Node, so accidental use of browser globals fails the type check.

The compiler never emits files (`noEmit`); {program}`vite` produces the build output.

`allowJs` is enabled because the configuration tests import `release.config.js`, which semantic-release needs as JavaScript. There is no JavaScript in `src/`.

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
