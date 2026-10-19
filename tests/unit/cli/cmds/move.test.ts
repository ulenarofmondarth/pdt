import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yargs from 'yargs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMoveCommand, relocate } from '@/cli/cmds/move.js';
import { UsageError } from '@/cli/usage-error.js';
import { readRunState, runStateFile, writeRunState } from '@util/run-state.js';
import { vttSettings } from '@lib/projectVtt.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';
import { createHostMock, type VTTHostMock } from '@tests/unit/mocks/vttHost.js';

describe('move command', () => {
  let ctx: CommandContextMock;
  let sandbox: string;
  let project: string;
  let file: string;

  beforeEach(() => {
    sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-move-')));
    project = path.join(sandbox, 'project');
    fs.mkdirSync(path.join(project, '.pdt'), { recursive: true });
    fs.mkdirSync(path.join(project, 'src', 'module'), { recursive: true });
    fs.writeFileSync(path.join(project, '.pdt', 'config.json'), '{"id":"my-module"}');
    fs.writeFileSync(path.join(project, 'src', 'module', 'main.ts'), 'export {};\n');

    ctx = createCommandContext();
    ctx.paths.cwd = sandbox;
    ctx.paths.pdtConfigDir = path.join(project, '.pdt');
    ctx.paths.userDataDir = path.join(sandbox, 'data');
    ctx.config.id = 'my-module';
    ctx.sourceOf.mockImplementation(key => (key[0] === 'id' ? 'project' : 'default'));
    file = runStateFile(ctx.paths.userDataDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  function move(destination?: string, options: { stop?: boolean; restart?: boolean } = {}) {
    return createMoveCommand(ctx).handler({
      _: ['move'],
      $0: 'pdt',
      destination,
      stopAllContainers: options.stop ?? false,
      'stop-all-containers': options.stop ?? false,
      restartAllContainers: options.restart ?? false,
      'restart-all-containers': options.restart ?? false,
    });
  }

  describe('without a destination, after the project has been moved', () => {
    test('registers the project where it is now', async () => {
      writeRunState(file, { PROJECTS: { 'my-module': { root: path.join(sandbox, 'old') }, other: { root: '/x' } } });

      await move();

      expect(readRunState(file)).toEqual({ PROJECTS: { 'my-module': { root: project }, other: { root: '/x' } } });
      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(
        m['info.move.registered']({ id: 'my-module', root: project, file }),
      );
    });

    test('registers a project that is not registered', async () => {
      await move();

      expect(readRunState(file)).toEqual({ PROJECTS: { 'my-module': { root: project } } });
    });

    test('changes nothing when the project is registered where it is', async () => {
      writeRunState(file, { PROJECTS: { 'my-module': { root: project } } });
      const before = fs.readFileSync(file, 'utf8');

      await move();

      expect(fs.readFileSync(file, 'utf8')).toBe(before);
      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(m['info.move.unchanged']({ id: 'my-module', root: project }));
    });

    test('refuses to take over the id of a project that is still where it is registered', async () => {
      const original = path.join(sandbox, 'original');
      fs.mkdirSync(path.join(original, '.pdt'), { recursive: true });
      writeRunState(file, { PROJECTS: { 'my-module': { root: original } } });

      await expect(move()).rejects.toThrow(m['error.move.stillAProject']({ id: 'my-module', root: original, file }));

      expect(readRunState(file)).toEqual({ PROJECTS: { 'my-module': { root: original } } });
    });
  });

  describe('with a destination', () => {
    beforeEach(() => {
      writeRunState(file, { PROJECTS: { 'my-module': { root: project } } });
    });

    test('moves the project there, with everything in it, and registers it there', async () => {
      const destination = path.join(sandbox, 'moved');

      await move(destination);

      expect(fs.existsSync(project)).toBe(false);
      expect(fs.readFileSync(path.join(destination, 'src', 'module', 'main.ts'), 'utf8')).toBe('export {};\n');
      expect(fs.existsSync(path.join(destination, '.pdt', 'config.json'))).toBe(true);
      expect(readRunState(file)).toEqual({ PROJECTS: { 'my-module': { root: destination } } });
      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(
        m['info.move.moved']({ id: 'my-module', from: project, to: destination }),
      );
    });

    test('takes a destination relative to the directory pdt was started in', async () => {
      await move('moved');

      expect(fs.existsSync(path.join(sandbox, 'moved', '.pdt'))).toBe(true);
      expect(readRunState(file).PROJECTS?.['my-module']).toEqual({ root: path.join(sandbox, 'moved') });
    });

    test('moves the log with the project', async () => {
      await move('moved');

      expect(ctx.log.setDirectory).toHaveBeenCalledExactlyOnceWith(path.join(sandbox, 'moved', '.pdt'));
    });

    test('says which directory to change to when started inside the project', async () => {
      ctx.paths.cwd = path.join(project, 'src', 'module');

      await move(path.join(sandbox, 'moved'));

      expect(ctx.out).toHaveBeenLastCalledWith(
        m['info.move.changeDirectory']({ dir: path.join(sandbox, 'moved', 'src', 'module') }),
      );
    });

    test('says to change to the new root when started in the root', async () => {
      ctx.paths.cwd = project;

      await move(path.join(sandbox, 'moved'));

      expect(ctx.out).toHaveBeenLastCalledWith(m['info.move.changeDirectory']({ dir: path.join(sandbox, 'moved') }));
    });

    test.each([
      [
        'exists',
        () => fs.mkdirSync(path.join(sandbox, 'taken')),
        'taken',
        () => m['error.move.destinationExists']({ path: path.join(sandbox, 'taken') }),
      ],
      [
        'has no parent directory',
        () => undefined,
        path.join('no', 'such'),
        () => m['error.move.noParent']({ path: path.join(sandbox, 'no') }),
      ],
      [
        'is inside the project',
        () => undefined,
        path.join('project', 'inner'),
        () => m['error.move.intoItself']({ path: path.join(sandbox, 'project', 'inner') }),
      ],
    ])('refuses, as a usage error, a destination that %s, moving nothing', async (_case, arrange, given, message) => {
      arrange();

      await expect(move(given)).rejects.toEqual(new UsageError(message()));

      expect(fs.existsSync(path.join(project, '.pdt', 'config.json'))).toBe(true);
      expect(readRunState(file)).toEqual({ PROJECTS: { 'my-module': { root: project } } });
    });

    test('refuses a destination whose parent is a file', async () => {
      fs.writeFileSync(path.join(sandbox, 'file'), '');

      await expect(move(path.join('file', 'moved'))).rejects.toBeInstanceOf(UsageError);
    });

    test('updates a stale registration as it moves', async () => {
      writeRunState(file, { PROJECTS: { 'my-module': { root: path.join(sandbox, 'gone') } } });

      await move('moved');

      expect(readRunState(file)).toEqual({ PROJECTS: { 'my-module': { root: path.join(sandbox, 'moved') } } });
    });
  });

  describe('with VTTs it started', () => {
    const RUNNING = { id: 'abc', name: 'pdt-my-module', port: 30000, url: 'http://localhost:30000', started: 'now' };
    let host: VTTHostMock;
    let projectRunState: string;

    beforeEach(() => {
      writeRunState(file, { PROJECTS: { 'my-module': { root: project } } });
      ctx.config.VTT['my-module'] = vttSettings('14.368.0');
      projectRunState = runStateFile(path.join(project, '.pdt'));
      writeRunState(projectRunState, { VTT: { 'my-module': RUNNING } });
      host = createHostMock();
      host.isRunning.mockResolvedValue(true);
      ctx.createVtt.mockImplementation((name, settings) => new FoundryVTTServer(name, settings.server, host));
    });

    test.each([[undefined], ['moved']])(
      'refuses, moving and stopping nothing, while one is running (destination %s)',
      async destination => {
        await expect(move(destination)).rejects.toThrow(m['error.move.vttsRunning']({ vtts: 'my-module' }));

        expect(host.stop).not.toHaveBeenCalled();
        expect(fs.existsSync(path.join(project, '.pdt'))).toBe(true);
        expect(readRunState(projectRunState)).toEqual({ VTT: { 'my-module': RUNNING } });
      },
    );

    test('moves when what it started is no longer running', async () => {
      host.isRunning.mockResolvedValue(false);

      await move('moved');

      expect(fs.existsSync(path.join(sandbox, 'moved', '.pdt'))).toBe(true);
    });

    test('stops them all, then moves, with --stop-all-containers', async () => {
      await move('moved', { stop: true });

      expect(host.stop).toHaveBeenCalledExactlyOnceWith(RUNNING);
      expect(readRunState(runStateFile(path.join(sandbox, 'moved', '.pdt')))).toEqual({ VTT: {} });
      expect(host.start).not.toHaveBeenCalled();
    });

    test('stops them all, moves, then starts them from where the project is, with --restart-all-containers', async () => {
      const moved = path.join(sandbox, 'moved');

      await move('moved', { restart: true });

      expect(host.stop).toHaveBeenCalledExactlyOnceWith(RUNNING);
      expect(host.start).toHaveBeenCalledOnce();
      expect(host.start.mock.calls[0]![1].mounts).toContainEqual({
        source: moved,
        target: '/data/Data/modules/my-module',
      });
      expect(readRunState(runStateFile(path.join(moved, '.pdt'))).VTT?.['my-module']).toMatchObject({
        id: 'container-id',
      });
    });

    test('restarts them where the project is, with --restart-all-containers and no destination', async () => {
      await move(undefined, { restart: true });

      expect(host.stop).toHaveBeenCalledOnce();
      expect(host.start.mock.calls[0]![1].mounts).toContainEqual({
        source: project,
        target: '/data/Data/modules/my-module',
      });
    });

    test('refuses both --stop-all-containers and --restart-all-containers, as a usage error', async () => {
      await expect(move('moved', { stop: true, restart: true })).rejects.toEqual(
        new UsageError(m['error.move.stopOrRestart']()),
      );

      expect(host.stop).not.toHaveBeenCalled();
    });
  });

  test('fails outside a project', async () => {
    ctx.paths.pdtConfigDir = undefined;

    await expect(move()).rejects.toThrow(m['error.notInPdtProject']());
  });

  test.each(['default', 'user', 'cli'] as const)(
    'fails when the project file does not set the id (the id is from %s)',
    async source => {
      ctx.sourceOf.mockImplementation(() => source);

      await expect(move()).rejects.toThrow(m['error.move.noId']());
      expect(fs.existsSync(file)).toBe(false);
    },
  );

  test('fails when there is no id at all', async () => {
    delete ctx.config.id;

    await expect(move()).rejects.toThrow(m['error.move.noId']());
  });

  test('takes at most one argument', async () => {
    const parse = (commandLine: string) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        yargs()
          .strict()
          .command({ ...createMoveCommand(ctx), handler: argv => resolve(argv) })
          .fail((message: string) => reject(new Error(message)))
          .parse(commandLine);
      });

    await expect(parse('move')).resolves.not.toHaveProperty('destination');
    await expect(parse('move there')).resolves.toMatchObject({ destination: 'there' });
    await expect(parse('move there and-here')).rejects.toThrow('and-here');
  });
});

describe('relocate', () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-relocate-'));
    fs.mkdirSync(path.join(sandbox, 'from', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(sandbox, 'from', 'deep', 'file.txt'), 'content');
    fs.symlinkSync('deep/file.txt', path.join(sandbox, 'from', 'link'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  function exdev(): never {
    throw Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' });
  }

  test('copies, then removes, across filesystems, keeping links as they are', () => {
    vi.spyOn(fs, 'renameSync').mockImplementation(exdev);

    relocate(path.join(sandbox, 'from'), path.join(sandbox, 'to'));

    expect(fs.existsSync(path.join(sandbox, 'from'))).toBe(false);
    expect(fs.readFileSync(path.join(sandbox, 'to', 'deep', 'file.txt'), 'utf8')).toBe('content');
    expect(fs.readlinkSync(path.join(sandbox, 'to', 'link'))).toBe('deep/file.txt');
  });

  test('leaves the original, and nothing at the destination, when the copy fails', () => {
    vi.spyOn(fs, 'renameSync').mockImplementation(exdev);
    vi.spyOn(fs, 'cpSync').mockImplementation(to => {
      fs.mkdirSync(path.join(sandbox, 'to'));
      throw new Error(`disk full copying ${String(to)}`);
    });

    expect(() => relocate(path.join(sandbox, 'from'), path.join(sandbox, 'to'))).toThrow('disk full');

    expect(fs.existsSync(path.join(sandbox, 'to'))).toBe(false);
    expect(fs.readFileSync(path.join(sandbox, 'from', 'deep', 'file.txt'), 'utf8')).toBe('content');
  });

  test('fails with any other error from the rename, leaving everything as it was', () => {
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('busy'), { code: 'EBUSY' });
    });

    expect(() => relocate(path.join(sandbox, 'from'), path.join(sandbox, 'to'))).toThrow('busy');

    expect(fs.existsSync(path.join(sandbox, 'from'))).toBe(true);
    expect(fs.existsSync(path.join(sandbox, 'to'))).toBe(false);
  });
});
