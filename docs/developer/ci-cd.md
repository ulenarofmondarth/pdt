(github-workflows)=

# CI/CD

Workflows live in `.github/workflows`. The shared set-up steps (pnpm, Node.js, dependencies) are in the composite action `.github/actions/setup`, and the documentation build is in `.github/actions/build-docs`.

(ci-workflow)=

## Dev CI (`dev.yml`)

Runs on every push to `dev`, on every pull request to `dev` or `main`, and as the first stage of a release. Its jobs run in parallel:

| Job             | Checks                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Commit messages | commitlint over the pull request's commits (pull requests only)                                                                        |
| Typecheck       | TypeScript 7, then the TypeScript 6 fallback (see {ref}`typescript-compilers`)                                                         |
| Lint            | ESLint (warnings fail) and Prettier                                                                                                    |
| Unit tests      | the coverage gate; writes a coverage summary to the job page, uploads coverage to Codecov and keeps the HTML report as an artifact |
| Build           | builds the bundle and runs the CLI tests against it (`pnpm test:cli`); keeps `dist` as an artifact                                     |
| Docs            | calls the Docs workflow                                                                                                                |
| CI passed       | succeeds only if all of the above passed; use it as the required status check                                                          |

Superseded runs of the same pull request are cancelled.

## Docs (`docs.yml`)

Builds the Sphinx image (cached) and the site, and keeps the HTML as an artifact. Any Sphinx warning fails the build. Called by Dev CI; can also be started by hand. The build steps live in the `build-docs` composite action, which the release workflow's Pages job also uses to build the documentation from the release tag.

(release-workflow)=

## Release (`release.yml`)

Runs on every push to `main`:

1. **CI**: the whole of Dev CI.
2. **Semantic release** (`release.config.js`):
   1. works out the next version from the commits since the last tag (`fix` gives a patch, `feat` a minor, and `BREAKING CHANGE:` or `!` a major release), and stops if none warrants a release;
   2. writes the release notes and `CHANGELOG.md`;
   3. sets the version in `package.json` (with `pnpm pkg set`) and `docs/conf.py`, then builds the bundle and the documentation and zips the documentation;
   4. commits `chore(release): <version> [skip ci]` to `main` and tags it `v<version>`;
   5. creates the GitHub release with the documentation zip attached.
3. **Bring dev up to date**, if a release was cut: fast-forwards `dev` to the release commit, or opens a pull request from `main` to `dev` if it cannot.
4. **Pages**: builds the documentation for the released tag (or for `main`, if nothing was released) and deploys it to GitHub Pages. Publishing uses GitHub's own Pages actions; there is no `gh-pages` branch.

It can also be started by hand from the Actions tab (**Release** > **Run workflow**, on `main`; other branches are skipped). That releases only if there are releasable commits, and otherwise just publishes the documentation again. Use it when a Pages deployment fails or stalls: Pages names a deployment after its commit, so once the deployment for a commit has been cancelled, re-running that job cannot replace it, but a manual run deploys the current head of `main`.

The jobs that push to the protected branches authenticate as the release App (see {ref}`release-app`). Publishing to npm is not set up; see the comment in `release.config.js`.

:::{tip}
`pnpm release:dry-run` checks the semantic-release configuration locally without releasing anything.
:::

## Other workflows

- **CodeQL** (`codeql.yml`): code scanning of the TypeScript and of the workflows themselves, on pushes, pull requests and weekly.
- **Dependency review** (`dependency-review.yml`): fails pull requests that add dependencies with known vulnerabilities.
- **Dependabot** (`.github/dependabot.yml`): weekly grouped updates for npm, the documentation's Python requirements and base image, and the GitHub Actions, raised against `dev`. Major updates of `@types/node`, which follows the Node.js baseline, are ignored; the baseline moves by hand.
- **Third-party actions** are pinned to a full commit SHA with the release in a comment (`uses: docker/build-push-action@<sha> # v7.4.0`), because a tag can be moved by whoever controls the action's repository. Dependabot updates the SHA and the comment together. GitHub's own `actions/*` and `github/*` actions use version tags. `tests/unit/config/action-pins.test.ts` enforces this; to add an action, look up the commit of the release (`gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`).

## Configuration tests

`tests/unit/config/` checks the tooling configuration, so mistakes show up in CI rather than at release time: the commitlint rules, the version bump (pnpm, offline, nothing but the version changes), that the release notes render with the configured preset, the shape of the release workflow, and the action pins.
