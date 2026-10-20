import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yargs from 'yargs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createForceResetCommand } from '@/cli/cmds/force-reset.js';
import PDT from '@/constants.js';
import { vttSettings } from '@lib/projectVtt.js';
import { readRunState, runStateFile, writeRunState } from '@util/run-state.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';
import { createHostMock } from '@tests/unit/mocks/vttHost.js';

describe('force-reset command', () => {
  let ctx: CommandContextMock;
  let sandbox: string;
  let project: string;
  let projectData: string;
  let configFile: string;
  let projectRunState: string;
  let userRunState: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-force-reset-'));
    project = path.join(sandbox, 'project');
    projectData = path.join(project, PDT.PROJECT_RTD_DIR_NAME);
    configFile = path.join(projectData, 'config.json');
    projectRunState = runStateFile(projectData);

    // A project that was initialised as old-id, whose module has since been renamed.
    fs.mkdirSync(path.join(project, '.foundryvtt'), { recursive: true });
    fs.writeFileSync(path.join(project, 'module.json'), JSON.stringify({ id: 'new-id' }));
    fs.writeFileSync(path.join(project, '.foundryvtt', '.env'), 'VERSION=14.368.0\n');
    fs.mkdirSync(projectData);
    fs.writeFileSync(configFile, JSON.stringify({ id: 'old-id', Logging: { level: 'debug' } }));
    fs.writeFileSync(projectRunState, '{}');
    fs.writeFileSync(path.join(projectData, 'pdt.log'), 'existing log');

    ctx = createCommandContext();
    ctx.paths.pdtConfigDir = projectData;
    ctx.paths.userDataDir = path.join(sandbox, 'user-data');
    userRunState = runStateFile(ctx.paths.userDataDir);
    writeRunState(userRunState, { PROJECTS: { 'old-id': { root: project }, other: { root: '/elsewhere' } } });
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  function forceReset() {
    return createForceResetCommand(ctx).handler({ _: ['force-reset'], $0: 'pdt' });
  }

  test("removes the project's run state", async () => {
    await forceReset();

    expect(fs.existsSync(projectRunState)).toBe(false);
    expect(ctx.log.info).toHaveBeenCalledWith(m['info.forceReset.removed']({ file: projectRunState }));
  });

  test("removes the project's registration from the user's run state, leaving other projects", async () => {
    await forceReset();

    expect(readRunState(userRunState).PROJECTS).not.toHaveProperty('old-id');
    expect(readRunState(userRunState).PROJECTS).toHaveProperty('other', { root: '/elsewhere' });
    expect(ctx.log.info).toHaveBeenCalledWith(m['info.forceReset.unregistered']({ id: 'old-id', file: userRunState }));
  });

  test("replaces the project's configuration with what init writes", async () => {
    await forceReset();

    expect(JSON.parse(fs.readFileSync(configFile, 'utf8'))).toEqual({
      id: 'new-id',
      VTT: { 'new-id': vttSettings('14.368.0') },
    });
    expect(ctx.log.info).toHaveBeenCalledWith(m['info.forceReset.removed']({ file: configFile }));
  });

  test('initialises the project again, registering it under its id', async () => {
    await forceReset();

    expect(readRunState(userRunState).PROJECTS).toHaveProperty('new-id', { root: project });
    expect(ctx.log.info).toHaveBeenLastCalledWith(m['info.pdtInitialised']({ path: project }));
    expect(ctx.createModule).not.toHaveBeenCalled();
  });

  test('keeps the rest of the data directory, such as the log', async () => {
    await forceReset();

    expect(fs.readFileSync(path.join(projectData, 'pdt.log'), 'utf8')).toBe('existing log');
  });

  test('works when there is no run state or configuration to remove', async () => {
    fs.rmSync(configFile);
    fs.rmSync(projectRunState);
    fs.rmSync(userRunState);

    await forceReset();

    expect(readRunState(userRunState).PROJECTS).toEqual({ 'new-id': { root: project } });
    expect(ctx.log.info).toHaveBeenCalledExactlyOnceWith(m['info.pdtInitialised']({ path: project }));
  });

  test('fails when the id is registered to another project, leaving the project without configuration', async () => {
    writeRunState(userRunState, { PROJECTS: { 'new-id': { root: '/elsewhere' } } });

    await expect(forceReset()).rejects.toThrow(
      m['error.projectRegistered.elsewhere']({ id: 'new-id', root: '/elsewhere', file: userRunState }),
    );

    expect(fs.existsSync(configFile)).toBe(false);
  });

  test('fails outside a project, changing nothing', async () => {
    ctx.paths.pdtConfigDir = undefined;

    await expect(forceReset()).rejects.toThrow(m['error.notInPdtProject']());

    expect(fs.existsSync(configFile)).toBe(true);
    expect(readRunState(userRunState).PROJECTS).toHaveProperty('old-id');
  });

  test('takes no arguments', async () => {
    const parse = (commandLine: string) =>
      new Promise((resolve, reject) => {
        yargs()
          .strict()
          .command({ ...createForceResetCommand(ctx), handler: argv => resolve(argv) })
          .fail((message: string) => reject(new Error(message)))
          .parse(commandLine);
      });

    await expect(parse('force-reset')).resolves.toBeDefined();
    await expect(parse('force-reset somewhere')).rejects.toThrow('somewhere');
  });

  describe('with VTTs it started', () => {
    const RUNNING = { id: 'abc', name: 'pdt-old-id', port: 30000, url: 'http://localhost:30000', started: 'now' };
    let host: ReturnType<typeof createHostMock>;

    beforeEach(() => {
      ctx.config.VTT['old-id'] = vttSettings('14.368.0');
      fs.writeFileSync(projectRunState, JSON.stringify({ VTT: { 'old-id': RUNNING } }));
      host = createHostMock();
      ctx.createVtt.mockImplementation((name, settings) => new FoundryVTTServer(name, settings.server, host));
    });

    test('stops them first, so that none is left running unrecorded', async () => {
      await forceReset();

      expect(host.stop).toHaveBeenCalledExactlyOnceWith(RUNNING);
      expect(ctx.out).toHaveBeenCalledWith(m['info.vtt.stopped']({ vtt: 'old-id' }));
      expect(fs.existsSync(projectRunState)).toBe(false);
    });

    test('fails, changing nothing, when one cannot be stopped', async () => {
      host.isAccessible.mockResolvedValue(false);

      await expect(forceReset()).rejects.toThrow(m['error.vtt.hostUnreachable']({ vtt: 'old-id', type: 'docker' }));

      expect(JSON.parse(fs.readFileSync(projectRunState, 'utf8'))).toEqual({ VTT: { 'old-id': RUNNING } });
      expect(fs.existsSync(configFile)).toBe(true);
      expect(readRunState(userRunState).PROJECTS).toHaveProperty('old-id');
    });
  });
});
