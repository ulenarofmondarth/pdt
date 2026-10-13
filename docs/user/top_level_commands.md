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

- **It has content.** The directory is treated as an existing project and is marked as a {program}`pdt` project. Nothing in it is changed.
- **It is empty, or does not exist yet.** {program}`pdt` first creates a new Foundry VTT module there, then marks it as a {program}`pdt` project. See {ref}`pdt_tlc_init_new`.

A directory inside an existing {program}`pdt` project is refused unless `--force` is given.

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

(pdt_tlc_info)=

## info

Display the current project's runtime configuration.

(pdt_tlc_config)=

## config

{command}`config [options] [show|get|set]`

Manipulates the PDT configuration. An initial 'user' configuration is created when a module is initialised in PDT.

### Options

-e, --environment

: Sub-commands operate on the configuration file for the specified environment.

  :::{admonition} Examples
  `pdt config -e DEV get logger.filename` will return the configuration value appropriate for the `DEV` environment. This could be from user's defaults `pdt.config.json` or the environment specific `pdt.dev.config.json`.

  `pdt config -e DEV set logger.filename my-pdt.log` will set the `logger.filename` to `my-pdt.log` in the `pdt.dev.config.json` file.
  :::

  :::{note}
  The environment value is normalised to lowercase (see examples above).
  :::

### config show

{command}`config show [options]`

Shows the current status including:

- Defaults supplied 'out of the box' by PDT
- User supplied defaults from user config file
- User supplied values from environment variables

  - From shell
  - From `.env`

#### Options

-s, --source

: Show where each configuration value was assigned.

### config get

{command}`config get [options] PARAM`

**PARAM**

: The configuration parameter to be returned.

  Returns an error if the `PARAM` does not exist.

#### Options

-s, --source

: Show where each configuration value was assigned.

### config set

{command}`config set PARAM VALUE`

**PARAM**

: The configuration parameter to be set. This is a simple dot-separated path within this configuration.

**VALUE**

: The value to be assigned to the `PARAM`.

  Strings containing spaces should be enclosed in quotation marks (single or double).

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

{command}`vtt [init|launch|status|install]`

Controls a Foundry VTT instance.

### vtt init

{command}`vtt init`

### vtt launch

{command}`vtt launch`

### vtt status

{command}`vtt status`

Display the current status of the VTT; one of "running", "stopped", "missing".

### vtt install

{command}`vtt install`

Install a configuration of modules. The specification can be captured using EMMA. Can also enforce a set of settings for the installed modules.

If {command}`vtt install` is used while the VTT is running it will be stopped, the modules installed, any settings installed, then the VTT will be restarted.
