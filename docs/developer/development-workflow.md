# Development Workflow

Obviously you will have your own way of doing things. This section describes the workflow for which this project is configured.

## Core Technology

This project uses:

- [Typescript](https://www.typescriptlang.org)
- [NodeJS](https://nodejs.org) ([ts-node](https://typestrong.org/ts-node/docs/) for smoother development workflow)
- [vite](https://vite.dev) for building the package
- [vitest](https://vitest.dev) for testing
- [Docker](https://www.docker.com/)

The main tool for configuring the project is {program}`pnpm` (which you should have installed when setting up).

Documentation (this documentation), is written in Markdown ([MyST](https://myst-parser.readthedocs.io)), processed using [Sphinx](https://www.sphinx-doc.org).

## Basic Development Cycle

:::{important}
Before working on the code, create a new branch from `dev` (`git switch -c my_new_branch dev`) to work on. See {ref}`project-branches`.

This will ensure you don't run into problems later.

```{todo}
Write section on code control.
```
:::

```{mermaid}
flowchart LR
   subgraph sg1 [Get Ready]
     direction TB
     c1{Contributing?}
     c1-- Yes -->id1[Fork the repo]
     c1-- No -->id2[clone]
     id1-->id2
     id2-->id3[prepare]
   end
   subgraph sg2 ["Develop (TDD)"]
     direction TB
     id4[add test]
     id4-->id5[write code]
     id8-->id9{test passing?}
     id5-->id8[test]
     id9--yes-->id6[refactor]
     id9--no -->id5
     id6-->id10[commit]
     id10-->id7[push]
     id7-->id4
   end
   sg1-->sg2

   click id1 href "contributing.html#contributing-to-pdt"
```

Use of Test Driven Development (TDD) is encouraged. So, first write a test to specify the change you are going to make. Tests live in `tests/unit/`, in a `.test.ts` file at the path that mirrors the source file (see {doc}`testing`). For a bug, first add a test that reproduces it.

:::{tip}
Commit to your branch frequently ({command}`git add <your code>` and {command}`git commit -m 'My awesome edits'`). This provides a nice way to keep track of changes but more importantly gives you plenty of 'checkpoints' to roll-back to if you discover a problem with your current direction.
:::

Write code for your changes.

Test using {command}`pnpm test` (or open a separate terminal and run {command}`pnpm vitest`, which will run all tests and then watch for changes and run any tests related to the changed files).

:::{tip}
If you stage your changes (using {command}`git add`) you can use {command}`npm run test:ci` to limit the tests to those related to files in the staging index.
:::

Repeat the write test/develop/test/refactor cycle until you have completed your change.

Commit the final changes to your repository.

If you have installed {program}`act` (see {ref}`developer recommended installs <recommended-developer-installs>`) you can use it to run the {term}`CI` chain locally. This helps identify any potential issues *before* you offer them into the official build.

```shell
act
```

If you have followed the {ref}`project-code-control` advice you will have a forked repository ready to prepare a {ref}`project-pull-request`.

If you just want to use this modification yourself you can run it directly from this local copy (see {ref}`running-development-version`) or you can push the change to your own forked repository's `main` and a new `npm` package will be published.

```{todo}
Section on how `npm` packages are published, how to setup the project to use the correct account, etc.
```

(running-development-version)=

## Running your development version

To try your changes by hand, make the `pdt` command in your own shell run your working copy instead of a released package:

```shell
pnpm build        # dist/ must exist before pdt can run
pnpm dev:link     # point the global pdt command at this working copy
```

`dev:link` runs `pnpm add --global "link:$(pwd)"` in `packages/pdt`: pnpm puts a `pdt` command in its global bin directory that runs `packages/pdt/dist/index.js` from your working copy. That directory must be on your `PATH`; if pnpm warns that it is not, run {command}`pnpm setup` and open a new shell. Check which `pdt` you get with:

```shell
command -v pdt    # in pnpm's global bin directory, e.g. ~/.local/share/pnpm/bin/pdt
pdt --version
```

`pdt` runs the last build, so rebuild after each change, or leave a build running in a separate terminal that rebuilds whenever a source file changes:

```shell
pnpm build:watch
```

While it rebuilds, `dist/` is briefly incomplete, so a `pdt` run at that moment can fail; run it again once the build has finished. The same goes for {command}`pnpm test:cli`, which runs the same `dist/`.

The link follows your working copy: after switching branches, the next build is the version `pdt` runs. `pdt --version` reports the version in `packages/pdt/package.json`, which is the last release, not your changes.

:::{warning}
Your development version is a real {program}`pdt`. It reads your own configuration, writes your own log files, and `pdt vtt start` starts containers on your Docker engine. To keep a check away from your own configuration and logs, run it in an empty directory with a home directory of its own:

```shell
cd "$(mktemp -d)" && HOME=$(mktemp -d) pdt vtt start
```

That does not isolate Docker: containers are still started on your engine, named after the VTT.
:::

To go back to a released {program}`pdt`:

```shell
pnpm dev:unlink
pnpm add --global @mondarth/pdt   # only if you want the released version installed
```
