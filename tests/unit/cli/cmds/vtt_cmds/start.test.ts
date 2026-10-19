import yargs from 'yargs';
import { beforeEach, describe, expect, test } from 'vitest';
import { createVttStartCommand } from '@/cli/cmds/vtt_cmds/start.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';
import { createHostMock, type VTTHostMock } from '@tests/unit/mocks/vttHost.js';

describe('vtt start command', () => {
  let ctx: CommandContextMock;

  beforeEach(() => {
    ctx = createCommandContext();
  });

  /** Parse a command line against the command's own builder, without running its handler. */
  function parse(commandLine: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      yargs()
        .command({ ...createVttStartCommand(ctx), handler: argv => resolve(argv) })
        .fail((message: string) => reject(new Error(message)))
        .parse(commandLine);
    });
  }

  test('targets the project VTT by default', async () => {
    await expect(parse('start')).resolves.toMatchObject({ vtt: 'prj' });
  });

  test('targets the VTT it is given', async () => {
    await expect(parse('start staging')).resolves.toMatchObject({ vtt: 'staging' });
  });

  describe('starting', () => {
    let host: VTTHostMock;

    beforeEach(() => {
      host = createHostMock();
      ctx.createVtt.mockImplementation((name, settings) => new FoundryVTTServer(name, settings.server, host));
    });

    /** Run the command for `vtt`. */
    function start(vtt = 'prj') {
      return createVttStartCommand(ctx).handler({ _: ['vtt', 'start'], $0: 'pdt', vtt });
    }

    test('logs the parsed command at debug level', async () => {
      const argv = { _: ['vtt', 'start'], $0: 'pdt', vtt: 'prj' };

      await createVttStartCommand(ctx).handler(argv);

      expect(ctx.log.debug).toHaveBeenCalledExactlyOnceWith(m['debug.running']({ argv: JSON.stringify(argv) }));
    });

    test('starts the VTT on its host, from its configured settings', async () => {
      await start();

      expect(ctx.createVtt).toHaveBeenCalledExactlyOnceWith('prj', ctx.config.VTT['prj']);
      expect(host.start).toHaveBeenCalledExactlyOnceWith(ctx.createVtt.mock.results[0]!.value);
    });

    test('says what it is starting, and when it is running', async () => {
      await start();

      expect(ctx.out.mock.calls).toEqual([
        [m['info.vtt.starting']({ vtt: 'prj', version: '12' })],
        [m['info.vtt.started']({ vtt: 'prj' })],
      ]);
    });

    test('starts any configured VTT', async () => {
      const staging = ctx.config.VTT['prj']!;
      ctx.config.VTT['staging'] = staging;

      await start('staging');

      expect(ctx.createVtt).toHaveBeenCalledExactlyOnceWith('staging', staging);
      expect(host.start).toHaveBeenCalledOnce();
    });

    test('leaves a VTT that is already running alone, saying so', async () => {
      host.isRunning.mockResolvedValue(true);

      await start();

      expect(host.start).not.toHaveBeenCalled();
      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(m['info.vtt.alreadyRunning']({ vtt: 'prj' }));
    });

    test('fails, naming the VTTs there are, when the VTT is not configured', async () => {
      await expect(start('nosuch')).rejects.toThrow(m['error.vtt.unknownVtt']({ vtt: 'nosuch', known: 'prj' }));

      expect(ctx.createVtt).not.toHaveBeenCalled();
    });

    test('fails, starting nothing, when the host cannot be reached', async () => {
      host.isAccessible.mockResolvedValue(false);

      await expect(start()).rejects.toThrow(m['error.vtt.hostUnreachable']({ vtt: 'prj', type: 'docker' }));

      expect(host.start).not.toHaveBeenCalled();
      expect(ctx.out).not.toHaveBeenCalled();
    });

    test('fails with the reason the host gives when the VTT cannot be started', async () => {
      host.start.mockRejectedValue(new Error('no room at the inn'));

      await expect(start()).rejects.toThrow('no room at the inn');

      expect(ctx.out).not.toHaveBeenCalledWith(m['info.vtt.started']({ vtt: 'prj' }));
    });
  });
});
