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
| `--help` | Shows the help for {{pdt}}, or for the command it follows |
| `--version` | Shows the version of {{pdt}} |

## Output

Standard output carries what you asked for: the help, the version, or a command's results. Messages about what {{pdt}} is doing, warnings and errors go to standard error, and to the log file (see {doc}`configuration`).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | The command succeeded, or the help or version was shown. |
| 1 | The command failed; the error is reported on the console and in the log file. |
| 2 | The command line could not be run: no command, an unknown command or option, or a combination of arguments the command does not accept. The problem, and for most problems the usage, is written to standard error. |
| 127 | The configuration is invalid (see {doc}`configuration`). |
