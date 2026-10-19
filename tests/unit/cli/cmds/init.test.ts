import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yargs from 'yargs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createInitCommand } from '@/cli/cmds/init.js';
import PDT from '@/constants.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, UNASKED_PROMPTER, type CommandContextMock } from '@tests/unit/mocks/context.js';
import { vttSettings } from '@lib/projectVtt.js';
import { vttSchema } from '@schema/config.js';
import { readRunState, runStateFile, writeRunState } from '@util/run-state.js';

let ctx: CommandContextMock;

/** Write what a module project says about itself: its manifest, and its Foundry VTT environment file. */
function writeModuleProject(dir: string, id = 'my-module', version = '13.351') {
  fs.mkdirSync(path.join(dir, '.foundryvtt'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'module.json'), JSON.stringify({ id, title: 'A module' }));
  fs.writeFileSync(path.join(dir, '.foundryvtt', '.env'), `VERSION=${version}\n`);
}

function runInit(dir: string, force?: boolean, more: Record<string, unknown> = {}) {
  return createInitCommand(ctx).handler({ _: ['init'], $0: 'pdt', dir, force, yes: undefined, ...more });
}

describe('init command', () => {
  let sandbox: string;
  let project: string;
  let projectData: string;
  let userRunState: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-init-'));
    project = path.join(sandbox, 'project');
    projectData = path.join(project, PDT.PROJECT_RTD_DIR_NAME);
    fs.mkdirSync(project);
    // An existing project has content; an empty directory is a different case, covered below.
    fs.writeFileSync(path.join(project, 'package.json'), '{}');
    writeModuleProject(project);
    ctx = createCommandContext();
    ctx.paths.userDataDir = path.join(sandbox, 'user-data');
    userRunState = runStateFile(ctx.paths.userDataDir);
    ctx.prompter = UNASKED_PROMPTER;
    ctx.createModule.mockResolvedValue({ destination: project, files: [] });
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  describe('in a directory that is not yet a project', () => {
    test('does not create a new module', async () => {
      await runInit(project);

      expect(ctx.createModule).not.toHaveBeenCalled();
      expect(fs.readdirSync(project).sort()).toEqual([
        '.foundryvtt',
        PDT.PROJECT_RTD_DIR_NAME,
        'module.json',
        'package.json',
      ]);
    });

    describe('when new module options are given', () => {
      test('warns that no module is generated, naming the options', async () => {
        await runInit(project, undefined, { moduleId: 'given-id', gitInit: false, yes: true });

        expect(ctx.log.warn).toHaveBeenCalledExactlyOnceWith(
          m['warn.moduleNotGenerated']({ path: project, options: '--module-id, --no-git-init, --yes' }),
        );
        expect(ctx.createModule).not.toHaveBeenCalled();
      });

      test('names a yes or no option that was turned on without the no- prefix', async () => {
        await runInit(project, undefined, { install: true });

        expect(ctx.log.warn).toHaveBeenCalledExactlyOnceWith(
          m['warn.moduleNotGenerated']({ path: project, options: '--install' }),
        );
      });

      test('warns for --yes on its own', async () => {
        await runInit(project, undefined, { yes: true });

        expect(ctx.log.warn).toHaveBeenCalledExactlyOnceWith(
          m['warn.moduleNotGenerated']({ path: project, options: '--yes' }),
        );
      });

      test('still makes the directory a project', async () => {
        await runInit(project, undefined, { moduleId: 'given-id' });

        expect(fs.statSync(projectData).isDirectory()).toBe(true);
        expect(ctx.log.info).toHaveBeenCalledExactlyOnceWith(m['info.pdtInitialised']({ path: project }));
      });
    });

    test('does not warn about --force, which is not a new module option', async () => {
      await runInit(project, true);

      expect(ctx.log.warn).not.toHaveBeenCalled();
    });

    test('creates the project data directory', async () => {
      await runInit(project);

      expect(fs.statSync(projectData).isDirectory()).toBe(true);
    });

    test('reports that the project was initialised', async () => {
      await runInit(project);

      expect(ctx.log.info).toHaveBeenCalledExactlyOnceWith(m['info.pdtInitialised']({ path: project }));
      expect(ctx.log.warn).not.toHaveBeenCalled();
    });

    test('moves the log to the new project before reporting', async () => {
      await runInit(project);

      expect(ctx.log.setDirectory).toHaveBeenCalledExactlyOnceWith(projectData);
      expect(ctx.log.setDirectory.mock.invocationCallOrder[0]).toBeLessThan(ctx.log.info.mock.invocationCallOrder[0]!);
    });

    describe('the project id', () => {
      const configFile = () => path.join(projectData, 'config.json');
      const read = (): unknown => JSON.parse(fs.readFileSync(configFile(), 'utf8'));

      test("is the module's id, recorded in the project's configuration", async () => {
        await runInit(project);

        expect(read()).toMatchObject({ id: 'my-module' });
      });

      test("is registered in the user's run state, with the project's root", async () => {
        await runInit(project);

        expect(readRunState(userRunState)).toEqual({ PROJECTS: { 'my-module': { root: project } } });
        expect(ctx.out.mock.calls[0]).toEqual([m['info.projectRegistered']({ id: 'my-module', file: userRunState })]);
      });

      test('is registered with the absolute root when the directory is given relative', async () => {
        ctx.paths.cwd = sandbox;

        await runInit('project');

        expect(readRunState(userRunState).PROJECTS?.['my-module']).toEqual({ root: project });
      });

      test('is registered alongside the other projects, keeping whatever else the run state holds', async () => {
        writeRunState(userRunState, { PROJECTS: { other: { root: '/elsewhere' } }, KEEP: 1 });

        await runInit(project);

        expect(readRunState(userRunState)).toEqual({
          PROJECTS: { other: { root: '/elsewhere' }, 'my-module': { root: project } },
          KEEP: 1,
        });
      });

      test('that another project is registered as is refused, before the project is made', async () => {
        writeRunState(userRunState, { PROJECTS: { 'my-module': { root: '/elsewhere' } } });

        await expect(runInit(project)).rejects.toThrow(
          m['error.projectRegistered.elsewhere']({ id: 'my-module', root: '/elsewhere', file: userRunState }),
        );

        expect(fs.existsSync(projectData)).toBe(false);
        expect(readRunState(userRunState)).toEqual({ PROJECTS: { 'my-module': { root: '/elsewhere' } } });
        expect(ctx.log.setDirectory).not.toHaveBeenCalled();
      });

      test('that is registered for this directory already is refused, pointing to force-reset', async () => {
        writeRunState(userRunState, { PROJECTS: { 'my-module': { root: project } } });

        await expect(runInit(project)).rejects.toThrow(
          m['error.projectRegistered.here']({ id: 'my-module', file: userRunState }),
        );

        expect(fs.existsSync(projectData)).toBe(false);
      });

      test('cannot be checked when the run state cannot be read, so nothing is made', async () => {
        fs.mkdirSync(ctx.paths.userDataDir);
        fs.writeFileSync(userRunState, 'not json');

        await expect(runInit(project)).rejects.toThrow(userRunState);

        expect(fs.existsSync(projectData)).toBe(false);
      });

      test('that cannot be read leaves the project unconfigured and unregistered, warning with the manifest', async () => {
        fs.rmSync(path.join(project, 'module.json'));

        await runInit(project);

        expect(fs.existsSync(configFile())).toBe(false);
        expect(fs.existsSync(userRunState)).toBe(false);
        expect(ctx.log.warn.mock.calls.flat()).toEqual([
          expect.stringContaining(path.join(project, 'module.json')),
          m['warn.noProjectId'](),
        ]);
        // The project is still made.
        expect(fs.statSync(projectData).isDirectory()).toBe(true);
        expect(ctx.log.info).toHaveBeenCalledExactlyOnceWith(m['info.pdtInitialised']({ path: project }));
      });
    });

    describe("the project's VTT", () => {
      const configFile = () => path.join(projectData, 'config.json');
      const read = (): unknown => JSON.parse(fs.readFileSync(configFile(), 'utf8'));

      test("is configured in the project's file, named by the project id, running the project's Foundry VTT version", async () => {
        await runInit(project);

        expect(read()).toEqual({ id: 'my-module', VTT: { 'my-module': vttSettings('13.351') } });
        expect(vttSchema.parse((read() as { VTT: Record<string, unknown> }).VTT['my-module'])).toEqual(
          vttSettings('13.351'),
        );
        expect(ctx.out).toHaveBeenLastCalledWith(
          m['info.vttConfigured']({ vtt: 'my-module', version: '13.351', file: configFile() }),
        );
        expect(ctx.log.warn).not.toHaveBeenCalled();
      });

      test('is not configured without the Foundry VTT version, with a warning naming the file and the command to add it', async () => {
        fs.rmSync(path.join(project, '.foundryvtt'), { recursive: true });

        await runInit(project);

        expect(read()).toEqual({ id: 'my-module' });
        expect(ctx.log.warn.mock.calls.flat()).toEqual([
          expect.stringContaining(path.join(project, '.foundryvtt', '.env')),
          m['warn.projectVtt.notConfigured']({
            command: `pdt config set VTT.my-module '${JSON.stringify(vttSettings('<version>'))}'`,
          }),
        ]);
        // The project is still registered.
        expect(readRunState(userRunState).PROJECTS).toHaveProperty('my-module');
      });
    });
  });

  describe.each([
    { state: 'an empty directory', exists: true },
    { state: 'a directory that does not exist yet', exists: false },
  ])('in $state', ({ exists }) => {
    let fresh: string;
    let freshData: string;

    beforeEach(() => {
      fresh = path.join(sandbox, 'new-module');
      freshData = path.join(fresh, PDT.PROJECT_RTD_DIR_NAME);
      if (exists) fs.mkdirSync(fresh);
      // Stand in for the generator: it creates the destination and writes the module into it.
      ctx.createModule.mockImplementation(async (destination, options) => {
        fs.mkdirSync(destination, { recursive: true });
        writeModuleProject(destination, 'new-module', '14.360');
        options?.onStep?.('wrote 2 files');
        return { destination, files: ['module.json', '.foundryvtt/.env'] };
      });
    });

    test('creates a new module there, asking in the terminal', async () => {
      await runInit(fresh);

      expect(ctx.log.warn).not.toHaveBeenCalled();
      expect(ctx.createModule).toHaveBeenCalledExactlyOnceWith(fresh, {
        given: {},
        prompter: UNASKED_PROMPTER,
        onStep: expect.any(Function),
      });
      expect(fs.existsSync(path.join(fresh, 'module.json'))).toBe(true);
    });

    test('passes on the answers given as options, and nothing else from the command line', async () => {
      await runInit(fresh, undefined, {
        moduleId: 'given-id',
        'module-id': 'given-id',
        gitInit: false,
        yes: undefined,
      });

      expect(ctx.createModule.mock.calls[0]![1]).toMatchObject({
        given: { moduleId: 'given-id', gitInit: false },
      });
    });

    test('does not ask when told not to with --yes', async () => {
      await runInit(fresh, undefined, { yes: true, moduleId: 'given-id' });

      expect(ctx.log.warn).not.toHaveBeenCalled();

      expect(ctx.createModule.mock.calls[0]![1]).not.toHaveProperty('prompter');
    });

    test('does not ask when there is no terminal to ask in', async () => {
      delete ctx.prompter;

      await runInit(fresh);

      expect(ctx.createModule.mock.calls[0]![1]).not.toHaveProperty('prompter');
      expect(fs.statSync(freshData).isDirectory()).toBe(true);
    });

    test('makes the new module a project only after it has been generated', async () => {
      const generate = ctx.createModule.getMockImplementation()!;
      let dataExistedDuringGeneration: boolean | undefined;
      ctx.createModule.mockImplementation(async (...args) => {
        dataExistedDuringGeneration = fs.existsSync(freshData);
        return generate(...args);
      });

      await runInit(fresh);

      expect(dataExistedDuringGeneration).toBe(false);
      expect(fs.statSync(freshData).isDirectory()).toBe(true);
      expect(ctx.log.setDirectory).toHaveBeenCalledExactlyOnceWith(freshData);
      expect(ctx.log.info).toHaveBeenCalledExactlyOnceWith(m['info.pdtInitialised']({ path: fresh }));
    });

    test("tells the user what it is doing and shows the generator's progress", async () => {
      await runInit(fresh);

      expect(ctx.out.mock.calls.flat()).toEqual([
        m['info.creatingModule']({ path: fresh }),
        '✔ wrote 2 files',
        m['info.projectRegistered']({ id: 'new-module', file: userRunState }),
        m['info.vttConfigured']({ vtt: 'new-module', version: '14.360', file: path.join(freshData, 'config.json') }),
      ]);
    });

    test('configures the VTT of the module it generated', async () => {
      await runInit(fresh);

      expect(JSON.parse(fs.readFileSync(path.join(freshData, 'config.json'), 'utf8'))).toEqual({
        id: 'new-module',
        VTT: { 'new-module': vttSettings('14.360') },
      });
      expect(readRunState(userRunState)).toEqual({ PROJECTS: { 'new-module': { root: fresh } } });
    });

    test('refuses an id registered already only once the module is generated, leaving it unmade as a project', async () => {
      writeRunState(userRunState, { PROJECTS: { 'new-module': { root: '/elsewhere' } } });

      await expect(runInit(fresh)).rejects.toThrow(
        m['error.projectRegistered.elsewhere']({ id: 'new-module', root: '/elsewhere', file: userRunState }),
      );

      expect(ctx.createModule).toHaveBeenCalledOnce();
      expect(fs.existsSync(path.join(fresh, 'module.json'))).toBe(true);
      expect(fs.existsSync(freshData)).toBe(false);
    });

    test("fails with the generator's error and does not make a project", async () => {
      ctx.createModule.mockRejectedValue(new Error('Invalid moduleId'));

      await expect(runInit(fresh)).rejects.toThrow('Invalid moduleId');

      expect(fs.existsSync(freshData)).toBe(false);
      expect(ctx.log.info).not.toHaveBeenCalled();
    });
  });

  describe('in a directory that is already a project', () => {
    let configFile: string;

    beforeEach(() => {
      fs.mkdirSync(projectData);
      configFile = path.join(projectData, 'config.json');
      fs.writeFileSync(configFile, '{"id":"kept"}');
      fs.writeFileSync(path.join(projectData, 'pdt.log'), 'existing log');
      ctx.paths.pdtConfigDir = projectData;
    });

    test('fails, pointing to force-reset, and leaves the project alone', async () => {
      fs.rmSync(path.join(project, 'package.json'));

      await expect(runInit(project)).rejects.toThrow(
        m['error.alreadyInitialised']({ path: project, file: configFile }),
      );

      expect(fs.readdirSync(projectData).sort()).toEqual(['config.json', 'pdt.log']);
      expect(fs.readFileSync(configFile, 'utf8')).toBe('{"id":"kept"}');
      expect(fs.existsSync(userRunState)).toBe(false);
      expect(ctx.log.info).not.toHaveBeenCalled();
      expect(ctx.log.setDirectory).not.toHaveBeenCalled();
      expect(ctx.createModule).not.toHaveBeenCalled();
    });

    test('also warns that no module is generated when new module options are given', async () => {
      await expect(runInit(project, undefined, { uiFramework: 'lit' })).rejects.toThrow(
        m['error.alreadyInitialised']({ path: project, file: configFile }),
      );

      expect(ctx.log.warn).toHaveBeenCalledExactlyOnceWith(
        m['warn.moduleNotGenerated']({ path: project, options: '--ui-framework' }),
      );
    });

    test('is initialised when it has no configuration, keeping the rest of its data directory', async () => {
      fs.rmSync(configFile);

      await runInit(project);

      expect(ctx.createModule).not.toHaveBeenCalled();
      expect(JSON.parse(fs.readFileSync(configFile, 'utf8'))).toMatchObject({ id: 'my-module' });
      expect(fs.readFileSync(path.join(projectData, 'pdt.log'), 'utf8')).toBe('existing log');
      expect(ctx.log.info).toHaveBeenCalledExactlyOnceWith(m['info.pdtInitialised']({ path: project }));
    });
  });

  describe('in a directory inside another project', () => {
    let nested: string;

    beforeEach(() => {
      nested = path.join(project, 'packages', 'inner');
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, 'package.json'), '{}');
      fs.mkdirSync(projectData);
      ctx.paths.pdtConfigDir = projectData;
    });

    test('refuses, naming the parent project', async () => {
      await runInit(nested);

      expect(ctx.log.warn).toHaveBeenCalledExactlyOnceWith(m['warn.pdtParentExists']({ path: project }));
      expect(fs.existsSync(path.join(nested, PDT.PROJECT_RTD_DIR_NAME))).toBe(false);
    });

    test('refuses before creating a module, even when the directory is empty', async () => {
      fs.rmSync(path.join(nested, 'package.json'));

      await runInit(nested);

      expect(ctx.createModule).not.toHaveBeenCalled();
      expect(fs.readdirSync(nested)).toEqual([]);
    });

    test('creates the nested project when forced', async () => {
      await runInit(nested, true);

      expect(fs.statSync(path.join(nested, PDT.PROJECT_RTD_DIR_NAME)).isDirectory()).toBe(true);
      expect(ctx.log.info).toHaveBeenCalledExactlyOnceWith(m['info.pdtInitialised']({ path: nested }));
    });
  });

  describe('arguments', () => {
    /** Parse a command line against the command's own builder, without running its handler. */
    function parse(commandLine: string): Promise<Record<string, unknown>> {
      return new Promise((resolve, reject) => {
        yargs()
          .command({ ...createInitCommand(createCommandContext()), handler: argv => resolve(argv) })
          .fail((message: string) => reject(new Error(message)))
          .parse(commandLine);
      });
    }

    test('default to the current directory, not forced', async () => {
      await expect(parse('init')).resolves.toMatchObject({ dir: '.' });
      await expect(parse('init')).resolves.not.toHaveProperty('f', true);
    });

    test('take the project directory as a positional', async () => {
      await expect(parse('init some/dir')).resolves.toMatchObject({ dir: 'some/dir' });
    });

    test.each(['-f', '--force'])('accept %s to force initialisation', async flag => {
      await expect(parse(`init some/dir ${flag}`)).resolves.toMatchObject({ f: true, force: true });
    });

    test.each(['-y', '--yes'])('accept %s to skip the questions', async flag => {
      await expect(parse(`init ${flag}`)).resolves.toMatchObject({ y: true, yes: true });
    });

    test('accept the generator answers as options', async () => {
      const parsed = await parse(
        'init --module-id arcane-ledger --description "Keeps the accounts." --ui-framework lit --no-install --git-init',
      );

      expect(parsed).toMatchObject({
        moduleId: 'arcane-ledger',
        description: 'Keeps the accounts.',
        uiFramework: 'lit',
        install: false,
        gitInit: true,
      });
    });

    test('leave an answer that is not given undefined, so that it is asked for', async () => {
      const parsed = await parse('init');

      expect(parsed['moduleId']).toBeUndefined();
      expect(parsed['install']).toBeUndefined();
    });

    test('reject a value that is not one of the choices of a selection', async () => {
      await expect(parse('init --language cobol')).rejects.toThrow('cobol');
    });

    test('offer every option the generator has', async () => {
      const { generatorOptions } = await import('@lib/ModuleGenerator.js');
      const help = await new Promise<string>(resolve => {
        yargs()
          .command(createInitCommand(createCommandContext()))
          .parse('init --help', (_err: unknown, _argv: unknown, output: string) => resolve(output));
      });

      expect(generatorOptions().length).toBeGreaterThan(10);
      for (const option of generatorOptions()) {
        expect(help).toContain(`--${option.name}`);
      }
    });
  });
});
