# Testing

`PDT` uses [vitest](https://vitest.dev) as its testing framework.

To run all defined tests and then watch for file changes use `pnpm vitest`. To run them once use `pnpm test`.

Type checking is separate from the test run; use `pnpm typecheck` (see {ref}`typescript-compilers`).

## Coverage

`pnpm test:coverage` runs the tests once and measures coverage with the `v8` provider. It prints a summary and writes an HTML report to `coverage/index.html` (plus `lcov` output for tooling).

Coverage is measured over `src/**/*.ts`, excluding the generated `src/paraglide` modules and type declarations.

The run fails if coverage drops below the thresholds in `vite.config.ts` (`test.coverage.thresholds`). The thresholds sit just below the currently measured level. Raise them as tests are added; never lower them to get a change through.

## Layout of Tests

Unit tests live in `tests/unit/`, in `.test.ts` files. The directory mirrors `src/`: the tests for `src/lib/Compendium.ts` are in `tests/unit/lib/Compendium.test.ts`.

| Path | Holds |
| --- | --- |
| `tests/unit/` | Unit tests, mirroring `src/` |
| `tests/unit/mocks/` | Shared mocks and mock factories |
| `tests/cli/` | Tests of the built command line (see below) |
| `tests/globals.d.ts` | Globals available to tests, such as `__TEST_DATA__` |
| `testdata/` | Fixture files; `__TEST_DATA__` is the path to this directory |

Tests import the code under test through the same path aliases as the source (`@/`, `@lib/`, `@util/`, `@schema/`) and import shared mocks through `@tests/`.

## Writing unit tests

- **Name the behaviour.** A test title says what the code does (`'is false when the container does not exist'`), so a failure reads as a broken promise. Group by the function or situation with `describe`.
- **Assert exactly.** Prefer `toBe`, `toEqual`, `toHaveLength` and `toHaveBeenCalledExactlyOnceWith` to loose checks such as `toBeTruthy` or `toBeGreaterThan(0)`. A loose assertion keeps passing after the behaviour has drifted.
- **Never touch the outside world.** No test may reach the Docker engine, the network, the user's home directory or the project's own log files. Pass a stand-in to code that takes its dependencies (a Docker client, a VTT host), and mock the module only where code imports it (`@util/logger.js`).
- **Work on copies of fixtures.** A test that needs files copies them into a temporary directory and removes it afterwards. Opening a LevelDB database rewrites its lock and log files, so the fixtures in `testdata/` are never opened in place.
- **Keep mocks typed.** The factories in `tests/unit/mocks/` are checked against the real types, so renaming a method in the source or in a dependency fails the type check instead of leaving a mock that silently no longer matches. Add new shared mocks there, in the same style.
- **Prefer functions to the process's own state.** Test `resolvePaths` and `loadConfig` with temporary directories and files, and a whole run through `main()` with a context of its own and commands made for the test, rather than through the process's state (`process.argv`, `process.env`). Test a command through the context it is given (see {doc}`commands`).
- **Reload modules that work at import time.** `src/index.ts` runs {{pdt}} as it loads, and closing the logger is terminal. Their tests call `vi.resetModules()` and import the module afresh in each test.
- **Record gaps with `test.todo`.** Behaviour that is intended but not built yet is listed as a `test.todo`, not as a skipped test with a body. The test run reports them, so they are not forgotten.

A bug fix starts with a test that fails because of the bug.

## Testing the built command line

The tests in `tests/cli/` run the built CLI, `node dist/index.js`, as a user would, and check what a user sees: exit codes, what goes to standard output and to standard error, which configuration files apply, where the log goes, and what `init` creates. They catch what unit tests cannot: how the modules are wired together, and what only goes wrong in a real process, such as an unhandled `'error'` event.

```shell
pnpm build && pnpm test:cli
```

They have their own configuration, `vitest.cli.config.ts`, and refuse to run without a build. CI runs them in the Build job, against the bundle it has just built. They measure no coverage.

Each test works in a `Sandbox` (`tests/cli/pdt.ts`): a temporary home directory and work directory. `sandbox.run(args, { cwd, env })` starts {{pdt}} with only `PATH`, `HOME` and the variables given, and no terminal, so nothing of the person running the tests (their configuration, `PDT_LOG_LEVEL`, their projects) can change the result, and {{pdt}} never waits for an answer.

Add a CLI test for behaviour a user relies on, and for a bug that only showed in the built CLI. Test the details of a module with unit tests.
