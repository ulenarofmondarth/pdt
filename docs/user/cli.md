# PDT Command Line Interface

```{toctree}
:caption: 'Content:'
:maxdepth: 2

top_level_commands
```

The main interface of the PDT is the command line.

The {ref}`pdt_tlc` access the main functions of the PDT. These may be further refined by secondary commands or options. Details can be found in the command reference.

## Global options

These options can be given with any command:

| Option | What it does |
| --- | --- |
| `--config <key>=<value>` | Overrides a setting for this run only; give it once for each setting (see {doc}`configuration`) |
| `--project <id or path>` | Runs the command as if in that project (below) |
| `--help` | Shows the help for {{pdt}}, or for the command it follows |
| `--version` | Shows the version of {{pdt}} |

(pdt_cli_project)=

## Working on another project

`--project` runs any command as if you had changed to a project's root directory first:

```shell
pdt --project arcane-ledger vtt start
pdt config get VTT --project ~/work/arcane-ledger
```

The value is looked up as a project id in your user run state (see {ref}`pdt_tlc_init_id`). If no project is registered with that id, it is taken as the path to the project's root directory, relative to the current directory. As a project id can't contain a dot, write a path in the current directory that has the same name as a project id as `./name`.

The project's `.pdt/config.json` is read in place of any project you are in. Relative paths given to the command, such as `init`'s directory or `move`'s destination, are then taken from the project's root.

Give `--project` at most once; given more than once, {{pdt}} runs nothing and stops with exit code 2.

If the directory doesn't exist, is not a directory, or has no `.pdt` directory, {{pdt}} runs nothing and stops with exit code 2. If the project was registered by id and has since moved, run {ref}`pdt_tlc_move` in it or {ref}`pdt_tlc_prune`.

## Output

Standard output carries what you asked for: the help, the version, or a command's results. Messages about what {{pdt}} is doing, warnings and errors go to standard error, and to the log file (see {doc}`configuration`).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | The command succeeded, or the help or version was shown. |
| 1 | The command failed; the error is reported on the console and in the log file. |
| 2 | The command line could not be run: no command, an unknown command or option, or a combination of arguments the command does not accept. The problem, and for most problems the usage, is written to standard error. |
| 127 | The configuration is invalid (see {doc}`configuration`). |
