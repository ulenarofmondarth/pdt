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
Before working on the code, create a new branch (`git switch my_new_branch`) to work on.

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
   click id4 href "tdd-primer.html#tdd-write-failing-test"
   click id5 href "tdd-primer.html#tdd-write-code"
   click id6 href "tdd-primer.html#tdd-refactor"
```

Use of Test Driven Development (TDD) is encouraged. So, first write a test to specify the change you are going to make. For a new feature this will typically be in a `.spec.ts` file. For a bug this will typically be in a `.test.ts` file alongside the code containing the bug.

:::{tip}
Commit to your branch frequently ({command}`git add <your code>` and {command}`git commit -m 'My awesome edits'`). This provides a nice way to keep track of changes but more importantly gives you plenty a 'checkpoints' to roll-back to if you discover a problem with your current direction.
:::

Write code for your changes.

Test using {command}`pnpm test` (or open a separate terminal and run {command}`pnpm vitest`, which will run all tests and the watch for changes and run any tests related to the changed files).

:::{tip}
If you stage your changes (using {command}`git add`) you can use {command}`npm run test:ci` to limit the tests to those related to file in the staging index.
:::

Repeat the write test/develop/test/refactor cycle until you have completed your change.

Commit the final changes to your repostory.

If you have installed {program}`act` (see {ref}`developer recommended installs <recommended-developer-installs>`) you can use it to run the {term}`CI` chain locally. This helps identify any potential issues *before* you offer them into the official buildk

```shell
act
```

If you have followed the {ref}`project-code-control` advice you will have a forked repository ready to prepare a {ref}`project-pull-request`.

If you just want to use this modification yourself you can install directly from this local copy or you can push the change to your own forked repository's `main` and a new `npm` package will be published.

```{todo}
Section on how `npm` packages are published, how to setup the project to use the correct account, etc.
```
