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
- **Code security**: enable Dependabot alerts and security updates, code scanning (the CodeQL workflow uploads its results), and private vulnerability reporting (which `SECURITY.md` points reporters to).

## First release

semantic-release finds the previous version from git tags; with no tag at all the first release would be `1.0.0`. This repository started from a `v0.1.0` tag on `main`, so its first release was `0.2.0`.
