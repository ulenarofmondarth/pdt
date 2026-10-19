# Configuring PDT

## Configuration files

{{pdt}} reads its configuration from JSON files. Each file only needs the settings it changes; everything else keeps its value from the files before it.

The configuration is built up in this order, later sources overriding earlier ones:

1. The defaults built into {{pdt}}.
2. Your user configuration file.
3. The project's configuration file, `.pdt/config.json` in the project root, when {{pdt}} runs inside a project.
4. Environment variables (below).
5. Settings given on the command line with `--config` (below).

`pdt config get --list-all --show-source` shows every setting and which of these it comes from; see {ref}`pdt_tlc_config`.

Your user configuration file is `config.json` in your user configuration directory:

| System | User configuration file |
| --- | --- |
| Linux, macOS | `~/.config/pdt/config.json`, or `$XDG_CONFIG_HOME/pdt/config.json` when `XDG_CONFIG_HOME` is set |
| Windows | `%APPDATA%\pdt\config.json` |

Settings are merged section by section: a file that sets only `Logging.level` keeps the default `Logging.filename`. A list, such as a host's `ports`, is replaced as a whole.

:::{admonition} Example
`~/.config/pdt/config.json` makes {{pdt}} more talkative everywhere:

```json
{ "Logging": { "level": "info" } }
```

and a project's `.pdt/config.json` makes it quiet again in that project:

```json
{ "Logging": { "level": "error" } }
```
:::

Rather than editing the files by hand, you can use `pdt config set`, which checks the value before writing it (see {ref}`pdt_tlc_config`).

{{pdt}} checks the combined configuration before doing anything else. If a file is not valid JSON, or a setting has a value it does not accept, {{pdt}} names the file or the setting and stops with exit code 127.

## Environment variables

| Variable | Setting |
| --- | --- |
| `PDT_LOG_LEVEL` | `Logging.level`: one of `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly` |

An environment variable overrides every configuration file. An empty variable is ignored.

## Settings on the command line

`--config <key>=<value>`, given anywhere on the command line, overrides a setting for that run only, over every file and environment variable. Give it once for each setting:

```shell
pdt --config Logging.level=debug --config VTT.prj.server.version=13 vtt start
```

The key is the setting's path, its parts separated by dots. The value is read as `pdt config set` reads it (see {ref}`pdt_tlc_config_set`). A key that is not a setting, or a value the setting does not accept, stops {{pdt}} with exit code 127, like an invalid file.

## PDT runtime data

{{pdt}} keeps data it manages itself apart from the configuration: a project's data, including its log file, is in the project's `.pdt` directory, and anything outside a project is in your user data directory (`~/.local/share/pdt` on Linux, `~/Library/Preferences/pdt` on macOS, `%APPDATA%\pdt` on Windows).
