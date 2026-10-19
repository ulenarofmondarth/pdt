import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yargs from 'yargs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createStatusCommand } from '@/cli/cmds/status.js';
import { vttSettings } from '@lib/projectVtt.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import { ConfigError } from '@util/load-config.js';
import { runStateFile, writeRunState, type RunningVtt } from '@util/run-state.js';
import { config as configSchema } from '@schema/config.js';
import defaults from '@/pdt-internal-config/default.json' with { type: 'json' };
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';
import { createHostMock, type VTTHostMock } from '@tests/unit/mocks/vttHost.js';

describe('status command', () => {
  let ctx: CommandContextMock;
  let sandbox: string;
  let host: VTTHostMock;

  const running = (name: string, port = 30000): RunningVtt => ({
    id: `${name}-id`,
    name: `pdt-${name}`,
    port,
    url: `http://localhost:${port}`,
    started: 'now',
  });

  beforeEach(() => {
    ctx = createCommandContext();
    sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-status-')));
    ctx.paths.userDataDir = path.join(sandbox, 'data');
    host = createHostMock();
    ctx.createVtt.mockImplementation((name, settings) => new FoundryVTTServer(name, settings.server, host));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  function status() {
    return createStatusCommand(ctx).handler({ _: ['status'], $0: 'pdt' });
  }

  /** A pdt project in the sandbox, with its run state recording `recorded`. */
  function makeProject(name: string, recorded: Record<string, RunningVtt> = {}): string {
    const root = path.join(sandbox, name);
    fs.mkdirSync(path.join(root, '.pdt'), { recursive: true });
    writeRunState(runStateFile(path.join(root, '.pdt')), { VTT: recorded });
    return root;
  }

  const lines = () => ctx.out.mock.calls.map(([line]) => line);

  describe('in a project', () => {
    let root: string;

    beforeEach(() => {
      root = makeProject('my-module', { 'my-module': running('my-module') });
      ctx.paths.pdtConfigDir = path.join(root, '.pdt');
      ctx.config.id = 'my-module';
      ctx.config.VTT = { 'my-module': vttSettings('14'), staging: vttSettings('13') };
    });

    test('lists its VTTs, running and stopped', async () => {
      host.isRunning.mockResolvedValue(true);

      await status();

      expect(lines()).toEqual([
        m['info.status.project']({ project: 'my-module', root }),
        `  ${m['info.status.running']({ vtt: 'my-module', url: 'http://localhost:30000', container: 'pdt-my-module' })}`,
        `  ${m['info.status.stopped']({ vtt: 'staging' })}`,
      ]);
      expect(host.isRunning).toHaveBeenCalledExactlyOnceWith(running('my-module'));
    });

    test('shows a VTT that has stopped since it was started as stopped', async () => {
      await status();

      expect(lines()[1]).toBe(`  ${m['info.status.stopped']({ vtt: 'my-module' })}`);
    });

    test("shows a recorded VTT's state as unknown when its host cannot be reached", async () => {
      host.isAccessible.mockResolvedValue(false);

      await status();

      expect(lines()[1]).toBe(
        `  ${m['info.status.unknown']({ vtt: 'my-module', reason: m['error.vtt.hostUnreachable']({ vtt: 'my-module', type: 'docker' }) })}`,
      );
      expect(lines()[2]).toBe(`  ${m['info.status.stopped']({ vtt: 'staging' })}`);
    });

    test('lists a VTT recorded as started that is no longer configured, naming its container', async () => {
      ctx.config.VTT = {};

      await status();

      expect(lines()).toEqual([
        m['info.status.project']({ project: 'my-module', root }),
        `  ${m['info.status.unknown']({ vtt: 'my-module', reason: m['info.status.notConfigured']({ container: 'pdt-my-module' }) })}`,
      ]);
    });

    test('says when the project has no VTT', async () => {
      ctx.config.VTT = {};
      writeRunState(runStateFile(ctx.paths.pdtConfigDir!), {});

      await status();

      expect(lines()).toEqual([
        m['info.status.project']({ project: 'my-module', root }),
        `  ${m['info.status.noVtts']()}`,
      ]);
    });

    test('names the project by its directory when it has no id', async () => {
      delete ctx.config.id;

      await status();

      expect(lines()[0]).toBe(m['info.status.project']({ project: 'my-module', root }));
    });

    test('reports only this project', async () => {
      writeRunState(runStateFile(ctx.paths.userDataDir), { PROJECTS: { other: { root: makeProject('other') } } });

      await status();

      expect(ctx.projectConfig).not.toHaveBeenCalled();
      expect(lines().filter(line => !line.startsWith('  '))).toHaveLength(1);
    });
  });

  describe('outside a project', () => {
    test('lists the VTTs of every registered project, each read with its own configuration', async () => {
      const first = makeProject('first', { first: running('first') });
      const second = makeProject('second');
      writeRunState(runStateFile(ctx.paths.userDataDir), {
        PROJECTS: { first: { root: first }, second: { root: second } },
      });
      ctx.projectConfig.mockImplementation(pdtConfigDir => ({
        ...configSchema.parse(defaults),
        VTT: { [path.basename(path.dirname(pdtConfigDir))]: vttSettings('14') },
      }));
      host.isRunning.mockResolvedValue(true);

      await status();

      expect(ctx.projectConfig.mock.calls).toEqual([[path.join(first, '.pdt')], [path.join(second, '.pdt')]]);
      expect(lines()).toEqual([
        m['info.status.project']({ project: 'first', root: first }),
        `  ${m['info.status.running']({ vtt: 'first', url: 'http://localhost:30000', container: 'pdt-first' })}`,
        m['info.status.project']({ project: 'second', root: second }),
        `  ${m['info.status.stopped']({ vtt: 'second' })}`,
      ]);
    });

    test('says a registered project that has gone is gone, and carries on', async () => {
      const gone = path.join(sandbox, 'gone');
      const there = makeProject('there');
      writeRunState(runStateFile(ctx.paths.userDataDir), {
        PROJECTS: { gone: { root: gone }, there: { root: there } },
      });

      await status();

      expect(lines()[0]).toBe(m['info.status.missing']({ project: 'gone', root: gone }));
      expect(lines()[1]).toBe(m['info.status.project']({ project: 'there', root: there }));
    });

    test('says why a project cannot be read, and carries on', async () => {
      const broken = makeProject('broken');
      const there = makeProject('there');
      writeRunState(runStateFile(ctx.paths.userDataDir), {
        PROJECTS: { broken: { root: broken }, there: { root: there } },
      });
      ctx.projectConfig.mockImplementationOnce(() => {
        throw new ConfigError(m['error.config.invalid'](), ['VTT.x.server.port Invalid input']);
      });

      await status();

      expect(lines()[0]).toBe(
        m['info.status.unusable']({
          project: 'broken',
          root: broken,
          reason: `${m['error.config.invalid']()} VTT.x.server.port Invalid input`,
        }),
      );
      expect(lines()[1]).toBe(m['info.status.project']({ project: 'there', root: there }));
    });

    test('says why a project whose run state cannot be read cannot be, and carries on', async () => {
      const broken = makeProject('broken');
      fs.writeFileSync(runStateFile(path.join(broken, '.pdt')), 'not json');
      writeRunState(runStateFile(ctx.paths.userDataDir), { PROJECTS: { broken: { root: broken } } });

      await status();

      expect(lines()).toEqual([
        expect.stringContaining(m['info.status.unusable']({ project: 'broken', root: broken, reason: '' })),
      ]);
    });

    test('says when no project is registered', async () => {
      await status();

      expect(lines()).toEqual([m['info.status.noProjects']({ file: runStateFile(ctx.paths.userDataDir) })]);
    });
  });

  test('takes no arguments', async () => {
    const parse = (commandLine: string) =>
      new Promise((resolve, reject) => {
        yargs()
          .strict()
          .command({ ...createStatusCommand(ctx), handler: argv => resolve(argv) })
          .fail((message: string) => reject(new Error(message)))
          .parse(commandLine);
      });

    await expect(parse('status')).resolves.toBeDefined();
    await expect(parse('status somewhere')).rejects.toThrow('somewhere');
  });
});
