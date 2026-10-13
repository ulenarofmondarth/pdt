# Contributing to pdt

Thank you for your interest. This project is at an early stage, so expect things to move around.

The developer documentation at <https://ulenarofmondarth.github.io/pdt/> (sources in [`docs/developer/`](docs/developer/)) covers the design and tooling in more depth. This file is the short version.

## Getting set up

You need Node.js 22.14 or later, [pnpm](https://pnpm.io) and Docker.

```shell
git clone <URL of your fork>
cd pdt
pnpm install
```

`pnpm install` also installs the git hooks described below. The project only accepts pnpm; npm and yarn installs are rejected.

## Workflow

1. Fork the repository and create a short-lived branch from `main`, named for the change: `feat/...`, `fix/...`, `docs/...`.
2. Write a failing test first, then the change. A bug fix starts with a test that reproduces the bug.
3. Run the checks (below).
4. Commit using Conventional Commits.
5. Open a pull request against `main`. CI must pass before it is merged.

Keep pull requests small and focused, and update the documentation alongside the code.

## Checks

| Command               | What it checks                                                  |
| --------------------- | --------------------------------------------------------------- |
| `pnpm typecheck`      | Types, with TypeScript 7                                        |
| `pnpm lint`           | ESLint                                                          |
| `pnpm prettier:check` | Formatting (`pnpm prettier:format` fixes it)                    |
| `pnpm test`           | Unit tests                                                      |
| `pnpm test:coverage`  | Unit tests with coverage; fails below the configured thresholds |
| `pnpm build`          | The bundle builds                                               |
| `pnpm build:docs`     | The documentation builds with no warnings                       |

CI runs all of these on every pull request.

## Code standards

- All source is TypeScript in strict mode. Do not add JavaScript source files or use `any`.
- User-facing text goes in `messages/en.json`, never hardcoded.
- Log through `@util/logger.js`, not `console.log`. To exit the process, use `exit()` from that module in place of `process.exit()`.
- Unit tests live in `tests/unit/`, mirroring `src/`, in `*.test.ts` files. Shared mocks are in `tests/unit/mocks/`.

## Commit messages

Commits must follow [Conventional Commits](https://www.conventionalcommits.org). The type decides the next version number, so choose it with care:

| Type                                               | Release |
| -------------------------------------------------- | ------- |
| `fix`                                              | patch   |
| `feat`                                             | minor   |
| `!` after the type, or a `BREAKING CHANGE:` footer | major   |
| `docs`, `test`, `refactor`, `build`, `ci`, `chore` | none    |

When you commit from a terminal, Commitizen prompts you for the parts of the message. `commitlint` then rejects any message that does not conform. Reference issues with `Closes #N` in the body so that the release notes link to them.

Releases are fully automated: merging to `main` runs CI and then semantic-release, which versions, tags and publishes. Never edit the version number or `CHANGELOG.md` by hand.

## Git hooks

The pre-commit hook runs Prettier, ESLint, the type check and the tests related to your staged files. The commit-msg hook runs `commitlint`.

### Emergency bypass

Do not bypass the hooks as a matter of routine. If you genuinely must, for example to save work when a hook itself is broken:

```shell
git commit --no-verify -m "fix(scope): describe the change"
```

Before you push, fix whatever blocked the hooks, then revalidate:

```shell
pnpm prettier:check && pnpm lint && pnpm typecheck && pnpm test
git commit --amend --no-edit
```

The first line repeats the pre-commit checks by hand; the amend alone would not, because the hook only looks at staged files. The amend re-runs `commitlint` on the message. If either fails, fix the problem and repeat until both pass. Say in the pull request that the hooks were bypassed and why. CI runs the same checks regardless, so a bypassed commit that does not pass will not be merged.

## AI Disclosure

Parts of this project, including code, tests, configuration and documentation, were produced with AI assistance. All changes are human-reviewed before they are merged. If you use AI tools for a contribution, review the output yourself before submitting it; you are responsible for what you submit.
