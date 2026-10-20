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
2. **Semantic release** (`pnpm release`): runs semantic-release in each package's directory in turn, with the package's `release.config.js`. Each is built by `packageRelease()` in `release.base.js` at the root, so every package is released the same way. For each package it:
   1. works out the next version from the commits since the package's last tag that change files in the package (semantic-release-monorepo filters them), where `fix` gives a patch, `feat` a minor, and `BREAKING CHANGE:` or `!` a major release, and stops if none warrants a release;
   2. writes the release notes and the package's `CHANGELOG.md`;
   3. sets the version in the package's `package.json` (with `pnpm pkg set`), then builds what the release ships;
   4. commits `chore(release): <tag> [skip ci]` to `main` and tags it `<package name>-v<version>`, such as `@mondarth/pdt-v0.3.0`;
   5. publishes the package to npm, if it is published (see below);
   6. creates the GitHub release.

   pdt is not published to npm. Its release builds the documentation, which shows the version from `packages/pdt/package.json`, and attaches it to the GitHub release as a zip.
3. **Bring dev up to date**, if anything was released: fast-forwards `dev` to the release commits, or opens a pull request from `main` to `dev` if it cannot.
4. **Pages**: builds the documentation for pdt's released tag (or for `main`, if nothing was released) and deploys it to GitHub Pages. Publishing uses GitHub's own Pages actions; there is no `gh-pages` branch.

It can also be started by hand from the Actions tab (**Release** > **Run workflow**, on `main`; other branches are skipped). That releases only if there are releasable commits, and otherwise just publishes the documentation again. Use it when a Pages deployment fails or stalls: Pages names a deployment after its commit, so once the deployment for a commit has been cancelled, re-running that job cannot replace it, but a manual run deploys the current head of `main`.

The jobs that push to the protected branches authenticate as the release App (see {ref}`release-app`).

semantic-release runs in the package's directory, and `@semantic-release/git` commits only the files under it that changed, so everything a release changes must live in the package. That is why each package keeps its own `CHANGELOG.md`, and why the documentation reads pdt's version rather than having it written into `docs/conf.py`.

(npm-publishing)=

### Publishing to npm

`@mondarth/fvtt-resolver` is published to npm by its release, with `pnpm publish` (`publishCmd` in its `release.config.js`). There is no npm token. The release job has the `id-token: write` permission, and npm's [trusted publishing](https://docs.npmjs.com/trusted-publishers) accepts the workflow's OIDC token in its place. Under trusted publishing, npm records provenance for the package, linking each version to the workflow run and commit that built it. pnpm has published natively, without the npm CLI, since version 11. The trusted publisher is set up on npmjs.com (see {ref}`npm-trusted-publisher`).

`@semantic-release/npm` is not used: it runs `npm version`, which refuses to run in a workspace that requires pnpm.

To publish another package, give it `publishConfig.access: "public"`, a `repository` naming this repository and the package's directory, and a `publishCmd` in its release configuration. Then set up its trusted publisher.

:::{tip}
`pnpm release:dry-run` checks the semantic-release configuration locally without releasing anything.
:::

## Other workflows

- **CodeQL** (`codeql.yml`): code scanning of the TypeScript and of the workflows themselves, on pushes, pull requests and weekly.
- **Dependency review** (`dependency-review.yml`): fails pull requests that add dependencies with known vulnerabilities.
- **Dependabot** (`.github/dependabot.yml`): weekly grouped updates for npm, the documentation's Python requirements and base image, and the GitHub Actions, raised against `dev`. Major updates of `@types/node`, which follows the Node.js baseline, are ignored; the baseline moves by hand.
- **Third-party actions** are pinned to a full commit SHA with the release in a comment (`uses: docker/build-push-action@<sha> # v7.4.0`), because a tag can be moved by whoever controls the action's repository. Dependabot updates the SHA and the comment together. GitHub's own `actions/*` and `github/*` actions use version tags. `tests/config/action-pins.test.ts` enforces this; to add an action, look up the commit of the release (`gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`).

## Configuration tests

`tests/config/` (at the root of the repository) checks the tooling configuration, so mistakes show up in CI rather than at release time: the commitlint rules, the version bump in each package (pnpm, offline, nothing but the version changes), that the release notes render with the configured preset, that every package's release is wired the same way and known to the release workflow, the shape of the release workflow, and the action pins.
