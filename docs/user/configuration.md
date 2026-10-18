# Configuring PDT

## Configuration files

{{pdt}} reads its configuration from JSON files. Each file only needs the settings it changes; everything else keeps its value from the files before it.

The configuration is built up in this order, later sources overriding earlier ones:

1. The defaults built into {{pdt}}.
2. Your user configuration file.
3. The project's configuration file, `.pdt/config.json` in the project root, when {{pdt}} runs inside a project.
4. Environment variables (below).

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

{{pdt}} checks the combined configuration before doing anything else. If a file is not valid JSON, or a setting has a value it does not accept, {{pdt}} names the file or the setting and stops with exit code 127.

## Environment variables

| Variable | Setting |
| --- | --- |
| `PDT_LOG_LEVEL` | `Logging.level`: one of `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly` |

An environment variable overrides every configuration file. An empty variable is ignored.

## PDT runtime data

{{pdt}} keeps data it manages itself apart from the configuration: a project's data, including its log file, is in the project's `.pdt` directory, and anything outside a project is in your user data directory (`~/.local/share/pdt` on Linux, `~/Library/Preferences/pdt` on macOS, `%APPDATA%\pdt` on Windows).
