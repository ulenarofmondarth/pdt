import { beforeEach, describe, expect, test } from 'vitest';
import { createInfoCommand } from '@/cli/cmds/info.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';

describe('info command', () => {
  let ctx: CommandContextMock;

  beforeEach(() => {
    ctx = createCommandContext();
  });

  function runInfo() {
    return createInfoCommand(ctx).handler({ _: ['info'], $0: 'pdt' });
  }

  test('reports an error when run outside a project', async () => {
    await runInfo();

    expect(ctx.log.error).toHaveBeenCalledExactlyOnceWith(m['error.notInPdtProject']());
    expect(ctx.out).not.toHaveBeenCalled();
  });

  test('prints something, without an error, when run inside a project', async () => {
    ctx.paths.pdtConfigDir = '/some/project/.pdt';

    await runInfo();

    expect(ctx.log.error).not.toHaveBeenCalled();
    expect(ctx.out).toHaveBeenCalled();
  });

  test.todo('prints the runtime configuration of the project');
});
