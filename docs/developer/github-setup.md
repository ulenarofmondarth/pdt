# GitHub Setup

This project is hosted at <https://github.com/ulenarofmondarth/pdt>. It is licensed under the [MIT License](https://opensource.org/license/mit) which allows you to pretty much do as you like with this code.

:::{tip}
I recommend you create a fork of this repository if you intend to modify the source code.
:::

This page describes what the repository needs on GitHub for the workflows in {doc}`ci-cd` to work.

## Branches

- `dev` is the default branch, so that pull requests target it. See {ref}`project-branches` for how work moves between `dev` and `main`.
- Each branch is protected by a ruleset (Settings → Rules → Rulesets): "Protect dev" and "Protect main". Both:
  - **require a pull request before merging**, with **0** required approvals (you cannot approve your own pull request), merged with a **merge commit** only, so that semantic-release sees every commit and the branches do not diverge;
  - **require the status check** **CI passed** (from GitHub Actions);
  - **block force pushes and deletion**;
  - have one entry on the **bypass list**: the release App (below), mode **Always**. Nobody else, not even administrators, so every human change goes through a pull request.

:::{important}
The required check is matched by name. If the `ci-passed` job in `dev.yml` is renamed, update both rulesets, or pull requests will wait for a check that never reports.
:::

(release-app)=

## The release App

The release workflow pushes to the protected branches: semantic-release pushes the release commit and tag to `main`, and the _Bring dev up to date_ job fast-forwards `dev`. It does this as a GitHub App, which is the only actor allowed to bypass the rulesets. Each run gets a token that expires within an hour; there is no long-lived token to rotate.

To set it up:

1. **Create the App**: account Settings → Developer settings → GitHub Apps → **New GitHub App**.
   - Name: anything unique, for example `ulenarofmondarth-pdt-release`. Homepage URL: the repository's URL.
   - Webhook: untick **Active**.
   - Repository permissions: **Contents**, **Pull requests** and **Issues**, all **Read and write** (Metadata: read-only is added automatically).
   - Where can this App be installed: **Only on this account**.
2. **Generate a private key** on the App's page (a `.pem` file downloads), and note the **Client ID** (in the _About_ section at the top of the App's _General_ page; it starts with `Iv`).
3. **Install the App** (Install App → your account → **Only select repositories** → this repository).
4. **Store the credentials** in the repository (Settings → Secrets and variables → Actions): the Client ID as the _variable_ `RELEASE_APP_CLIENT_ID`, and the whole `.pem` file as the _secret_ `RELEASE_APP_PRIVATE_KEY`. Then delete the downloaded file.
5. **Add the App to the rulesets' bypass list** (above).

Release commits are authored by `<app-name>[bot]`. If the private key leaks, revoke it on the App's page and generate a new one.

If the push to `dev` is refused, or `dev` has moved on since the release, the workflow opens a pull request from `main` to `dev` instead; merge it with a merge commit.

## Secrets and variables

| Name                      | Kind     | Used by | Purpose                                                                                                                  |
| ------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `RELEASE_APP_CLIENT_ID`   | Variable | Release | The release App's Client ID (see {ref}`release-app`).                                                                    |
| `RELEASE_APP_PRIVATE_KEY` | Secret   | Release | The release App's private key.                                                                                           |
| `CODECOV_TOKEN`           | Secret   | Dev CI  | Uploads coverage to [Codecov](https://about.codecov.io). Optional: without it the upload is skipped and CI still passes. |

`GITHUB_TOKEN` covers everything else.

## Settings

- **Pull requests** (Settings → General): allow merge commits. The rulesets decide which merge methods each branch accepts.
- **Pages**: Settings → Pages → Source: **GitHub Actions**. The `github-pages` environment only deploys from `main`.
- **npm**: see {ref}`npm-trusted-publisher`.
- **Code security**: enable Dependabot alerts and security updates, code scanning (the CodeQL workflow uploads its results), and private vulnerability reporting (which `SECURITY.md` points reporters to).

(release-tags)=

## Release tags

semantic-release finds each package's previous version from its git tags, `<package name>-v<version>`. A package with no tag at all would be released as `1.0.0`. So a new package starts from a tag, `<package name>-v0.0.0`, on `main`, created by hand when the package is added. Its first release is then `0.0.1` or `0.1.0`.

pdt was released as `v0.1.0` to `v0.2.1` before the repository became a workspace. Its tag format changed to `@mondarth/pdt-v<version>` then. Before the first release after that, tag pdt's last release in the new format, on the same commit:

```shell
git fetch --tags
git tag @mondarth/pdt-v0.2.1 v0.2.1^{}
git push origin @mondarth/pdt-v0.2.1
```

pdt's commits after 0.2.1, up to its move into `packages/pdt`, changed files at the root, so semantic-release-monorepo would count none of them. For its first release from the workspace, pdt's `release.config.js` counts every commit since its last tag instead (`allCommitsTagFormat`). Remove that option once the release is tagged; every later commit is made in `packages/`.

(npm-trusted-publisher)=

## npm trusted publishing

The release workflow publishes `@mondarth/fvtt-resolver` to npm without a token (see {ref}`npm-publishing`). npm trusts this repository's release workflow instead. That trust is set up per package on npmjs.com, and only for a package that already exists, so the first version is published by hand:

1. **Have the scope.** The `@mondarth` scope must belong to your npm account, or to an npm organisation you can publish to. Turn on two-factor authentication for the account.
2. **Publish a placeholder by hand.** On `main`, with the package at version `0.0.0`:

   ```shell
   pnpm --filter @mondarth/fvtt-resolver build
   cd packages/fvtt-resolver
   pnpm login
   pnpm publish --access public
   ```

   Then tag that commit `@mondarth/fvtt-resolver-v0.0.0` and push the tag (see {ref}`release-tags`).
3. **Add the trusted publisher.** On npmjs.com, open the package's **Settings**. Under **Trusted publishing**, choose **GitHub Actions** and enter:

   | Field | Value |
   | --- | --- |
   | Organization or user | `ulenarofmondarth` |
   | Repository | `pdt` |
   | Workflow filename | `release.yml` |
   | Environment name | leave empty |

   npm does not check these when you save them. A mistake only shows when the next release fails to publish.
4. **Stop token publishing.** Once a release has published through the workflow, set the package's **Publishing access** to **Require two-factor authentication and disallow tokens**. Trusted publishing keeps working, and nothing else can publish without your second factor.

Provenance needs the repository and the package to be public.
