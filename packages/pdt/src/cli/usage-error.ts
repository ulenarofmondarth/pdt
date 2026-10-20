/**
 * A command line that a command cannot run, found by the command itself; pdt exits with the usage
 * code, as for one yargs rejects.
 *
 * Commands throw this instead of checking their arguments with yargs' `.check()`: a failed check is
 * reported, but yargs still runs the handler.
 */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}
