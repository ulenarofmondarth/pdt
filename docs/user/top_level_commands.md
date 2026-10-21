(pdt_tlc)=

# Top Level Commands

The main interface of the PDT is the command line.

(pdt_tlc_init)=

## init

{command}`init [dir] [options]`

Initialise a project for {program}`pdt`.

**dir**

: The project directory. Defaults to the current directory.

What happens depends on what is in the directory:

- **It has content.** The directory is treated as an existing project and is marked as a {program}`pdt` project. Nothing in it is changed apart from the new `.pdt` directory.
- **It is empty, or does not exist yet.** {program}`pdt` first creates a new Foundry VTT module there, then marks it as a {program}`pdt` project. See {ref}`pdt_tlc_init_new`.

A directory inside an existing {program}`pdt` project is refused unless `--force` is given.

`init` adds the files in `.pdt` that belong to you on this machine to the project's `.gitignore`, creating it if there is none: your secrets (`.pdt/secrets.conf`, see {ref}`pdt_conf_secrets`), the project's run state and its log. Files the `.gitignore` already names, or a `.gitignore` that names the whole `.pdt` directory, are left alone.

A project that is already initialised, one with a `.pdt/config.json`, is refused with an error (exit code 1). To set it up again from scratch, use {ref}`pdt_tlc_force_reset`. A `.pdt` directory without a `config.json`, such as one left by an `init` that could not read the module's id, is initialised as normal.

(pdt_tlc_init_id)=

### The project id

Once any new module has been created, `init` reads the module's `id` from `module.json` in the project root. That is the project's id:

- It must not already be registered (see below). If another project is registered with the same id, `init` stops with an error (exit code 1) before creating the `.pdt` directory, naming the other project's root. A module `init` has just generated is left in place. If that other project no longer exists, {ref}`pdt_tlc_prune` removes its registration.
- `init` records it as `id` in the project's `.pdt/config.json`.
- `init` registers the project in your user run state, under `PROJECTS`, with the project's root directory.
- It names the project's VTT (below).

Your user run state is `run.state.json` in your user data directory (see {ref}`pdt_conf_runtime_data`). For a project `arcane-ledger` it holds:

```json
{ "PROJECTS": { "arcane-ledger": { "root": "/home/me/projects/arcane-ledger" } } }
```

If `init` cannot read the id, because `module.json` is missing, is not JSON, has no `id`, or has an `id` with a dot in it, it warns. It then writes no configuration and registers nothing, though the `.pdt` directory is still created. Fix `module.json`, then run {ref}`pdt_tlc_force_reset`.

(pdt_tlc_init_vtt)=

### The project's VTT

`init` then configures a VTT for the module in the project's `.pdt/config.json`, the same way for a module it has just created and for one that existed already:

- the VTT is named by the project id;
- it runs the Foundry VTT version from `VERSION` in `.foundryvtt/.env`, which is the version the module was created for;
- it runs in Docker, from the `felddy/foundryvtt` image, on the first free port from 30000 (`"port": "auto"`; see {ref}`pdt_tlc_vtt_start`).

For a module `arcane-ledger` created for Foundry VTT 14.368.0, `.pdt/config.json` holds:

```json
{
  "id": "arcane-ledger",
  "VTT": {
    "arcane-ledger": {
      "server": {
        "type": "foundry",
        "hostname": "localhost",
        "version": "14.368.0",
        "port": "auto",
        "ready": { "timeout": 600 },
        "hot_reload": true
      },
      "host": { "type": "docker", "image": "felddy/foundryvtt" }
    }
  }
}
```

If `.foundryvtt/.env` is missing or does not set `VERSION`, `init` configures no VTT. It warns, and prints the `pdt config set` command that would add the VTT, with a placeholder for the version. The project is still initialised and registered.

### Options

-f, --force

: Initialise a project inside another {program}`pdt` project.

-y, --yes

: Do not ask questions when creating a new module. Use the default for anything not given as an option.

(pdt_tlc_init_new)=

### Creating a new module

In an empty directory {program}`pdt` runs the [create-fvtt-module](https://github.com/ulenarofmondarth/create-fvtt-module) generator. You are asked about the module, and a complete project is generated from the answers. The name of the directory is offered as the module ID.

```shell
mkdir arcane-ledger
cd arcane-ledger
pdt init
```

Any answer can be given as an option instead, in which case it is not asked for:

```shell
pdt init --ui-framework lit --no-install
```

With `--yes`, or when there is no interactive terminal (in a script, for example), nothing is asked: every answer not given takes its default. Three answers can be without a default, so give them as options:

```shell
pdt init arcane-ledger --yes \
  --description "Keeps the party accounts." \
  --author-name "A. Scribe" \
  --github-owner Scribes-Guild
```

If a required answer is missing or a value is not acceptable, {program}`pdt` stops with an error naming the option and creates nothing.

#### New module options

These are the generator's answers. They are used only when a new module is created. If any of them, or `--yes`, is given for a directory that already has content, {program}`pdt` warns that no module is generated and names the options it ignored; the directory is still initialised. {command}`pdt init --help` always lists the current set.

| Option | Answer | Default |
| --- | --- | --- |
| `--module-id` | The Foundry package ID | The directory name, if it is a valid ID |
| `--module-title` | The title shown in Foundry | Derived from the module ID |
| `--description` | One-line description | None; required |
| `--author-name` | Author name | Your git `user.name`; required if that is not set |
| `--author-email` | Author email, published in `module.json` | Empty |
| `--author-url` | Author website | Empty |
| `--author-discord` | Author Discord username | Empty |
| `--github-owner` | GitHub user or organisation that will own the repository | None; required |
| `--repo-name` | GitHub repository name | The module ID |
| `--foundry-version` | Foundry VTT build to develop and test against | The generator's current default |
| `--system-id` | Game system for the end-to-end test world | `dnd5e` |
| `--system-url` | Release `.zip` of that system, pinned for the tests | Known for `dnd5e`; required for any other system |
| `--restrict-to-system` | Whether the module requires that game system | No |
| `--language` | `typescript` or `javascript` | `typescript` |
| `--ui-framework` | `svelte`, `lit` or `none` | `svelte` |
| `--git-init` | Initialise a git repository in the new project | Yes |
| `--install` | Run `pnpm install` in the new project | Yes |

The yes or no options can be turned off with a `no-` prefix, for example `--no-git-init`.

The generated project's own `CONTRIBUTING.md` and `docs/developers/setup.md` describe what to do next.

### Why initialise

This ensures various data are created to ensure projects do not collide (e.g. you can run multiple Foundry VTT servers with different configurations without them interfering with one another, {program}`pdt` will also ensure your {program}`vite` development server connects to the correct backend Foundry server).

(pdt_tlc_force_reset)=

## force-reset

{command}`force-reset`

Sets up the current project again from scratch. It takes no arguments and only works inside a {program}`pdt` project; outside one it fails with exit code 1.

It does the following, in order:

1. It stops every VTT the project's run state records as started, and removes its container (see {ref}`pdt_tlc_vtt_stop`), so that none is left running without a record. If one cannot be stopped, for example because the Docker engine cannot be reached, `force-reset` stops with an error and changes nothing. A recorded VTT that is no longer configured cannot be stopped: {program}`pdt` warns, naming its container, and carries on.
2. It removes the project's run state, `.pdt/run.state.json`.
3. It removes every registration of the project's root from your user run state (see {ref}`pdt_tlc_init_id`).
4. It removes the project's configuration, `.pdt/config.json`.
5. It runs {ref}`pdt_tlc_init` in the project's root. `init` reads the project id and the Foundry VTT version afresh.

Anything else in the `.pdt` directory, such as the log, is kept. Settings you added to the project's configuration are lost, so note any you want to set again.

Use it after changing the module's `id`, after fixing a `module.json` that `init` could not read, or when the project's configuration has gone wrong.

:::{note}
{program}`pdt` checks the configuration before running any command, so `force-reset` cannot run while the project's `.pdt/config.json` is invalid. Fix or delete the file first.
:::

(pdt_tlc_prune)=

## prune

{command}`prune`

Forgets the projects that are gone. It removes from your user run state (see {ref}`pdt_tlc_init_id`) every project whose registered root no longer holds a `.pdt` directory, whether the directory was deleted, moved without {ref}`pdt_tlc_move`, or is no longer a {program}`pdt` project. It names each project it removes, and works anywhere.

Run it when `init` refuses an id that belongs to a project you have deleted.

(pdt_tlc_move)=

## move

{command}`move [destination] [options]`

Keeps your user run state in step with where the current project is. It only works inside a {program}`pdt` project whose `.pdt/config.json` records its `id`.

**destination**

: Where to move the project to. A relative path is taken from the current directory. The path must not exist yet, its parent directory must, and it must not be inside the project. Otherwise `move` fails with exit code 2 and moves nothing.

Without a destination, `move` is for a project you have already moved yourself, for example with `mv`. Run it in the project at its new place: it registers the project's id there. If the project is already registered where it is, nothing changes.

With a destination, `move` moves the whole project directory there, then registers it there. On the same filesystem this is a rename. Across filesystems, the project is copied and then the original is removed; if the copy fails, the original is left as it was.

{program}`pdt` cannot change the directory of the shell you ran it from. If you ran `move` from inside the project, it prints the matching directory in the new location, to `cd` to:

```shell
~/work/arcane-ledger/src$ pdt move ~/projects/arcane-ledger
Moved project arcane-ledger from /home/me/work/arcane-ledger to /home/me/projects/arcane-ledger
Your shell is still in the old location. To carry on where you were: cd /home/me/projects/arcane-ledger/src
```

A running VTT of the project has the project mounted from where it was, so `move` refuses (exit code 1), changing nothing, while a VTT it started is running, naming them. Stop them first ({ref}`pdt_tlc_vtt_stop`), or give one of:

`--stop-all-containers`

: Stop every running VTT of the project, then move it.

`--restart-all-containers`

: Stop every running VTT of the project, move it, then start them again from where the project now is.

Giving both is a usage error (exit code 2). Without a destination they work the same way: `--restart-all-containers` starts the VTTs again with the project where you moved it.

Either way, `move` refuses (exit code 1) when the id is registered to another directory that is still a {program}`pdt` project, such as when this project is a copy of that one. Give the copy its own id in `module.json` and run {ref}`pdt_tlc_force_reset`.

:::{note}
On Windows a directory cannot be renamed while a program, such as your shell or an editor, is using it. Run `pdt move` with a destination from outside the project there.
:::

(pdt_tlc_status)=

## status

{command}`status`

Shows {program}`pdt`'s runtime state. It takes no arguments.

In a project, it lists the project's VTTs and what each is doing:

```text
$ pdt status
Project arcane-ledger (/home/me/work/arcane-ledger)
  arcane-ledger: running at http://localhost:30002 (container pdt-arcane-ledger)
  staging: stopped
```

- **running**: {program}`pdt` started it, and its host says it is running.
- **stopped**: {program}`pdt` has no record of starting it: it has never been started, or was stopped with {ref}`pdt_tlc_vtt_stop`.
- **exited**: {program}`pdt` started it, but it has stopped since, for example because Foundry VTT exited or its container was removed. The line names its container, whose `docker logs` say why; `pdt vtt start` clears it up and starts it afresh.
- **unknown**: {program}`pdt` cannot tell, and says why: its host cannot be reached, or it is recorded as started but no longer configured (the line names its container, to stop yourself).

A VTT with no record is reported as stopped without asking its host, so `status` works without the Docker engine for a project with nothing running.

Outside a project, it does the same for every project registered in your user run state (see {ref}`pdt_tlc_init_id`), each read with its own configuration. A project whose directory has gone is shown as gone, with a pointer to {ref}`pdt_tlc_prune`, and one whose configuration or run state cannot be read says why; the rest are listed regardless. With {ref}`--project <pdt_cli_project>`, it reports only that project.

`status` exits with code 0 whatever it finds.

(pdt_tlc_config)=

## config

{command}`config <get|set|clear>`

Shows and changes the configuration (see {doc}`configuration`). A setting is named by its key: the path to it, its parts separated by dots, such as `Logging.level` or `VTT.arcane-ledger.server.version`. A key can also name a group of settings, such as `Logging` or `VTT.arcane-ledger`.

(pdt_tlc_config_get)=

### config get

{command}`config get [key] [options]`

Shows the value of a setting, or of a group of settings.

**key**

: The setting, or group of settings, to show.

A single setting is shown as its value alone, so that a script can use it as it is:

```shell
$ pdt config get Logging.level
warn
```

A group is shown in the format chosen with `--format`.

{{pdt}} stops with an error, writing nothing to standard output, if the key is not a setting {{pdt}} has, or if nothing sets it: an optional setting that is not set, a VTT that is not configured, or `VTT` itself before any VTT is configured. Without a key, `--list-all` is required.

#### Options

`--list-all`

: Show every setting, instead of the one named by a key.

`--format flat|tree|json|yml`

: How to show a group of settings. Default: `flat`.

  `flat`
  : A line for each setting: its full key, a space, then its value. Strings are quoted; lists are shown as JSON.

    ```text
    Logging.filename "pdt.log"
    Logging.level "warn"
    ```

  `tree`
  : The keys as a tree, each value after its name.

    ```text
    Logging
    ├── filename: "pdt.log"
    └── level: "warn"
    ```

  `json`
  : The settings as JSON.

  `yml`
  : The settings as YAML.

  For a single setting, `json` and `yml` show its value serialised (a string quoted in JSON, for example); `flat` and `tree` show it alone.

`--show-source`

: Add where each value comes from after it, in brackets: `[default]`, `[user]`, `[project]`, `[environment]` or `[cli]` (from `--config`). Shown by `flat` and `tree`, and for a single setting; ignored by `json` and `yml`.

  ```text
  $ pdt config get Logging --show-source
  Logging.filename "pdt.log" [default]
  Logging.level "debug" [user]
  ```

  A value from a secrets file shows `[user-secrets]` or `[project-secrets]`.

`--print-secrets`

: Show secret settings as they are. Without it, each is shown as `*****`, in every format (see {ref}`pdt_conf_secrets`).

  ```text
  $ pdt config get FOUNDRY
  FOUNDRY.username "*****"
  FOUNDRY.password "*****"
  $ pdt config get FOUNDRY.password --print-secrets
  hunter2
  ```

(pdt_tlc_config_set)=

### config set

{command}`config set <key> <value> [options]`

Sets a value in a configuration file, creating the file if there is none. Inside a project the project's `.pdt/config.json` is written; outside one, your user configuration file. A secret setting is written to the `secrets.conf` beside it instead, and a group holding secrets is split between the two (see {ref}`pdt_conf_secrets`); {{pdt}} says which files it wrote.

**key**

: The setting to set, or a group of settings to set all at once.

**value**

: The value. Text the setting accepts as it is stays text, so `pdt config set VTT.arcane-ledger.server.version 13` sets the string `"13"`. Anything else is read as JSON, so a number, a list or a group can be given:

  ```shell
  pdt config set VTT.arcane-ledger.server '{"hostname": "vtt.local", "port": 8080}'
  ```

  Quote a value with spaces or characters your shell treats specially.

Nothing is written if the key is not a setting, or if the configuration with the new value would be invalid; {{pdt}} names the problem and stops with an error. Other settings in the file are kept.

#### Options

`--user`

: Write your user configuration file, even inside a project.

(pdt_tlc_config_clear)=

### config clear

{command}`config clear <key> [options]`

Removes a setting from the project's `.pdt/config.json`, or from `.pdt/secrets.conf` for a secret (a group is removed from both), so that it takes its value from the sources before it again (your user file, or the default). Groups left empty by the removal are removed too; other settings in the file are kept.

**key**

: The setting, or group of settings, to remove.

```shell
pdt config clear VTT.arcane-ledger.server.port   # from the project's file
pdt config clear Logging.level --user            # from your user file
pdt config clear Logging.level --all             # from every file that sets it
```

Only the one file is changed: unlike `set`, `clear` does not use your user file outside a project, but stops with an error; give `--user` there.

If the file does not set the key, nothing is changed and {{pdt}} warns you. The warning names any other file that does set it, which `--all` would clear.

{{pdt}} stops with an error, changing nothing, if the key is not a setting {{pdt}} has, or if the configuration without the setting would be invalid (for example, removing a required setting of a VTT your file defines).

#### Options

`--user`

: Remove the setting from your user configuration file instead of the project's.

`--all`

: Remove the setting from every configuration file that sets it: your user file and, inside a project, the project's.

(pdt_tlc_pack)=

## pack

{command}`pack [list|import|export|reconcile]`

Manipulates Foundry compendium databases (commonly referred to as 'packs').

### pack list

{command}`pack list [options]`

Lists packs currently in the {term}`PUD`.

Unless the `--configured` option is used

#### Options

-c, --configured

: Limit the packs to those configured in the `module.json`.

### pack import

{command}`pack import [options] [SRC] [DST]`

One or both of `SRC` or `DST` must be provided. If only one is provided the other will be inferred from the {term}`PUD`.

#### Parameters

**SRC**

: The source for the pack. This can be an absolute or relative path. By default relative paths are relative to the currently configured pack source root.

**DST**

: Destination to which the `SRC` will be exported.

#### Options

### pack export

{command}`pack export [options] [SRC] [DST]`

One or both of `SRC` or `DST` must be provided. If only one is provided the other will be inferred from the {term}`PUD`.

By default the `DST` is deleted before the export, see `--keep`.

**SRC**

**DST**

#### Options

--keep

: Leaves the `DST` intact at the start of the export. Existing files *are* overwritten but none are deleted.

### pack reconcile

{command}`pack reconcile [options] [SRC] [DST]`

One or both of `SRC` or `DST` must be provided. If only one is provided the other will be inferred from the {term}`PUD`.

**SRC**

**DST**

#### Options

(pdt_tlc_serve)=

## serve

Interface with {program}`pdt` controlled Foundry VTT instance to provide 'server-side' extension. This allows various modules to provide features in development that are not normally available in Foundry. For example, the {program}`pdt` server allows modules to copy, move, replace, and delete files in the various data directories (this makes packing modules much simpler from a user perspective as the MAIDE module can shuffle assets into the module and compendiums without the user needing to do this manually).

```{todo}
This {program}`pdt` server becomes available to the VTT. Could use the p2p approach or simply set the port on which it is available to the running VTT. Using the prp connection would make it easier for it to use the MAIDE proxy for interacting with the VTT. Could do both, this would allow {program}`pdt` to interact with the VTT from the command line
```

(pdt_tlc_vtt)=

## vtt

{command}`vtt <command>`

Controls the VTTs configured for a project. Each VTT is an entry under `VTT` in the configuration, naming a Foundry VTT server and the host it runs on. {program}`pdt` has no VTT of its own: {ref}`pdt_tlc_init` configures one for the project's module (see {ref}`pdt_tlc_init_vtt`), and more can be added with {ref}`pdt_tlc_config_set`.

(pdt_tlc_vtt_start)=

### vtt start

{command}`vtt start [vtt]`

Starts a VTT of the project {program}`pdt` is run in, and waits until it answers.

**vtt**

: The name of the VTT to start. Left out, it is the first VTT the project's `.pdt/config.json` (or `.pdt/secrets.conf`) configures, or, if the project configures none, the first VTT configured at all. After `init` that is the project's own VTT.

```shell
$ pdt vtt start
Starting VTT arcane-ledger (version 14.368.0) on port 30002…
Waiting up to 600 seconds for VTT arcane-ledger to answer at http://localhost:30002…
VTT arcane-ledger has started: http://localhost:30002
```

The port is the VTT's `server.port`. `auto`, the default, is the first port from 30000 that nothing on this machine is listening on, so several VTTs, from one project or several, can run side by side. A number is used as it is, and {program}`pdt` stops with an error if something is listening on it.

On a Docker host, {program}`pdt` pulls the image the first time (tagged with the server's version, for example `felddy/foundryvtt:14.368.0`), then creates and starts a container publishing the server's port on that port. The container is named `pdt-<project id>` for the VTT named after the project, as after `init`, and `pdt-<project id>-<vtt>` for any other. It is given:

- **its data directory**, as `/data`: `vtt/<container name>` in your user data directory (`~/.local/share/pdt/vtt/pdt-arcane-ledger` on Linux). It is kept when the VTT stops, so Foundry VTT is downloaded and installed only on the first start, and worlds you create are kept. It is outside the project so that it is never committed, and so that the project, given to the VTT inside it, does not contain it;
- **the project, as the module it is**, at `/data/Data/modules/<project id>`, so Foundry VTT runs the module from your working copy. A project without an id is not given, with a warning;
- **your Foundry VTT account and licence key** (`FOUNDRY.username`, `FOUNDRY.password`, `FOUNDRY.license_key`) and the VTT's administrator password (`VTT.<vtt>.server.admin_key`), from your secrets (see {ref}`pdt_conf_secrets`). They are passed to the container as environment variables and written nowhere else. Without an account, {program}`pdt` warns: Foundry VTT can then only run if an earlier start installed it;
- **hot reload**, unless the VTT's `server.hot_reload` is `false`, so that Foundry VTT picks up changes to the module's styles, templates and translations as you make them;
- **your user** to run as, so that the files Foundry VTT writes in the data directory are yours.

:::{note}
Anyone who can use the Docker engine can read a container's environment variables with `docker inspect`, your Foundry VTT password among them.
:::

Once the container has started, {program}`pdt` waits until Foundry VTT answers at the VTT's address, for up to `VTT.<vtt>.server.ready.timeout` seconds (600 unless set; the first start downloads and installs Foundry VTT). If the container stops meanwhile, or the time runs out, {program}`pdt` stops with an error naming the container, whose `docker logs` say what happened. The VTT stays recorded, so `pdt vtt stop` clears it up, as does the next `start`.

{program}`pdt` records the running VTT in the project's run state, `.pdt/run.state.json`: the container, its port, its address and the host it runs on. `stop`, `restart` and {ref}`pdt_tlc_status` find the VTT on that host, so changing the configuration, such as the Docker engine's `socketPath`, while a VTT runs does not lose it: it is stopped where it runs, and started again on the host configured now. `stop` and `restart` use that record, and so does `start`: a VTT that is running already is left alone, and its address shown. If the VTT has stopped since it was started, for example because Foundry VTT exited, {program}`pdt` removes what is left of it and starts it afresh.

{program}`pdt` stops with an error, starting nothing, if:

- it is not run in a project;
- no VTT is configured at all;
- there is no VTT of that name in the configuration (the error lists the ones there are);
- the host cannot be reached, for example because the Docker engine is not running or you are not allowed to use it;
- no port is free, or the one set is taken;
- a container of the same name is running that the project has no record of starting (stop it with `docker rm -f <name>`);
- the image cannot be pulled, or the container cannot be created or started (the error gives Docker's reason).

(pdt_tlc_vtt_stop)=

### vtt stop

{command}`vtt stop [vtt]`

Stops a VTT that {program}`pdt` started in the project, and removes its container, so that the next `start` creates it afresh from the configuration. The VTT is chosen as for `start`. The record of it in the project's run state is removed.

A VTT that {program}`pdt` has no record of starting is left alone: {program}`pdt` says it is not running, without asking its host. {program}`pdt` stops with an error, keeping the record, if the host cannot be reached or cannot stop the container.

(pdt_tlc_vtt_restart)=

### vtt restart

{command}`vtt restart [vtt]`

Stops the VTT, as `stop` does, then starts it, as `start` does, so that it runs with the configuration as it is now: a new Foundry VTT version or port takes effect. A VTT that is not running is just started.

### vtt init

{command}`vtt init`

:::{note}
`vtt init` is planned, and not available yet. For whether a VTT is running, see {ref}`pdt_tlc_status`.
:::

(pdt_tlc_vtt_install)=

### vtt install

{command}`vtt install [vtt] --dry-run`

Works out the packages the VTT needs, and shows what installing them would do:
- the project's module, read from its `module.json`;
- the system and modules the VTT's `packages` setting names (see {ref}`pdt_conf_vtt_packages`);
- every module they require, and a system they run in;
- each at a version that works with the Foundry VTT version the VTT runs. Installing never changes that version.

{{pdt}} finds packages' releases in Foundry VTT's package listing, on GitHub and GitLab, and at the manifest URLs packages declare. What it fetches is kept in your user data directory, under `cache/resolver`, so a second run asks only for what has changed. A GitHub token (`SOURCES.github_token`, see {ref}`pdt_conf_secrets`) raises GitHub's limit of 60 requests an hour.

A version that names a whole generation, such as `13`, means its newest stable build that has an image, as the image's own tag does. A Foundry VTT build with no image to run it in cannot be installed for, and {{pdt}} says so.

```shell
$ pdt vtt install --dry-run
Working out what VTT arcane-ledger needs…
VTT arcane-ledger: Foundry VTT 14.368, found in 3 rounds:
  dnd5e 5.3.3: to install
  lib-wrapper 1.13.5.1: to install
  midi-qol 14.0.15: installed already
  socketlib 1.1.4: to install, replacing 1.1.3
  arcane-ledger 0.1.0: the project’s module
Dry run: nothing was installed.
```

A premium package is listed for you to install through Foundry VTT, since downloading it needs your licence.

When no setup meets the requirements, {{pdt}} explains why, step by step, and exits with an error:

```text
No setup of VTT arcane-ledger meets the requirements:
Because Foundry VTT 14.362 cannot be used: there is no felddy/foundryvtt image for it and Foundry VTT 14.362 is pinned, the requirements cannot be met. (1)
```

{{pdt}} warns about any source it could not read, naming its URL, and about packages it could check only from their listing because their manifests could not be loaded. The answer may then be incomplete.

:::{note}
Installing is not available yet: give `--dry-run`. Without it, `vtt install` stops with an error and changes nothing.
:::
