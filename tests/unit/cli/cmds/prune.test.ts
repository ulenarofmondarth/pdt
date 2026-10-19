import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createPruneCommand } from '@/cli/cmds/prune.js';
import { readRunState, runStateFile, writeRunState } from '@util/run-state.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';

describe('prune command', () => {
  let ctx: CommandContextMock;
  let sandbox: string;
  let file: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-prune-'));
    ctx = createCommandContext();
    ctx.paths.userDataDir = path.join(sandbox, 'data');
    file = runStateFile(ctx.paths.userDataDir);
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  function prune() {
    return createPruneCommand(ctx).handler({ _: ['prune'], $0: 'pdt' });
  }

  test('removes each project that is gone, saying which', async () => {
    const live = path.join(sandbox, 'live');
    fs.mkdirSync(path.join(live, '.pdt'), { recursive: true });
    const gone = path.join(sandbox, 'gone');
    writeRunState(file, { PROJECTS: { live: { root: live }, gone: { root: gone } } });

    await prune();

    expect(readRunState(file)).toEqual({ PROJECTS: { live: { root: live } } });
    expect(ctx.out).toHaveBeenCalledExactlyOnceWith(m['info.prune.removed']({ id: 'gone', root: gone, file }));
  });

  test('says so when there is nothing to prune', async () => {
    await prune();

    expect(ctx.out).toHaveBeenCalledExactlyOnceWith(m['info.prune.nothing']({ file }));
    expect(fs.existsSync(file)).toBe(false);
  });

  test('works outside a project', async () => {
    expect(ctx.paths.pdtConfigDir).toBeUndefined();

    await expect(prune()).resolves.toBeUndefined();
  });

  test('fails, naming the file, when the run state cannot be read', async () => {
    fs.mkdirSync(ctx.paths.userDataDir);
    fs.writeFileSync(file, 'not json');

    await expect(prune()).rejects.toThrow(file);
  });
});
