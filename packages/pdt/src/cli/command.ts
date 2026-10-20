import type { CommandModule } from 'yargs';

/**
 * A command whose arguments are typed, as one of a list of commands.
 *
 * Each command's builder declares its arguments, and its handler is typed by them. A list of commands
 * holds commands with different arguments, which TypeScript cannot express without widening each to
 * yargs' untyped command. yargs only calls a handler with what its own builder parsed, so widening is
 * safe.
 *
 * @param command - A command with typed arguments
 */
export function anyCommand<U>(command: CommandModule<object, U>): CommandModule {
  return command as CommandModule;
}
