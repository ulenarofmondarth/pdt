import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  chooseVtt,
  instanceName,
  restartVtt,
  runningProjectVtts,
  startVtt,
  stopAllVtts,
  stopVtt,
  vttDataDir,
  vttStatuses,
} from '@/cli/cmds/vtt_cmds/lifecycle.js';
import { vttSettings } from '@lib/projectVtt.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import { readRunState, runStateFile, writeRunState, type RunningVtt } from '@util/run-state.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';
import { createHostMock, type VTTHostMock } from '@tests/unit/mocks/vttHost.js';

describe('chooseVtt', () => {
  let ctx: CommandContextMock;

  beforeEach(() => {
    ctx = createCommandContext();
    ctx.config.VTT = { first: vttSettings('13'), second: vttSettings('14') };
  });

  test('is the VTT given', () => {
    expect(chooseVtt(ctx, 'second')).toBe('second');
  });

  test('fails, naming the VTTs there are, for a VTT that is not configured', () => {
    expect(() => chooseVtt(ctx, 'nosuch')).toThrow(
      m['error.vtt.unknownVtt']({ vtt: 'nosuch', known: 'first, second' }),
    );
  });

  test.each([undefined, 'first'])('fails when no VTT is configured (given %s)', given => {
    ctx.config.VTT = {};

    expect(() => chooseVtt(ctx, given)).toThrow(m['error.vtt.noneConfigured']());
  });

  test('is the first VTT when none is given and the project configures none', () => {
    expect(chooseVtt(ctx)).toBe('first');
  });

  test.each(['project', 'project-secrets'] as const)(
    'is the first VTT the project configures when none is given, though another comes first (%s)',
    source => {
      ctx.sourceOf.mockImplementation(key => (key[1] === 'second' && key[3] === 'version' ? source : 'user'));

      expect(chooseVtt(ctx)).toBe('second');
    },
  );
});

describe('instanceName', () => {
  test('is pdt-<project> for the VTT named after its project', () => {
    expect(instanceName('my-module', 'my-module')).toBe('pdt-my-module');
  });

  test('is pdt-<project>-<vtt> for any other VTT', () => {
    expect(instanceName('my-module', 'staging')).toBe('pdt-my-module-staging');
  });

  test('has only characters a container name can have', () => {
    expect(instanceName('my module', 'stäging/2')).toBe('pdt-my-module-st-ging-2');
  });
});

describe('the VTT lifecycle', () => {
  let ctx: CommandContextMock;
  let sandbox: string;
  let root: string;
  let file: string;
  let host: VTTHostMock;

  const RUNNING: RunningVtt = {
    id: 'old-id',
    name: 'pdt-my-module',
    port: 30005,
    url: 'http://localhost:30005',
    started: '2026-10-19T12:00:00.000Z',
  };

  beforeEach(() => {
    ctx = createCommandContext();
    sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-lifecycle-')));
    root = path.join(sandbox, 'my-module');
    ctx.paths.pdtConfigDir = path.join(root, '.pdt');
    ctx.paths.userDataDir = path.join(sandbox, 'data');
    ctx.config.id = 'my-module';
    ctx.config.VTT['my-module'] = vttSettings('13');
    file = runStateFile(ctx.paths.pdtConfigDir);
    host = createHostMock();
    ctx.createVtt.mockImplementation(
      (name, settings, account) => new FoundryVTTServer(name, settings.server, host, account),
    );
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  const recorded = () => readRunState(file).VTT?.['my-module'];

  describe('startVtt', () => {
    test('starts the VTT on the first free port from 30000, as pdt-<project>', async () => {
      ctx.isPortFree.mockImplementation(port => Promise.resolve(port > 30001));

      await startVtt(ctx, undefined);

      expect(host.start).toHaveBeenCalledExactlyOnceWith(
        ctx.createVtt.mock.results[0]!.value,
        expect.objectContaining({ name: 'pdt-my-module', port: 30002 }),
      );
    });

    test("records it in the project's run state, with the host it was started on", async () => {
      const before = Date.now();

      await startVtt(ctx, undefined);

      expect(recorded()).toEqual({
        id: 'container-id',
        name: 'pdt-my-module',
        port: 30000,
        url: 'http://localhost:30000',
        started: expect.any(String),
        host: ctx.config.VTT['my-module']!.host,
      });
      expect(Date.parse(recorded()!.started)).toBeGreaterThanOrEqual(before - 1000);
    });

    test('says what it is starting, and where it can be reached', async () => {
      await startVtt(ctx, undefined);

      expect(ctx.out.mock.calls).toEqual([
        [m['info.vtt.starting']({ vtt: 'my-module', version: '13', port: 30000 })],
        [m['info.vtt.waiting']({ vtt: 'my-module', url: 'http://localhost:30000', timeout: 600 })],
        [m['info.vtt.started']({ vtt: 'my-module', url: 'http://localhost:30000' })],
      ]);
    });

    test('keeps what else the run state records', async () => {
      writeRunState(file, { VTT: { staging: RUNNING }, other: true });

      await startVtt(ctx, undefined);

      expect(readRunState(file)).toMatchObject({
        VTT: { staging: RUNNING, 'my-module': expect.any(Object) },
        other: true,
      });
    });

    test('names what runs a VTT not named after the project pdt-<project>-<vtt>', async () => {
      ctx.config.VTT['staging'] = vttSettings('14');

      await startVtt(ctx, 'staging');

      expect(host.start).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'pdt-my-module-staging' }),
      );
    });

    test('names the project by its directory when it has no id', async () => {
      delete ctx.config.id;

      await startVtt(ctx, undefined);

      expect(host.start).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: 'pdt-my-module' }));
    });

    test('serves on the port it is set to, when that is free', async () => {
      ctx.config.VTT['my-module']!.server.port = 8080;

      await startVtt(ctx, undefined);

      expect(ctx.isPortFree).toHaveBeenCalledExactlyOnceWith(8080);
      expect(host.start).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ port: 8080 }));
    });

    test('fails, starting nothing, when the port it is set to is taken', async () => {
      ctx.config.VTT['my-module']!.server.port = 8080;
      ctx.isPortFree.mockResolvedValue(false);

      await expect(startVtt(ctx, undefined)).rejects.toThrow(
        m['error.vtt.portInUse']({ vtt: 'my-module', port: 8080 }),
      );

      expect(host.start).not.toHaveBeenCalled();
      expect(fs.existsSync(file)).toBe(false);
    });

    test('fails, starting nothing, when no port is free', async () => {
      ctx.isPortFree.mockResolvedValue(false);

      await expect(startVtt(ctx, undefined)).rejects.toThrow(m['error.vtt.noFreePort']({ from: 30000 }));

      expect(host.start).not.toHaveBeenCalled();
    });

    test('leaves a VTT that is running alone, saying where it is', async () => {
      writeRunState(file, { VTT: { 'my-module': RUNNING } });
      host.isRunning.mockResolvedValue(true);

      await startVtt(ctx, undefined);

      expect(host.isRunning).toHaveBeenCalledExactlyOnceWith(RUNNING);
      expect(host.start).not.toHaveBeenCalled();
      expect(recorded()).toEqual(RUNNING);
      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(
        m['info.vtt.alreadyRunning']({ vtt: 'my-module', url: RUNNING.url }),
      );
    });

    test('clears up a VTT that has stopped since it was started, then starts it afresh', async () => {
      writeRunState(file, { VTT: { 'my-module': RUNNING } });

      await startVtt(ctx, undefined);

      expect(ctx.log.info).toHaveBeenCalledWith(m['info.vtt.stoppedOnItsOwn']({ vtt: 'my-module' }));
      expect(host.stop).toHaveBeenCalledExactlyOnceWith(RUNNING);
      expect(host.stop.mock.invocationCallOrder[0]).toBeLessThan(host.start.mock.invocationCallOrder[0]!);
      expect(recorded()).toMatchObject({ id: 'container-id', port: 30000 });
    });

    test('fails, recording nothing, when the host cannot start the VTT', async () => {
      host.start.mockRejectedValue(new Error('no room at the inn'));

      await expect(startVtt(ctx, undefined)).rejects.toThrow('no room at the inn');

      expect(fs.existsSync(file)).toBe(false);
      expect(ctx.out).not.toHaveBeenCalledWith(expect.stringContaining('http://'));
    });

    test('gives the VTT its account, secrets and owner, from the configuration', async () => {
      ctx.config.FOUNDRY = { username: 'me', password: 'hunter2', license_key: 'ABCD' };
      ctx.config.VTT['my-module']!.server.admin_key = 'adm1n';
      ctx.owner = { uid: 1000, gid: 100 };

      await startVtt(ctx, undefined);

      expect(ctx.createVtt).toHaveBeenCalledExactlyOnceWith(
        'my-module',
        ctx.config.VTT['my-module'],
        ctx.config.FOUNDRY,
      );
      expect(host.start.mock.calls[0]![1].environment).toEqual({
        FOUNDRY_USERNAME: 'me',
        FOUNDRY_PASSWORD: 'hunter2',
        FOUNDRY_LICENSE_KEY: 'ABCD',
        FOUNDRY_ADMIN_KEY: 'adm1n',
        FOUNDRY_HOT_RELOAD: 'true',
      });
      expect(host.start.mock.calls[0]![1].user).toEqual({ uid: 1000, gid: 100 });
      expect(ctx.log.warn).not.toHaveBeenCalled();
    });

    test('runs the VTT as no user in particular where pdt has no numeric ids', async () => {
      await startVtt(ctx, undefined);

      expect(host.start.mock.calls[0]![1]).not.toHaveProperty('user');
    });

    test('never writes a secret to the run state or its output', async () => {
      ctx.config.FOUNDRY = { username: 'me', password: 'hunter2' };

      await startVtt(ctx, undefined);

      expect(fs.readFileSync(file, 'utf8')).not.toContain('hunter2');
      expect(ctx.out.mock.calls.flat().join('\n')).not.toContain('hunter2');
    });

    test('warns that Foundry VTT may not be had without an account to download it with', async () => {
      ctx.config.FOUNDRY = { username: 'me' };

      await startVtt(ctx, undefined);

      expect(ctx.log.warn).toHaveBeenCalledExactlyOnceWith(m['warn.vtt.noAccount']({ vtt: 'my-module' }));
      expect(host.start).toHaveBeenCalledOnce();
    });

    test("gives the VTT its data directory, in the user's data directory, and the project as its module", async () => {
      ctx.config.FOUNDRY = { username: 'me', password: 'p' };

      await startVtt(ctx, undefined);

      const data = vttDataDir(ctx.paths.userDataDir, 'pdt-my-module');
      expect(data).toBe(path.join(ctx.paths.userDataDir, 'vtt', 'pdt-my-module'));
      expect(fs.statSync(data).isDirectory()).toBe(true);
      expect(host.start.mock.calls[0]![1].mounts).toEqual([
        { source: data, target: '/data' },
        { source: root, target: '/data/Data/modules/my-module' },
      ]);
    });

    // Regression: Docker made the module's mount point inside the data directory, owned by root, so
    // the user could not remove the VTT's data.
    test("makes the module's mount point in the data directory itself, so that the user owns it", async () => {
      await startVtt(ctx, undefined);

      const mountPoint = path.join(vttDataDir(ctx.paths.userDataDir, 'pdt-my-module'), 'Data', 'modules', 'my-module');
      expect(fs.statSync(mountPoint).isDirectory()).toBe(true);
    });

    test('gives a project without an id only its data directory, with a warning', async () => {
      delete ctx.config.id;
      ctx.config.FOUNDRY = { username: 'me', password: 'p' };

      await startVtt(ctx, undefined);

      expect(host.start.mock.calls[0]![1].mounts).toEqual([
        { source: vttDataDir(ctx.paths.userDataDir, 'pdt-my-module'), target: '/data' },
      ]);
      expect(ctx.log.warn).toHaveBeenCalledExactlyOnceWith(m['warn.vtt.noModuleMount']({ vtt: 'my-module' }));
    });

    test('waits until the VTT answers at its address', async () => {
      ctx.isUrlReachable.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      host.isRunning.mockResolvedValue(true);
      ctx.config.VTT['my-module']!.server.ready.timeout = 10;

      await startVtt(ctx, undefined);

      expect(ctx.isUrlReachable).toHaveBeenCalledTimes(2);
      expect(ctx.isUrlReachable).toHaveBeenCalledWith('http://localhost:30000');
      expect(host.isRunning).toHaveBeenCalledWith({ id: 'container-id' });
      expect(ctx.out).toHaveBeenLastCalledWith(
        m['info.vtt.started']({ vtt: 'my-module', url: 'http://localhost:30000' }),
      );
    });

    test('fails, keeping the record, when the VTT stops while it is starting', async () => {
      ctx.isUrlReachable.mockResolvedValue(false);
      host.isRunning.mockResolvedValue(false);

      await expect(startVtt(ctx, undefined)).rejects.toThrow(
        m['error.vtt.stoppedWhileStarting']({ vtt: 'my-module', container: 'pdt-my-module' }),
      );

      expect(recorded()).toMatchObject({ id: 'container-id' });
    });

    test('fails, keeping the record, when the VTT does not answer in time', async () => {
      ctx.isUrlReachable.mockResolvedValue(false);
      host.isRunning.mockResolvedValue(true);
      ctx.config.VTT['my-module']!.server.ready.timeout = 0;

      await expect(startVtt(ctx, undefined)).rejects.toThrow(
        m['error.vtt.notReachable']({
          vtt: 'my-module',
          url: 'http://localhost:30000',
          timeout: 0,
          container: 'pdt-my-module',
        }),
      );

      expect(recorded()).toMatchObject({ id: 'container-id' });
    });

    test('fails, starting nothing, when the host cannot be reached', async () => {
      host.isAccessible.mockResolvedValue(false);

      await expect(startVtt(ctx, undefined)).rejects.toThrow(
        m['error.vtt.hostUnreachable']({ vtt: 'my-module', type: 'docker' }),
      );

      expect(host.start).not.toHaveBeenCalled();
      expect(ctx.out).not.toHaveBeenCalled();
    });
  });

  describe('stopVtt', () => {
    test('stops and forgets the VTT the run state records, keeping the rest, saying so', async () => {
      writeRunState(file, { VTT: { 'my-module': RUNNING, staging: RUNNING } });

      await stopVtt(ctx, undefined);

      expect(host.stop).toHaveBeenCalledExactlyOnceWith(RUNNING);
      expect(readRunState(file)).toEqual({ VTT: { staging: RUNNING } });
      expect(ctx.out.mock.calls).toEqual([
        [m['info.vtt.stopping']({ vtt: 'my-module' })],
        [m['info.vtt.stopped']({ vtt: 'my-module' })],
      ]);
    });

    test('leaves a VTT it has no record of alone, without asking the host, saying so', async () => {
      await stopVtt(ctx, undefined);

      expect(host.isAccessible).not.toHaveBeenCalled();
      expect(host.stop).not.toHaveBeenCalled();
      expect(fs.existsSync(file)).toBe(false);
      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(m['info.vtt.notRunning']({ vtt: 'my-module' }));
    });

    test('fails, keeping the record, when the host cannot be reached', async () => {
      writeRunState(file, { VTT: { 'my-module': RUNNING } });
      host.isAccessible.mockResolvedValue(false);

      await expect(stopVtt(ctx, undefined)).rejects.toThrow(
        m['error.vtt.hostUnreachable']({ vtt: 'my-module', type: 'docker' }),
      );

      expect(recorded()).toEqual(RUNNING);
    });

    test('fails, keeping the record, when the host cannot stop the VTT', async () => {
      writeRunState(file, { VTT: { 'my-module': RUNNING } });
      host.stop.mockRejectedValue(new Error('stuck'));

      await expect(stopVtt(ctx, undefined)).rejects.toThrow('stuck');

      expect(recorded()).toEqual(RUNNING);
    });
  });

  describe('restartVtt', () => {
    test('stops the VTT, then starts it afresh', async () => {
      writeRunState(file, { VTT: { 'my-module': RUNNING } });

      await restartVtt(ctx, undefined);

      expect(host.stop).toHaveBeenCalledExactlyOnceWith(RUNNING);
      expect(host.stop.mock.invocationCallOrder[0]).toBeLessThan(host.start.mock.invocationCallOrder[0]!);
      expect(recorded()).toMatchObject({ id: 'container-id' });
    });

    test('starts a VTT that is not running', async () => {
      await restartVtt(ctx, undefined);

      expect(host.stop).not.toHaveBeenCalled();
      expect(host.start).toHaveBeenCalledOnce();
    });

    test('fails, changing nothing, when the host cannot be reached', async () => {
      writeRunState(file, { VTT: { 'my-module': RUNNING } });
      host.isAccessible.mockResolvedValue(false);

      await expect(restartVtt(ctx, undefined)).rejects.toThrow(
        m['error.vtt.hostUnreachable']({ vtt: 'my-module', type: 'docker' }),
      );

      expect(host.stop).not.toHaveBeenCalled();
      expect(recorded()).toEqual(RUNNING);
    });
  });

  // Regression: pdt asked the host the configuration names now, so a VTT started on another Docker
  // engine, before the socket was changed, could no longer be found, stopped or reported on.
  describe('a VTT started on a host the configuration no longer names', () => {
    let startedOn: VTTHostMock;
    const OLD_HOST = { type: 'docker', image: 'felddy/foundryvtt', socketPath: '/old/docker.sock' } as const;
    const ON_OLD_HOST = { ...RUNNING, host: OLD_HOST };

    beforeEach(() => {
      ctx.config.VTT['my-module']!.host.socketPath = '/new/docker.sock';
      writeRunState(file, { VTT: { 'my-module': ON_OLD_HOST } });
      startedOn = createHostMock();
      startedOn.isRunning.mockResolvedValue(true);
      ctx.createVtt.mockImplementation(
        (name, settings, account) =>
          new FoundryVTTServer(
            name,
            settings.server,
            settings.host.socketPath === OLD_HOST.socketPath ? startedOn : host,
            account,
          ),
      );
    });

    test('is stopped there', async () => {
      await stopVtt(ctx, undefined);

      expect(startedOn.stop).toHaveBeenCalledExactlyOnceWith(ON_OLD_HOST);
      expect(host.stop).not.toHaveBeenCalled();
      expect(recorded()).toBeUndefined();
    });

    test('is found running there by start, which leaves it alone', async () => {
      await startVtt(ctx, undefined);

      expect(startedOn.isRunning).toHaveBeenCalledExactlyOnceWith(ON_OLD_HOST);
      expect(host.start).not.toHaveBeenCalled();
    });

    test('is cleared up there by start once it has exited, then started on the host configured now', async () => {
      startedOn.isRunning.mockResolvedValue(false);

      await startVtt(ctx, undefined);

      expect(startedOn.stop).toHaveBeenCalledExactlyOnceWith(ON_OLD_HOST);
      expect(host.start).toHaveBeenCalledOnce();
      expect(recorded()?.host).toMatchObject({ socketPath: '/new/docker.sock' });
    });

    test('is stopped there, and started on the host configured now, by restart', async () => {
      await restartVtt(ctx, undefined);

      expect(startedOn.stop).toHaveBeenCalledOnce();
      expect(host.start).toHaveBeenCalledOnce();
    });

    test('is found running there by runningProjectVtts and stopped there by stopAllVtts', async () => {
      await expect(runningProjectVtts(ctx)).resolves.toEqual(['my-module']);
      expect(host.isRunning).not.toHaveBeenCalled();

      await stopAllVtts(ctx);

      expect(startedOn.stop).toHaveBeenCalledOnce();
      expect(host.stop).not.toHaveBeenCalled();
    });

    test('is reported on from there', async () => {
      await expect(vttStatuses(ctx)).resolves.toEqual([
        { vtt: 'my-module', state: 'running', url: RUNNING.url, container: RUNNING.name },
      ]);
      expect(host.isRunning).not.toHaveBeenCalled();
    });

    test('fails to stop, keeping the record, when that host cannot be reached', async () => {
      startedOn.isAccessible.mockResolvedValue(false);

      await expect(stopVtt(ctx, undefined)).rejects.toThrow(
        m['error.vtt.hostUnreachable']({ vtt: 'my-module', type: 'docker' }),
      );
      expect(recorded()).toEqual(ON_OLD_HOST);
    });
  });

  describe('runningProjectVtts', () => {
    test('is the recorded VTTs that are running', async () => {
      ctx.config.VTT['staging'] = vttSettings('14');
      writeRunState(file, { VTT: { 'my-module': RUNNING, staging: { ...RUNNING, id: 'stopped' } } });
      host.isRunning.mockImplementation(handle => Promise.resolve(handle.id === 'old-id'));

      await expect(runningProjectVtts(ctx)).resolves.toEqual(['my-module']);
    });

    test('counts a recorded VTT that is no longer configured as running, as it cannot be asked', async () => {
      writeRunState(file, { VTT: { gone: RUNNING } });

      await expect(runningProjectVtts(ctx)).resolves.toEqual(['gone']);
      expect(host.isRunning).not.toHaveBeenCalled();
    });

    test('is nothing without a run state', async () => {
      await expect(runningProjectVtts(ctx)).resolves.toEqual([]);
    });

    test('fails when the host of a recorded VTT cannot be reached', async () => {
      writeRunState(file, { VTT: { 'my-module': RUNNING } });
      host.isAccessible.mockResolvedValue(false);

      await expect(runningProjectVtts(ctx)).rejects.toThrow(
        m['error.vtt.hostUnreachable']({ vtt: 'my-module', type: 'docker' }),
      );
    });
  });

  describe('stopAllVtts', () => {
    test('stops and forgets every recorded VTT', async () => {
      ctx.config.VTT['staging'] = vttSettings('14');
      const staging = { ...RUNNING, id: 'staging-id' };
      writeRunState(file, { VTT: { 'my-module': RUNNING, staging } });

      await stopAllVtts(ctx);

      expect(host.stop.mock.calls).toEqual([[RUNNING], [staging]]);
      expect(readRunState(file)).toEqual({ VTT: {} });
    });

    test('forgets a VTT that is no longer configured, warning how to stop it', async () => {
      writeRunState(file, { VTT: { gone: RUNNING } });

      await stopAllVtts(ctx);

      expect(host.stop).not.toHaveBeenCalled();
      expect(ctx.log.warn).toHaveBeenCalledExactlyOnceWith(
        m['warn.vtt.notConfiguredToStop']({ vtt: 'gone', container: 'pdt-my-module' }),
      );
      expect(readRunState(file)).toEqual({ VTT: {} });
    });

    test('fails, keeping the record, when a host cannot be reached', async () => {
      writeRunState(file, { VTT: { 'my-module': RUNNING } });
      host.isAccessible.mockResolvedValue(false);

      await expect(stopAllVtts(ctx)).rejects.toThrow(
        m['error.vtt.hostUnreachable']({ vtt: 'my-module', type: 'docker' }),
      );
      expect(recorded()).toEqual(RUNNING);
    });
  });

  test.each([
    ['runningProjectVtts', runningProjectVtts],
    ['stopAllVtts', stopAllVtts],
  ])('%s fails outside a project', async (_name, run) => {
    ctx.paths.pdtConfigDir = undefined;

    await expect(run(ctx)).rejects.toThrow(m['error.notInPdtProject']());
  });

  test.each([
    ['startVtt', startVtt],
    ['stopVtt', stopVtt],
    ['restartVtt', restartVtt],
  ])('%s fails outside a project, creating no VTT', async (_name, run) => {
    ctx.paths.pdtConfigDir = undefined;

    await expect(run(ctx, undefined)).rejects.toThrow(m['error.notInPdtProject']());

    expect(ctx.createVtt).not.toHaveBeenCalled();
  });
});
