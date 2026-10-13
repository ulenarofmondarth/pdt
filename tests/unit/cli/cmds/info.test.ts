import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import infoCommand from '@/cli/cmds/info.js';
import logger from '@util/logger.js';
import { m } from '@i18n/messages.js';

const mocks = vi.hoisted(() => ({
  pfs: { userDataDir: '/unused', pdtConfigDir: undefined as string | undefined },
}));

vi.mock('@util/runtime-config.js', () => ({ pfs: mocks.pfs }));
vi.mock('@util/logger.js', async () => (await import('@tests/unit/mocks/logger.js')).createLoggerModuleMock());

function runInfo() {
  return infoCommand.handler({ _: ['info'], $0: 'pdt' });
}

describe('info command', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  test('reports an error when run outside a project', async () => {
    mocks.pfs.pdtConfigDir = undefined;

    await runInfo();

    expect(logger.error).toHaveBeenCalledExactlyOnceWith(m['error.notInPdtProject']());
    expect(console.log).not.toHaveBeenCalled();
  });

  test('prints something, without an error, when run inside a project', async () => {
    mocks.pfs.pdtConfigDir = '/some/project/.pdt';

    await runInfo();

    expect(logger.error).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();
  });

  test.todo('prints the runtime configuration of the project');
});
