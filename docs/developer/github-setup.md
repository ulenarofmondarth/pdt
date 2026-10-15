# GitHub Setup

This project is hosted at <https://github.com/ulenarofmondarth/pdt>. It is licensed under the [MIT License](https://opensource.org/license/mit) which allows you to pretty much do as you like with this code.

:::{tip}
I recommend you create a fork of this repository if you intend to modify the source code.
:::

(github-workflows)=

## Workflows

There are three workflows under `.github/workflows`.

(ci-workflow)=

### `ci`

Runs on every pull request, whether into `dev` or from `dev` into `main` (see {ref}`project-branches`). It is also called by the {ref}`release <release-workflow>` workflow, which covers every push to `main`. The jobs run in parallel:

- **Typecheck** with TypeScript 7, then again with the TypeScript 6 fallback (see {ref}`typescript-compilers`).
- **Lint** with ESLint (warnings fail the job) and a Prettier formatting check.
- **Unit tests** with the coverage gate, on Node 24. The coverage report is kept as an artifact.
- **Build** of the bundle, followed by a smoke test of the built CLI. `dist` is kept as an artifact.
- **Docs**, which calls the `docs` workflow.

Superseded runs for the same pull request are cancelled.

### `docs`

Builds the Sphinx Docker image from `docs/Dockerfile`, builds the documentation inside it and keeps the HTML as an artifact. Any Sphinx warning fails the build. It is called by `ci` and can be started by hand.

(release-workflow)=

### `release`

Runs on every push to `main`. It first runs the whole of `ci`; only if that passes does it run [semantic-release](https://semantic-release.gitbook.io), which:

1. Works out the next version from the commit messages since the last release tag (`fix` gives a patch, `feat` a minor, and `BREAKING CHANGE:` or `!` a major release). If no commit warrants a release it stops here.
2. Writes the release notes and updates `CHANGELOG.md`.
3. Sets the new version in `package.json` and `docs/conf.py`.
4. Builds the bundle and the documentation, and zips the documentation.
5. Commits `CHANGELOG.md`, `package.json` and `docs/conf.py` back to `main` as `chore(release): <version> [skip ci]` and tags the commit `v<version>`.
6. Creates a GitHub release with the documentation zip attached.

Once semantic-release has finished, the workflow merges `main` back into `dev`, so that a release commit is on both branches. When nothing was released this is a fast-forward of `dev` to the pull request's merge commit. If the merge conflicts, the job fails and the merge has to be done by hand.

The workflow publishes the documentation to GitHub Pages, whether or not a release was cut. Publishing uses GitHub's own Pages actions; there is no `gh-pages` branch.

The pipeline is configured in `release.config.js`. Publishing to `npmjs` is switched off there (`npmPublish: false`).

```{rubric} Repository requirements
```

- A `PERSONAL_ACCESS_TOKEN` secret with permission to push to `main` and `dev`. semantic-release uses it to push the release commit and tag, and to create the release; the workflow uses it to merge `main` back into `dev`.
- A `dev` branch on GitHub.
- Merge commits allowed for pull requests (Settings → General → Pull Requests). Squash and rebase merging should be turned off; see {ref}`project-pull-request` for why.
- GitHub Pages enabled for the repository with the source set to "GitHub Actions" (Settings → Pages).
- A `v0.1.0` tag on `main` before the first release. semantic-release finds the previous version from git tags; with no tag at all the first release would be `1.0.0`.

`main` is protected by the repository ruleset "Protect main" (Settings → Rules → Rulesets):

- Changes need a pull request, merged with a merge commit. No approving review is required.
- The `ci` jobs must pass on the pull request, from GitHub Actions: `Typecheck`, `Lint`, `Unit tests (Node 24.x)`, `Build` and `Docs / Build documentation`. The branch must be up to date with `main`.
- Force pushes and deleting the branch are blocked.
- Repository admins can bypass the ruleset. This lets semantic-release push the release commit with the admin's `PERSONAL_ACCESS_TOKEN`.

`dev` is protected by the ruleset "Protect dev": changes need a pull request, merged with a merge commit. Repository admins can bypass it, which lets the release workflow merge `main` back into `dev`.

:::{important}
The required checks are matched by job name. When a job in `ci.yml` is renamed, or the Node matrix changes, update the ruleset too, or pull requests into `main` will wait for a check that never reports.
:::

:::{tip}
`pnpm exec semantic-release --dry-run --no-ci` checks the configuration locally without releasing anything.
:::
