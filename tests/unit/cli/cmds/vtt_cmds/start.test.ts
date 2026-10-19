import yargs from 'yargs';
import { beforeEach, describe, expect, test } from 'vitest';
import { createVttStartCommand } from '@/cli/cmds/vtt_cmds/start.js';
import { UsageError } from '@/cli/usage-error.js';
import { vttSettings } from '@lib/projectVtt.js';
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

  test('leaves the VTT to the handler when none is given', async () => {
    await expect(parse('start')).resolves.not.toHaveProperty('vtt');
  });

  test('targets the VTT it is given', async () => {
    await expect(parse('start staging')).resolves.toMatchObject({ vtt: 'staging' });
  });

  describe('starting', () => {
    let host: VTTHostMock;

    beforeEach(() => {
      ctx.config.VTT['my-module'] = vttSettings('13');
      host = createHostMock();
      ctx.createVtt.mockImplementation((name, settings) => new FoundryVTTServer(name, settings.server, host));
    });

    /** Run the command for `vtt`, or for no VTT in particular. */
    function start(vtt?: string) {
      return createVttStartCommand(ctx).handler({ _: ['vtt', 'start'], $0: 'pdt', vtt });
    }

    test('logs the parsed command at debug level', async () => {
      const argv = { _: ['vtt', 'start'], $0: 'pdt', vtt: 'my-module' };

      await createVttStartCommand(ctx).handler(argv);

      expect(ctx.log.debug).toHaveBeenCalledExactlyOnceWith(m['debug.running']({ argv: JSON.stringify(argv) }));
    });

    test('starts the VTT on its host, from its configured settings', async () => {
      await start('my-module');

      expect(ctx.createVtt).toHaveBeenCalledExactlyOnceWith('my-module', ctx.config.VTT['my-module']);
      expect(host.start).toHaveBeenCalledExactlyOnceWith(ctx.createVtt.mock.results[0]!.value);
    });

    test('says what it is starting, and when it is running', async () => {
      await start();

      expect(ctx.out.mock.calls).toEqual([
        [m['info.vtt.starting']({ vtt: 'my-module', version: '13' })],
        [m['info.vtt.started']({ vtt: 'my-module' })],
      ]);
    });

    test('starts the only VTT when none is given', async () => {
      await start();

      expect(ctx.createVtt).toHaveBeenCalledExactlyOnceWith('my-module', ctx.config.VTT['my-module']);
      expect(host.start).toHaveBeenCalledOnce();
    });

    test('starts any configured VTT', async () => {
      const staging = vttSettings('14');
      ctx.config.VTT['staging'] = staging;

      await start('staging');

      expect(ctx.createVtt).toHaveBeenCalledExactlyOnceWith('staging', staging);
      expect(host.start).toHaveBeenCalledOnce();
    });

    test('leaves a VTT that is already running alone, saying so', async () => {
      host.isRunning.mockResolvedValue(true);

      await start();

      expect(host.start).not.toHaveBeenCalled();
      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(m['info.vtt.alreadyRunning']({ vtt: 'my-module' }));
    });

    test('fails, naming the VTTs there are, when the VTT is not configured', async () => {
      await expect(start('nosuch')).rejects.toThrow(m['error.vtt.unknownVtt']({ vtt: 'nosuch', known: 'my-module' }));

      expect(ctx.createVtt).not.toHaveBeenCalled();
    });

    test('refuses to choose between several VTTs when none is given, naming them', async () => {
      ctx.config.VTT['staging'] = vttSettings('14');

      await expect(start()).rejects.toEqual(
        new UsageError(m['error.vtt.nameRequired']({ known: 'my-module, staging' })),
      );

      expect(ctx.createVtt).not.toHaveBeenCalled();
    });

    test.each([undefined, 'my-module'])('fails, starting nothing, when no VTT is configured (given %s)', async vtt => {
      ctx.config.VTT = {};

      await expect(start(vtt)).rejects.toThrow(m['error.vtt.noneConfigured']());

      expect(ctx.createVtt).not.toHaveBeenCalled();
    });

    test('fails, starting nothing, when the host cannot be reached', async () => {
      host.isAccessible.mockResolvedValue(false);

      await expect(start()).rejects.toThrow(m['error.vtt.hostUnreachable']({ vtt: 'my-module', type: 'docker' }));

      expect(host.start).not.toHaveBeenCalled();
      expect(ctx.out).not.toHaveBeenCalled();
    });

    test('fails with the reason the host gives when the VTT cannot be started', async () => {
      host.start.mockRejectedValue(new Error('no room at the inn'));

      await expect(start()).rejects.toThrow('no room at the inn');

      expect(ctx.out).not.toHaveBeenCalledWith(m['info.vtt.started']({ vtt: 'my-module' }));
    });
  });
});
