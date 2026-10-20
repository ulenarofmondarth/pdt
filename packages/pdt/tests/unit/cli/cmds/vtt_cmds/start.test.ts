import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yargs from 'yargs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createVttRestartCommand } from '@/cli/cmds/vtt_cmds/restart.js';
import { createVttStartCommand } from '@/cli/cmds/vtt_cmds/start.js';
import { createVttStopCommand } from '@/cli/cmds/vtt_cmds/stop.js';
import { vttSettings } from '@lib/projectVtt.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';
import { createHostMock, type VTTHostMock } from '@tests/unit/mocks/vttHost.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '@/cli/context.js';
import type { VttArgs } from '@/cli/cmds/vtt_cmds/start.js';

describe.each([
  ['start', createVttStartCommand],
  ['stop', createVttStopCommand],
  ['restart', createVttRestartCommand],
] as const)('vtt %s command', (name, create: (context: CommandContext) => CommandModule<object, VttArgs>) => {
  let ctx: CommandContextMock;
  let sandbox: string;
  let host: VTTHostMock;

  beforeEach(() => {
    ctx = createCommandContext();
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-vtt-command-'));
    ctx.paths.pdtConfigDir = path.join(sandbox, '.pdt');
    ctx.paths.userDataDir = path.join(sandbox, 'data');
    ctx.config.VTT['my-module'] = vttSettings('13');
    host = createHostMock();
    ctx.createVtt.mockImplementation((vtt, settings) => new FoundryVTTServer(vtt, settings.server, host));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  /** Parse a command line against the command's own builder, without running its handler. */
  function parse(commandLine: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      yargs()
        .strict()
        .command({ ...create(ctx), handler: argv => resolve(argv) })
        .fail((message: string) => reject(new Error(message)))
        .parse(commandLine);
    });
  }

  test('leaves the VTT to choose when none is given', async () => {
    await expect(parse(name)).resolves.not.toHaveProperty('vtt');
  });

  test('takes the VTT it is given', async () => {
    await expect(parse(`${name} staging`)).resolves.toMatchObject({ vtt: 'staging' });
  });

  test('takes no more than one VTT', async () => {
    await expect(parse(`${name} staging other`)).rejects.toThrow('other');
  });

  test('logs the parsed command at debug level', async () => {
    const argv = { _: ['vtt', name], $0: 'pdt', vtt: 'my-module' };

    await create(ctx).handler(argv);

    expect(ctx.log.debug).toHaveBeenCalledExactlyOnceWith(m['debug.running']({ argv: JSON.stringify(argv) }));
  });

  test('works on the VTT it is given', async () => {
    ctx.config.VTT['staging'] = vttSettings('14');

    await create(ctx).handler({ _: ['vtt', name], $0: 'pdt', vtt: 'staging' });

    expect(ctx.createVtt).toHaveBeenCalledExactlyOnceWith('staging', ctx.config.VTT['staging'], undefined);
  });
});
