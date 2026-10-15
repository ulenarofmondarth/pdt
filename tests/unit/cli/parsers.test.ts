import { describe, expect, test, vi } from 'vitest';
import { parser } from '@/cli/parsers.js';

// Parsing must not write log files.
vi.mock('@util/logger.js', async () => (await import('@tests/unit/mocks/logger.js')).createLoggerModuleMock());

type ParseResult = { err: Error | null; output: string };

/** Parse a command line, capturing what yargs would have printed. */
function parse(commandLine: string): Promise<ParseResult> {
  return new Promise(resolve => {
    parser.parse(commandLine, (err: Error | null, _argv: unknown, output: string) => resolve({ err, output }));
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
    const { err } = await parse('info --bogus');

    expect(err?.message).toContain('bogus');
  });

  test.each(['init', 'info', 'vtt'])('offers the %s command in its help', async command => {
    const { err, output } = await parse('--help');

    expect(err).toBeFalsy();
    expect(output).toMatch(new RegExp(`^\\s+\\S+ ${command}\\b`, 'm'));
  });
});
