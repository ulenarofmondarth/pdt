(project-code-control)=

# Project Code Management

## Committing

[Husky](https://typicode.github.io/husky/) is used to integrate [Commitizen](https://commitizen.github.io/cz-cli/) with `git` to ensure consistent `commit` messages are used. This in turn allows semantic-release to work out version numbers and produce accurate release notes as part of the {ref}`GitHub Workflows <github-workflows>`.

### Husky

Husky manages git hook scripts. These are put into place when `pnpm run prepare` is executed as part of the `pnpm install` (see {ref}`Setup Prerequisites <setup-prerequisites>`).

### Commitizen

Commitizen prompts for a [Conventional Commits](https://www.conventionalcommits.org) message when you commit, and `commitlint` rejects any message that does not conform.

Commitizen does not change version numbers. Versioning is done by semantic-release in the {ref}`release workflow <release-workflow>`.

The pre-commit hook runs Prettier, ESLint, the type check and the tests related to the staged files.

(project-branches)=

## Branches

There are two long-lived branches:

`dev`
: Where work is integrated. It changes only through pull requests: branch from it (`feat/...`, `fix/...`, `docs/...`) and open a pull request back into it.

`main`
: What has been released. It changes only through a pull request from `dev`, and every merge into it runs the {ref}`release workflow <release-workflow>`.

```{mermaid}
flowchart LR
    feature["feat/... or fix/..."] -- pull request --> dev
    dev -- pull request --> main
    main -- release commit merged back --> dev
```

After a release, the workflow merges `main` back into `dev`, so `dev` always contains everything on `main`. Pull `dev` before starting new work.

(project-pull-request)=

## Project Pull Request

CI runs on every pull request and must pass before it is merged.

- **Into `dev`:** keep it small and focused on one change, with its tests and documentation.
- **From `dev` into `main`:** this is a release. Its commits decide the version number, so read through them before merging.

Merge pull requests into both `dev` and `main` with **Create a merge commit**; the other methods are disabled. semantic-release reads each commit on `dev` to choose the version and write the release notes. A squash merge would replace them with a single commit, and both squash and rebase merges would leave `dev` and `main` with different histories that conflict on the next release.
