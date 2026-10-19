import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { chooseVtt, instanceName, restartVtt, startVtt, stopVtt } from '@/cli/cmds/vtt_cmds/lifecycle.js';
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
    ctx.config.id = 'my-module';
    ctx.config.VTT['my-module'] = vttSettings('13');
    file = runStateFile(ctx.paths.pdtConfigDir);
    host = createHostMock();
    ctx.createVtt.mockImplementation((name, settings) => new FoundryVTTServer(name, settings.server, host));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  const recorded = () => readRunState(file).VTT?.['my-module'];

  describe('startVtt', () => {
    test('starts the VTT on the first free port from 30000, as pdt-<project>', async () => {
      ctx.isPortFree.mockImplementation(port => Promise.resolve(port > 30001));

      await startVtt(ctx, undefined);

      expect(host.start).toHaveBeenCalledExactlyOnceWith(ctx.createVtt.mock.results[0]!.value, {
        name: 'pdt-my-module',
        port: 30002,
      });
    });

    test("records it in the project's run state", async () => {
      const before = Date.now();

      await startVtt(ctx, undefined);

      expect(recorded()).toEqual({
        id: 'container-id',
        name: 'pdt-my-module',
        port: 30000,
        url: 'http://localhost:30000',
        started: expect.any(String),
      });
      expect(Date.parse(recorded()!.started)).toBeGreaterThanOrEqual(before - 1000);
    });

    test('says what it is starting, and where it can be reached', async () => {
      await startVtt(ctx, undefined);

      expect(ctx.out.mock.calls).toEqual([
        [m['info.vtt.starting']({ vtt: 'my-module', version: '13', port: 30000 })],
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
