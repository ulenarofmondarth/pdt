import { describe, expect, test, vi } from 'vitest';
import * as pdtCmds from '@/cli/pdtCmds.js';
import * as vttCmds from '@/cli/cmds/vtt_cmds.js';

vi.mock('@util/logger.js', async () => (await import('@tests/unit/mocks/logger.js')).createLoggerModuleMock());

describe('command registries', () => {
  test('top level commands are init, info and vtt', () => {
    expect(Object.keys(pdtCmds).sort()).toEqual(['pdtInfo', 'pdtInit', 'pdtVtt']);
  });

  test('vtt sub-commands are start', () => {
    expect(Object.keys(vttCmds)).toEqual(['vttStart']);
  });

  test.each(Object.entries({ ...pdtCmds, ...vttCmds }))('%s is a complete yargs command', (_name, command) => {
    expect(command).toMatchObject({
      command: expect.any(String),
      describe: expect.any(String),
      builder: expect.any(Function),
      handler: expect.any(Function),
    });
  });
});
