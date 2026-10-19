import { describe, expect, test } from 'vitest';
import { createParser } from '@/cli/parsers.js';
import { pdtCommands } from '@/cli/commands.js';
import { createCommandContext } from '@tests/unit/mocks/context.js';

type ParseResult = { err: Error | null; output: string };

/** Parse a command line, capturing what yargs would have printed. */
function parse(commandLine: string): Promise<ParseResult> {
  return new Promise(resolve => {
    createParser(pdtCommands(createCommandContext())).parse(
      commandLine,
      (err: Error | null, _argv: unknown, output: string) => resolve({ err, output }),
    );
  });
}

describe('command line parser', () => {
  test('requires a top level command', async () => {
    const { err } = await parse('');

    expect(err?.message).toBe('At least one top level command is required.');
  });

  test('rejects a command it does not know', async () => {
    const { err } = await parse('no-such-command');

    expect(err?.message).toContain('no-such-command');
  });

  test('rejects an option it does not know', async () => {
    const { err } = await parse('status --bogus');

    expect(err?.message).toContain('bogus');
  });

  test.each(['init', 'status', 'vtt', 'config'])('offers the %s command in its help', async command => {
    const { err, output } = await parse('--help');

    expect(err).toBeFalsy();
    expect(output).toMatch(new RegExp(`^\\s+\\S+ ${command}\\b`, 'm'));
  });

  test('offers --config, to override a setting, in its help', async () => {
    const { output } = await parse('--help');

    expect(output).toContain('--config');
  });

  test.each([
    ['before the command', '--config Logging.level=debug status'],
    ['after the command', 'status --config Logging.level=debug'],
    ['more than once', 'status --config Logging.level=debug --config=Logging.filename=x.log'],
  ])('accepts --config %s', async (_case, commandLine) => {
    const { err } = await parse(commandLine);

    expect(err).toBeFalsy();
  });

  test('requires a value for --config', async () => {
    const { err } = await parse('status --config');

    expect(err?.message).toContain('config');
  });

  // Regression guard: the parser was built once, from the process's arguments, when its module loaded.
  test('is a new parser each time', () => {
    // Compared directly: a matcher would read the parser's argv property, which parses process.argv.
    expect(createParser([]) === createParser([])).toBe(false);
  });
});
