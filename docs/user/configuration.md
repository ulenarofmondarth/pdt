# Configuring PDT

## Configuration files

{{pdt}} reads its configuration from JSON files. Each file only needs the settings it changes; everything else keeps its value from the files before it.

The configuration is built up in this order, later sources overriding earlier ones:

1. The defaults built into {{pdt}}.
2. Your user configuration file, then your user secrets file (see {ref}`pdt_conf_secrets`).
3. The project's configuration file, `.pdt/config.json` in the project root, then the project's secrets file, `.pdt/secrets.conf`, when {{pdt}} runs inside a project or is given one with `--project` (see {ref}`pdt_cli_project`).
4. Environment variables (below).
5. Settings given on the command line with `--config` (below).

`pdt config get --list-all --show-source` shows every setting and which of these it comes from; see {ref}`pdt_tlc_config`.

Your user configuration file is `config.json` in your user configuration directory:

| System | User configuration file |
| --- | --- |
| Linux, macOS | `~/.config/pdt/config.json`, or `$XDG_CONFIG_HOME/pdt/config.json` when `XDG_CONFIG_HOME` is set |
| Windows | `%APPDATA%\pdt\config.json` |

Settings are merged section by section: a file that sets only `Logging.level` keeps the default `Logging.filename`. A list is replaced as a whole.

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

Rather than editing the files by hand, you can use `pdt config set` and `pdt config clear`, which check the result before writing it (see {ref}`pdt_tlc_config`).

The built-in defaults configure no VTT: `pdt init` adds one for the project's module to the project's file (see {ref}`pdt_tlc_init_vtt`). It also records the project's id there, as the top-level setting `id` (see {ref}`pdt_tlc_init_id`).

{{pdt}} checks the combined configuration before doing anything else. If a file is not valid JSON, or a setting has a value it does not accept, {{pdt}} names the file or the setting and stops with exit code 127.

(pdt_conf_secrets)=

## Secrets

Some settings are secret: passwords, keys and the like. They are kept apart from the rest, in a `secrets.conf` beside each `config.json`, so that a project's configuration can be shared and committed without them:

| Setting | What it is |
| --- | --- |
| `FOUNDRY.username`, `FOUNDRY.password` | Your Foundry VTT account, used to download Foundry VTT |
| `FOUNDRY.license_key` | Your Foundry VTT licence key |
| `VTT.<name>.server.admin_key` | The administrator password of a VTT's server |

Your Foundry VTT account is the same for every project, so `FOUNDRY` usually belongs in your user secrets file, `secrets.conf` in your user configuration directory (`~/.config/pdt/secrets.conf` on Linux).

A `secrets.conf` holds JSON, like a `config.json`, and is read straight after it. Use `pdt config set` to write it: a secret setting goes to `secrets.conf`, everything else to `config.json`, and a group of settings given at once is split between the two. {{pdt}} makes a `secrets.conf` readable only by you when it writes it. Inside a project it also adds `.pdt/secrets.conf` to the project's `.gitignore`, as `pdt init` does (see {ref}`pdt_tlc_init`).

{{pdt}} refuses to run, with exit code 127, if a `config.json` holds a secret setting, naming the setting and the `secrets.conf` it belongs in. Move it there by hand.

`pdt config get` shows a secret as `*****`; give `--print-secrets` to see it (see {ref}`pdt_tlc_config`). Secrets given to `pdt config set` or `--config` are masked in the log as well.

(pdt_conf_vtt)=

## A VTT's server and host

Each VTT, `VTT.<vtt>`, has a `server`, the Foundry VTT it runs, and a `host`, where it runs. Besides its `type`, the `server` sets:

| Setting | What it is |
| --- | --- |
| `version` | The Foundry VTT release to run. |
| `hostname` | The name the VTT is reached at; `localhost` after `init`. |
| `port` | The port to serve on: a number, or `auto` (the default) for the first free one from 30000. |
| `ready.timeout` | How long `pdt vtt start` waits, in seconds, for the server to answer once its host has started it; 600 unless set. The first start downloads and installs Foundry VTT. |
| `hot_reload` | Whether Foundry VTT reloads a module's styles, templates and translations as you change them; `true` unless set. Turn it off with `pdt config set VTT.<vtt>.server.hot_reload false`. |
| `admin_key` | The server's administrator password; a secret (see {ref}`pdt_conf_secrets`). |

Besides its `type`, the `host` can set:

| Setting | What it is |
| --- | --- |
| `image` | The Docker image to run, without a tag; `felddy/foundryvtt` unless set. The tag is the server's `version`. |
| `repository` | The registry to pull the image from; Docker Hub unless set. |
| `socketPath` | The Docker engine's socket; Docker's default unless set. |

## Environment variables

| Variable | Setting |
| --- | --- |
| `PDT_LOG_LEVEL` | `Logging.level`: one of `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly` |

An environment variable overrides every configuration file. An empty variable is ignored.

## Settings on the command line

`--config <key>=<value>`, given anywhere on the command line, overrides a setting for that run only, over every file and environment variable. Give it once for each setting:

```shell
pdt --config Logging.level=debug --config VTT.arcane-ledger.server.version=14.360.0 vtt start
```

The key is the setting's path, its parts separated by dots. The value is read as `pdt config set` reads it (see {ref}`pdt_tlc_config_set`). A key that is not a setting, or a value the setting does not accept, stops {{pdt}} with exit code 127, like an invalid file.

(pdt_conf_runtime_data)=

## PDT runtime data

{{pdt}} keeps data it manages itself apart from the configuration: a project's data, including its log file, is in the project's `.pdt` directory, and anything outside a project is in your user data directory (`~/.local/share/pdt` on Linux, or `$XDG_DATA_HOME/pdt` when `XDG_DATA_HOME` is set; `~/Library/Preferences/pdt` on macOS, `%APPDATA%\pdt` on Windows).

Run state is the part of that data that {{pdt}} needs in order to work, rather than for your information. It is kept in `run.state.json`, in your user data directory for things that span projects and in the project's `.pdt` directory for the project. Your user run state registers each project by its id (see {ref}`pdt_tlc_init_id`). Don't edit it by hand: {ref}`pdt_tlc_force_reset` clears a project's run state, {ref}`pdt_tlc_move` updates a project's registration when it moves, and {ref}`pdt_tlc_prune` removes the registrations of projects that are gone.
