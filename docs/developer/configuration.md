# Configuration

{{pdt}}'s configuration is described for users in {doc}`/user/configuration`. This page is about the code.

```{mermaid}
:align: center
:caption: How configuration cascades (later sources win)

flowchart LR
  d["defaults<br/><code>src/pdt-internal-config/default.json</code>"] --> u["user<br/><code>~/.config/pdt/config.json</code>"]
  u --> p["project<br/><code>.pdt/config.json</code>"]
  p --> e["environment<br/><code>PDT_LOG_LEVEL</code>"]
  e --> c["cli<br/><code>--config key=value</code>"]
  c --> v{"validated by<br/><code>@schema/config.ts</code>"}
```

## Modules

- **`@util/runtime-config.ts`**: `resolvePaths({ cwd, home, platform, env })` works out the user configuration directory, the user data directory and the project's `.pdt` directory. It creates nothing; directories are created when something is first written to them. `src/index.ts` works them out for the running process, and commands get them from their context (see {doc}`commands`).
- **`@util/load-config.ts`**: `loadConfig({ files, env, overrides })` merges the defaults, each file that exists, the environment variables and the command line settings, and validates the result with the zod schema in `@schema/config.ts`. It returns the typed `Config`, or throws a `ConfigError` whose `problems` name each invalid setting. `resolveConfig` does the same and also keeps where each value came from (`sourceOf(key)`): the source that last set it, or `default` for a value no source set, including those the schema fills in. `writeSetting(sources, target, key, value)` sets a value in the user or project file, and `clearSetting(sources, targets, key)` removes one from files, each validating the whole configuration with the change before writing; `filesSetting(sources, key)` lists the files that set a key. `configFiles(paths)` lists the user's and the project's files, each labelled with its source. None of these looks at the running process, so tests pass in temporary files and variables.
- **`@util/config-keys.ts`**: keys, such as `VTT.arcane-ledger.server.version`. `parseKey` splits one, `settingKey` also refuses one the schema lacks, `schemaAt` finds what the schema says about it (walking objects, records and unions), `valueAt` finds its value, `leaves` lists every value in a group, `withoutKey` removes one (with the groups that leaves empty), and `parseValue` reads a value given as text: as text if the setting accepts it as it is, otherwise as JSON.
- **`src/cli/overrides.ts`**: `configOverrides(args)` picks the `--config <key>=<value>` settings out of the command line. The configuration is read before yargs parses the command line, since the logger and the commands depend on it; yargs declares the option too, for the help and strict parsing.
- **`src/main.ts`**: `main()` resolves the configuration for the run before anything else. A `ConfigError` is written to standard error and `main()` returns exit code 127 (`EXITCODE.INVALID_CONFIG`); the logger cannot report it, as it is configured from this. `main()` then hands each part the settings it needs, such as `configureLogger(config.Logging)`, and gives commands `sourceOf` and `writeConfig` (see {doc}`commands`).

Nothing loads the configuration as it is imported, so code that needs settings receives them as arguments, typed by the schema (for example `createHost(config.VTT['arcane-ledger'].host)`; see {doc}`vtt`).

## Adding a setting

1. Add it to the schema in `src/schema/config.ts`. Settings the schema does not name are dropped when the configuration is validated.
2. Give it a default in `src/pdt-internal-config/default.json`, unless it is optional.
3. To let an environment variable set it, add the variable to `ENVIRONMENT_SETTINGS` in `@util/load-config.ts`.
4. Document it in {doc}`/user/configuration`.

`pdt config get` and `set`, and `--config`, work for the new setting without changes: they follow the schema.

(runtime-configuration)=

## Runtime Configuration

In addition to user supplied configuration {{pdt}} also uses a runtime configuration. This is, by default, held in the `.pdt` directory in the root of each project that is using {{pdt}}. A 'global' runtime configuration is maintained in the application data directory. This global data coordinates things like port assignments across all projects.

This runtime configuration is maintained by {{pdt}} and should not generally be edited by the user. Instead the various commands in {{pdt}} will manipulate the runtime configuration.

It is kept as run state, in `run.state.json` (`@util/run-state.ts`): the user's in the user data directory, `runStateFile(paths.userDataDir)`, and a project's in its `.pdt` directory. Unlike the configuration it has no layers and no defaults. `readRunState` validates what pdt reads from it and keeps anything else as it is, so an older or newer pdt does not lose another's state.

The user's run state registers each project under `PROJECTS`, by the project's id, with its root directory:

```json
{ "PROJECTS": { "arcane-ledger": { "root": "/home/me/projects/arcane-ledger" } } }
```

`init` (`initProject` in `src/cli/cmds/init.ts`) reads the module's id from `module.json` once any new module has been generated. It refuses an id that `registeredProject` finds, before it creates the `.pdt` directory. It then records the id as `id` in the project's configuration, names the VTT by it, and calls `registerProject`. `force-reset` removes the project's run state, calls `unregisterProject` for the project's root, removes the project's configuration, and calls `initProject` again. `prune` calls `pruneProjects`, which drops each project whose root fails `isPdtProject`. `move` re-registers the project's id at its current root, or at the destination after `relocate` has moved it there. It takes the id only from the project's own file (`sourceOf(['id']) === 'project'`), and refuses to take over an id whose registered root still `isPdtProject`.

The user run state is kept in the user data directory rather than in a `.pdt` directory in the home directory: pdt finds a project by looking for a `.pdt` directory upwards from where it runs, up to the home directory, so a `~/.pdt` would make every directory under home look like one project.

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
