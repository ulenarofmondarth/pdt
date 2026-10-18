# PDT Command Line Interface

```{toctree}
:caption: 'Content:'
:maxdepth: 2

top_level_commands
```

The main interface of the PDT is the command line.

The {ref}`pdt_tlc` access the main functions of the PDT. These may be further refined by secondary commands or options. Details can be found in the command reference.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | The command succeeded, or the help or version was shown. |
| 1 | The command failed; the error is reported on the console and in the log file. |
| 2 | The command line could not be run: no command, or an unknown command or option. The problem and the usage are written to standard error. |
| 127 | The configuration is invalid (see {doc}`configuration`). |
