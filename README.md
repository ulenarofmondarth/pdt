# pdt — Foundry VTT Package Developer Toolkit

[![Dev CI](https://github.com/ulenarofmondarth/pdt/actions/workflows/dev.yml/badge.svg?branch=dev)](https://github.com/ulenarofmondarth/pdt/actions/workflows/dev.yml)
[![Release](https://github.com/ulenarofmondarth/pdt/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/ulenarofmondarth/pdt/actions/workflows/release.yml)
[![CodeQL](https://github.com/ulenarofmondarth/pdt/actions/workflows/codeql.yml/badge.svg?branch=dev)](https://github.com/ulenarofmondarth/pdt/actions/workflows/codeql.yml)
[![Unit coverage](https://img.shields.io/codecov/c/github/ulenarofmondarth/pdt/dev?flag=unit&label=unit%20coverage&logo=codecov)](https://app.codecov.io/gh/ulenarofmondarth/pdt/tree/dev?flags%5B0%5D=unit)
[![Latest release](https://img.shields.io/github/v/release/ulenarofmondarth/pdt)](https://github.com/ulenarofmondarth/pdt/releases/latest)
[![Docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://ulenarofmondarth.github.io/pdt/)
[![License: MIT](https://img.shields.io/github/license/ulenarofmondarth/pdt)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-brightgreen?logo=node.js&logoColor=white)](packages/pdt/package.json)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org)
[![semantic-release](https://img.shields.io/badge/semantic--release-conventionalcommits-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

`pdt` is a command line tool that supports the development of [Foundry VTT](https://foundryvtt.com) packages (systems and modules).

> **Status: early development.** Only a few commands exist so far, their behaviour will change, and the package is not yet published to npm.

## What it does today

| Command                      | Purpose                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pdt init`                   | Make a directory a PDT project, registered under its module's id, with a VTT configured for it. In an empty directory, first create a new Foundry VTT module there. |
| `pdt force-reset`            | Set the current project up again from scratch: clear its run state and configuration, then initialise it.                                                           |
| `pdt move [destination]`     | Move the current project, or register it where it was moved to.                                                                                                     |
| `pdt prune`                  | Forget the projects whose directories are gone.                                                                                                                     |
| `pdt config get\|set\|clear` | Show and change the configuration.                                                                                                                                  |
| `pdt vtt start`              | Start the project's Foundry VTT in Docker.                                                                                                                          |
| `pdt info`                   | Placeholder; will show a project's runtime configuration.                                                                                                           |

Run `pdt --help` for the current list. The documentation also describes commands that are planned but not yet built.

## Requirements

- [Node.js](https://nodejs.org) 24 or later
- [pnpm](https://pnpm.io)
- [Docker](https://www.docker.com), for the documentation build and for the commands that manage a Foundry VTT instance

## Running from source

```shell
git clone https://github.com/ulenarofmondarth/pdt.git
cd pdt
pnpm install
pnpm build
node packages/pdt/dist/index.js --help
```

## Translations

Messages are written in English and translated into German, French and Spanish.

> **The translations are unreviewed.** They were produced by machine translation and have not been checked by a speaker of the language. Expect awkward or incorrect wording. Corrections are welcome; the files are in [`packages/pdt/messages/`](packages/pdt/messages/).

`pdt` does not yet choose a language for you, so it currently always runs in English. The text of the questions asked when creating a new module comes from the module generator and is English only.

## Documentation

User and developer documentation is published at <https://ulenarofmondarth.github.io/pdt/>.

The sources are in [`docs/`](docs/). To build them locally run `pnpm build:docs`, or `pnpm devserve:docs` for a live preview on <http://localhost:8088>. Both run inside Docker; no Python is needed on your machine.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

## Supporting the project

If you find this useful, you can support its development on [Patreon](https://patreon.com/Mondarth) or [Ko-fi](https://ko-fi.com/ulenarofmondarth).

## AI Disclosure

Parts of this project, including code, tests, configuration and documentation, were produced with AI assistance. All changes are human-reviewed before they are merged.
