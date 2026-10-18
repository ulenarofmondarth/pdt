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
| `tests/globals.d.ts` | Globals available to tests, such as `__TEST_DATA__` |
| `testdata/` | Fixture files; `__TEST_DATA__` is the path to this directory |

Tests import the code under test through the same path aliases as the source (`@/`, `@lib/`, `@util/`, `@schema/`) and import shared mocks through `@tests/`.

## Writing unit tests

- **Name the behaviour.** A test title says what the code does (`'is false when the container does not exist'`), so a failure reads as a broken promise. Group by the function or situation with `describe`.
- **Assert exactly.** Prefer `toBe`, `toEqual`, `toHaveLength` and `toHaveBeenCalledExactlyOnceWith` to loose checks such as `toBeTruthy` or `toBeGreaterThan(0)`. A loose assertion keeps passing after the behaviour has drifted.
- **Never touch the outside world.** No test may reach the Docker engine, the network, the user's home directory or the project's own log files. Mock the module that would (`dockerode`, `@util/logger.js`, `@util/config.js`).
- **Work on copies of fixtures.** A test that needs files copies them into a temporary directory and removes it afterwards. Opening a LevelDB database rewrites its lock and log files, so the fixtures in `testdata/` are never opened in place.
- **Keep mocks typed.** The factories in `tests/unit/mocks/` are checked against the real types, so renaming a method in the source or in a dependency fails the type check instead of leaving a mock that silently no longer matches. Add new shared mocks there, in the same style.
- **Prefer functions to the process's own state.** Test `resolvePaths` and `loadConfig` with temporary directories and files, and a whole run through `main()` with a context of its own and commands made for the test, rather than through the process's state (`pfs`, `process.argv`, `process.env`).
- **Reload modules that work at import time.** `src/index.ts` runs {{pdt}} as it loads, and closing the logger is terminal. Their tests call `vi.resetModules()` and import the module afresh in each test.
- **Record gaps with `test.todo`.** Behaviour that is intended but not built yet is listed as a `test.todo`, not as a skipped test with a body. The test run reports them, so they are not forgotten.

A bug fix starts with a test that fails because of the bug.
