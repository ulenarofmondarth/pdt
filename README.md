# pdt — Foundry VTT Package Developer Toolkit

[![Release](https://github.com/ulenarofmondarth/pdt/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/ulenarofmondarth/pdt/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/ulenarofmondarth/pdt)](https://github.com/ulenarofmondarth/pdt/releases/latest)
[![Docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://ulenarofmondarth.github.io/pdt/)
[![License: MIT](https://img.shields.io/github/license/ulenarofmondarth/pdt)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-brightgreen?logo=node.js&logoColor=white)](package.json)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org)
[![semantic-release](https://img.shields.io/badge/semantic--release-conventionalcommits-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

`pdt` is a command line tool that supports the development of [Foundry VTT](https://foundryvtt.com) packages (systems and modules).

> **Status: early development.** Only a few commands exist so far, their behaviour will change, and the package is not yet published to npm.

## What it does today

| Command         | Purpose                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `pdt init`      | Mark a directory as a PDT project. In an empty directory, first create a new Foundry VTT module there. |
| `pdt info`      | Placeholder; will show a project's runtime configuration.                                              |
| `pdt vtt start` | Placeholder; will start a project-scoped Foundry VTT instance in Docker.                               |

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
node dist/index.js --help
```

## Documentation

User and developer documentation is published at <https://ulenarofmondarth.github.io/pdt/>.

The sources are in [`docs/`](docs/). To build them locally run `pnpm build:docs`, or `pnpm devserve:docs` for a live preview on <http://localhost:8088>. Both run inside Docker; no Python is needed on your machine.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

## AI Disclosure

Parts of this project, including code, tests, configuration and documentation, were produced with AI assistance. All changes are human-reviewed before they are merged.
