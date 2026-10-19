# Commands

Each command is a [yargs](https://yargs.js.org) command module, made by a function that is given what the command works with. For example, a command that reports where the project's data is:

```typescript
export function createWhereCommand({ paths, log, out }: CommandContext): CommandModule {
  return {
    command: 'where',
    describe: m['ui.cmd.where.description'](),
    handler() {
      if (paths.pdtConfigDir === undefined) log.error(m['error.notInPdtProject']());
      else out(paths.pdtConfigDir);
    },
  };
}
```

`pdtCommands(context)` in `src/cli/commands.ts` lists the top level commands, and `main()` builds the `CommandContext` for each run (see `src/cli/context.ts`):

| Member | What it is |
| --- | --- |
| `paths` | The directories pdt uses: user configuration, user data, and the project's `.pdt` directory, if any |
| `config` | The validated configuration, typed by the schema |
| `sourceOf` | Where the value at a key of the configuration comes from: `default`, `user`, `project`, `environment` or `cli` |
| `writeConfig` | Sets a value in the user or the project configuration file, after checking the whole configuration with it |
| `configFiles` | The configuration files pdt reads, the user's first, each with its source; a file need not exist |
| `filesSetting` | The configuration files that set a value at a key |
| `clearConfig` | Removes the value at a key from configuration files, after checking the whole configuration without it |
| `log` | `error`, `warn`, `info`, `debug`, and `setDirectory` to move the log file |
| `out` | Writes what the user asked for, or the progress of it, to standard output |
| `prompter` | Asks the user questions; absent when nobody can be asked (no terminal) |
| `createModule` | Creates a new Foundry VTT module project |
| `createVtt` | Creates a VTT (its server, on its host) from its settings in the configuration and the Foundry VTT account |
| `isPortFree` | Whether a port on this machine is free |
| `isUrlReachable` | Whether anything answers at a URL |
| `owner` | The uid and gid pdt runs as, where there are such; absent on Windows |

A command takes everything from its context: no imports of the logger, `process`, `console` or the file locations. Log messages go to standard error; `out` is for results.

## Arguments

Declare a command's arguments in its builder, and type its handler by them, with `CommandModule<object, Args>`:

```typescript
interface StartArgs {
  vtt: string | undefined;
}

export function createVttStartCommand({ log }: CommandContext): CommandModule<object, StartArgs> {
  return {
    command: 'start [vtt] [options]',
    describe: m['ui.cmd.start.description'](),
    builder: yargs => yargs.positional('vtt', { describe: '...', type: 'string' }),
    handler(argv) {
      // argv.vtt is a string, or undefined when it was not given
    },
  };
}
```

To put such a command in a list of commands, pass it through `anyCommand()` (`src/cli/command.ts`), which widens it to the untyped command a list holds.

### Checking arguments

Let yargs check what it can: required positionals, `choices`, `requiresArg`. A rule of the command's own, such as "a key or `--list-all`", is checked in the handler, which throws a `UsageError` (`src/cli/usage-error.ts`); `main()` writes its message to standard error and exits with the usage code, 2.

:::{warning}
Do not use yargs' `.check()`. `main()` parses with a callback, and in that mode yargs reports a failed check but still runs the handler.
:::

## Testing a command

`createCommandContext()` in `tests/unit/mocks/context.ts` gives a context of spies, with the shipped default configuration and paths outside any project. Change what the test needs, make the command, and call its handler:

```typescript
const ctx = createCommandContext();
ctx.paths.pdtConfigDir = '/some/project/.pdt';

await createWhereCommand(ctx).handler({ _: ['where'], $0: 'pdt' });

expect(ctx.out).toHaveBeenCalledExactlyOnceWith('/some/project/.pdt');
```

To check arguments, parse a command line against the command's builder, with a handler that captures what was parsed (see `tests/unit/cli/cmds/init.test.ts`). Behaviour a user relies on also gets a test of the built command line, in `tests/cli` (see {doc}`testing`).
