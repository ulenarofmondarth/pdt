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

Runs on every pull request. It is also called by the {ref}`release <release-workflow>` workflow, which covers every push to `main`. Work happens on short-lived branches (`feat/...`, `fix/...`) that reach `main` through a pull request. The jobs run in parallel:

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

The workflow then publishes the documentation to GitHub Pages, whether or not a release was cut. Publishing uses GitHub's own Pages actions; there is no `gh-pages` branch.

The pipeline is configured in `release.config.js`. Publishing to `npmjs` is switched off there (`npmPublish: false`).

```{rubric} Repository requirements
```

- A `PERSONAL_ACCESS_TOKEN` secret with permission to push to `main`. semantic-release uses it to push the release commit and tag, and to create the release.
- GitHub Pages enabled for the repository with the source set to "GitHub Actions" (Settings → Pages).
- A `v0.1.0` tag on `main` before the first release. semantic-release finds the previous version from git tags; with no tag at all the first release would be `1.0.0`.

:::{tip}
`pnpm exec semantic-release --dry-run --no-ci` checks the configuration locally without releasing anything.
:::
