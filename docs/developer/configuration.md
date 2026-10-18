# Configuration

{{pdt}}'s configuration is described for users in {doc}`/user/configuration`. This page is about the code.

```{mermaid}
:align: center
:caption: How configuration cascades (later sources win)

flowchart LR
  d["defaults<br/><code>src/pdt-internal-config/default.json</code>"] --> u["user<br/><code>~/.config/pdt/config.json</code>"]
  u --> p["project<br/><code>.pdt/config.json</code>"]
  p --> e["environment<br/><code>PDT_LOG_LEVEL</code>"]
  e --> v{"validated by<br/><code>@schema/config.ts</code>"}
```

## Modules

- **`@util/runtime-config.ts`**: `resolvePaths({ cwd, home, platform, env })` works out the user configuration directory, the user data directory and the project's `.pdt` directory. It creates nothing; directories are created when something is first written to them. `pfs` holds the result for the running process.
- **`@util/load-config.ts`**: `loadConfig({ files, env })` merges the defaults, each file that exists and the environment variables, and validates the result with the zod schema in `@schema/config.ts`. It returns the typed `Config`, or throws a `ConfigError` whose `problems` name each invalid setting. `configFiles(paths)` lists the user's and the project's files. Neither function looks at the running process, so tests pass in temporary files and variables.
- **`src/main.ts`**: `main()` loads the configuration for the run before anything else. A `ConfigError` is written to standard error and `main()` returns exit code 127 (`EXITCODE.INVALID_CONFIG`); the logger cannot report it, as it is configured from this. `main()` then hands each part the settings it needs, such as `configureLogger(config.Logging)`.

Nothing loads the configuration as it is imported, so code that needs settings receives them as arguments, typed by the schema (for example `createServer(options, config.VTT)`).

## Adding a setting

1. Add it to the schema in `src/schema/config.ts`. Settings the schema does not name are dropped when the configuration is validated.
2. Give it a default in `src/pdt-internal-config/default.json`, unless it is optional.
3. To let an environment variable set it, add the variable to `ENVIRONMENT_SETTINGS` in `@util/load-config.ts`.
4. Document it in {doc}`/user/configuration`.

(runtime-configuration)=

## Runtime Configuration

In addition to user supplied configuration {{pdt}} also uses a runtime configuration. This is, by default, held in the `.pdt` directory in the root of each project that is using {{pdt}}. A 'global' runtime configuration is maintained in the application data directory. This global data coordinates things like port assignments across all projects.

This runtime configuration is maintained by {{pdt}} and should not generally be edited by the user. Instead the various commands in {{pdt}} will manipulate the runtime configuration.

The {ref}`pdt_tlc_info` command displays this runtime configuration.

```{mermaid}
:align: center
:caption: Runtime configuration

block-beta
  columns 2
  c["project"]
  c1["<i>path/to/project</i>/.pdt"]
  d["global"]
  d1["<i>usrdata</i>/pdt/rt"]
```
