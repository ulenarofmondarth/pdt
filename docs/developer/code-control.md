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

(project-pull-request)=

## Project Pull Request

```{todo}
Add advice on pull requests
```
