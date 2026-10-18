# PDT Command Line Interface

```{toctree}
:caption: 'Content:'
:maxdepth: 2

top_level_commands
```

The main interface of the PDT is the command line.

The {ref}`pdt_tlc` access the main functions of the PDT. These may be further refined by secondary commands or options. Details can be found in the command reference.

## Output

Standard output carries what you asked for: the help, the version, or a command's results. Messages about what {{pdt}} is doing, warnings and errors go to standard error, and to the log file (see {doc}`configuration`).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | The command succeeded, or the help or version was shown. |
| 1 | The command failed; the error is reported on the console and in the log file. |
| 2 | The command line could not be run: no command, or an unknown command or option. The problem and the usage are written to standard error. |
| 127 | The configuration is invalid (see {doc}`configuration`). |
