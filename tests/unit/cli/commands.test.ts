import { describe, expect, test } from 'vitest';
import { pdtCommands } from '@/cli/commands.js';
import { createCommandContext } from '@tests/unit/mocks/context.js';

describe('pdtCommands', () => {
  const commands = pdtCommands(createCommandContext());

  test('are vtt, init, info, config, force-reset, prune and move', () => {
    expect(commands.map(command => String(command.command).split(' ')[0])).toEqual([
      'vtt',
      'init',
      'info',
      'config',
      'force-reset',
      'prune',
      'move',
    ]);
  });

  test.each(commands.map(command => [command.command, command] as const))(
    '%s is a complete yargs command',
    (_name, command) => {
      expect(command).toMatchObject({
        command: expect.any(String),
        describe: expect.any(String),
        handler: expect.any(Function),
      });
    },
  );

  test('are new for each context', () => {
    expect(pdtCommands(createCommandContext())[0] === commands[0]).toBe(false);
  });
});
