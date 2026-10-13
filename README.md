# pdt — Foundry VTT Package Developer Toolkit

`pdt` is a command line tool that supports the development of [Foundry VTT](https://foundryvtt.com) packages (systems and modules).

> **Status: early development.** Only a few commands exist so far, their behaviour will change, and the package is not yet published to npm.

## What it does today

| Command         | Purpose                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| `pdt init`      | Mark a directory as a PDT project by creating its `.pdt` data directory. |
| `pdt info`      | Placeholder; will show a project's runtime configuration.                |
| `pdt vtt start` | Placeholder; will start a project-scoped Foundry VTT instance in Docker. |

Run `pdt --help` for the current list. The documentation also describes commands that are planned but not yet built.

## Requirements

- [Node.js](https://nodejs.org) 22.14 or later
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
