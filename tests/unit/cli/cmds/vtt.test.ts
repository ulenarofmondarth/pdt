import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yargs from 'yargs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createVttCommand } from '@/cli/cmds/vtt.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';
import { createHostMock, type VTTHostMock } from '@tests/unit/mocks/vttHost.js';
import { vttSettings } from '@lib/projectVtt.js';

describe('vtt command', () => {
  let ctx: CommandContextMock;

  beforeEach(() => {
    ctx = createCommandContext();
  });

  /**
   * Run a command line against the vtt command as main() does, resolving with the failure message if
   * there is one. (A .fail() handler would let yargs go on to run the command.)
   */
  function parse(commandLine: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      yargs()
        .command(createVttCommand(ctx))
        .strict()
        .exitProcess(false)
        .parseAsync(commandLine, (err: Error | null) => resolve(err?.message))
        .catch(reject);
    });
  }

  test('requires a sub-command', async () => {
    await expect(parse('vtt')).resolves.toEqual(expect.any(String));
  });

  // Regression: an unknown sub-command was taken as the vtt command's own argument, so it ran the
  // vtt handler, which logged an error, and pdt exited 0.
  test('rejects a sub-command it does not know, naming it', async () => {
    await expect(parse('vtt explode')).resolves.toContain('explode');

    expect(ctx.log.error).not.toHaveBeenCalled();
  });

  describe('sub-commands', () => {
    let sandbox: string;
    let host: VTTHostMock;

    beforeEach(() => {
      sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-vtt-'));
      ctx.paths.pdtConfigDir = path.join(sandbox, '.pdt');
      ctx.paths.userDataDir = path.join(sandbox, 'data');
      ctx.config.VTT['my-module'] = vttSettings('13');
      host = createHostMock();
      ctx.createVtt.mockImplementation((name, settings) => new FoundryVTTServer(name, settings.server, host));
    });

    afterEach(() => {
      fs.rmSync(sandbox, { recursive: true, force: true });
    });

    test('routes start to the start sub-command', async () => {
      await parse('vtt start');

      expect(host.start).toHaveBeenCalledOnce();
      expect(ctx.log.error).not.toHaveBeenCalled();
    });

    test('routes stop to the stop sub-command', async () => {
      await parse('vtt stop');

      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(m['info.vtt.notRunning']({ vtt: 'my-module' }));
    });

    test('routes restart to the restart sub-command', async () => {
      await parse('vtt restart my-module');

      expect(host.start).toHaveBeenCalledOnce();
    });
  });

  test('logs an error if its own handler is ever reached', async () => {
    const argv = { _: ['vtt'], $0: 'pdt' };

    await createVttCommand(ctx).handler(argv);

    expect(ctx.log.error).toHaveBeenCalledExactlyOnceWith(m['fatal.shouldNeverRun']({ argv: JSON.stringify(argv) }));
  });
});
