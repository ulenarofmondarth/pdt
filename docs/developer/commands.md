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
| `log` | `error`, `warn`, `info`, `debug`, and `setDirectory` to move the log file |
| `out` | Writes what the user asked for, or the progress of it, to standard output |
| `prompter` | Asks the user questions; absent when nobody can be asked (no terminal) |
| `createModule` | Creates a new Foundry VTT module project |

A command takes everything from its context: no imports of the logger, `process`, `console` or the file locations. Log messages go to standard error; `out` is for results.

## Arguments

Declare a command's arguments in its builder, and type its handler by them, with `CommandModule<object, Args>`:

```typescript
interface StartArgs {
  vtt: string;
}

export function createVttStartCommand({ log }: CommandContext): CommandModule<object, StartArgs> {
  return {
    command: 'start [vtt] [options]',
    describe: m['ui.cmd.start.description'](),
    builder: yargs => yargs.positional('vtt', { describe: '...', type: 'string', default: 'prj' }),
    handler(argv) {
      // argv.vtt is a string
    },
  };
}
```

To put such a command in a list of commands, pass it through `anyCommand()` (`src/cli/command.ts`), which widens it to the untyped command a list holds.

## Testing a command

`createCommandContext()` in `tests/unit/mocks/context.ts` gives a context of spies, with the shipped default configuration and paths outside any project. Change what the test needs, make the command, and call its handler:

```typescript
const ctx = createCommandContext();
ctx.paths.pdtConfigDir = '/some/project/.pdt';

await createWhereCommand(ctx).handler({ _: ['where'], $0: 'pdt' });

expect(ctx.out).toHaveBeenCalledExactlyOnceWith('/some/project/.pdt');
```

To check arguments, parse a command line against the command's builder, with a handler that captures what was parsed (see `tests/unit/cli/cmds/init.test.ts`). Behaviour a user relies on also gets a test of the built command line, in `tests/cli` (see {doc}`testing`).
