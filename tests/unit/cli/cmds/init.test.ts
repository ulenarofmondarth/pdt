import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yargs from 'yargs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import initCommand from '@/cli/cmds/init.js';
import PDT from '@/constants.js';
import { createModule } from '@lib/ModuleGenerator.js';
import logger, { setLogDirectory } from '@util/logger.js';
import { terminalPrompter } from '@util/prompt.js';
import { m } from '@i18n/messages.js';

const mocks = vi.hoisted(() => ({
  pfs: { userDataDir: '/unused', pdtConfigDir: undefined as string | undefined },
  canPrompt: vi.fn(() => true),
}));

// No test may run the real generator or wait on a real terminal.
vi.mock('@lib/ModuleGenerator.js', async importOriginal => ({
  ...(await importOriginal<typeof import('@lib/ModuleGenerator.js')>()),
  createModule: vi.fn(),
}));
vi.mock('@util/prompt.js', () => ({ canPrompt: mocks.canPrompt, terminalPrompter: { name: 'terminal prompter' } }));

vi.mock('@util/runtime-config.js', () => ({ pfs: mocks.pfs }));
vi.mock('@util/logger.js', async () => (await import('@tests/unit/mocks/logger.js')).createLoggerModuleMock());

function runInit(dir: string, force?: boolean, more: Record<string, unknown> = {}) {
  return initCommand.handler({ _: ['init'], $0: 'pdt', dir, f: force, ...more });
}

describe('init command', () => {
  let sandbox: string;
  let project: string;
  let projectData: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-init-'));
    project = path.join(sandbox, 'project');
    projectData = path.join(project, PDT.PROJECT_RTD_DIR_NAME);
    fs.mkdirSync(project);
    // An existing project has content; an empty directory is a different case, covered below.
    fs.writeFileSync(path.join(project, 'package.json'), '{}');
    mocks.pfs.pdtConfigDir = undefined;
    mocks.canPrompt.mockReturnValue(true);
    vi.mocked(createModule).mockResolvedValue({ destination: project, files: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  describe('in a directory that is not yet a project', () => {
    test('does not create a new module', async () => {
      await runInit(project);

      expect(createModule).not.toHaveBeenCalled();
      expect(fs.readdirSync(project).sort()).toEqual([PDT.PROJECT_RTD_DIR_NAME, 'package.json']);
    });

    describe('when new module options are given', () => {
      test('warns that no module is generated, naming the options', async () => {
        await runInit(project, undefined, { moduleId: 'given-id', gitInit: false, y: true });

        expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
          m['warn.moduleNotGenerated']({ path: project, options: '--module-id, --no-git-init, --yes' }),
        );
        expect(createModule).not.toHaveBeenCalled();
      });

      test('names a yes or no option that was turned on without the no- prefix', async () => {
        await runInit(project, undefined, { install: true });

        expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
          m['warn.moduleNotGenerated']({ path: project, options: '--install' }),
        );
      });

      test('warns for --yes on its own', async () => {
        await runInit(project, undefined, { y: true });

        expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
          m['warn.moduleNotGenerated']({ path: project, options: '--yes' }),
        );
      });

      test('still makes the directory a project', async () => {
        await runInit(project, undefined, { moduleId: 'given-id' });

        expect(fs.statSync(projectData).isDirectory()).toBe(true);
        expect(logger.info).toHaveBeenCalledExactlyOnceWith(m['info.pdtInitialised']({ path: project }));
      });
    });

    test('does not warn about --force, which is not a new module option', async () => {
      await runInit(project, true);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('creates the project data directory', async () => {
      await runInit(project);

      expect(fs.statSync(projectData).isDirectory()).toBe(true);
    });

    test('reports that the project was initialised', async () => {
      await runInit(project);

      expect(logger.info).toHaveBeenCalledExactlyOnceWith(m['info.pdtInitialised']({ path: project }));
      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('moves the log to the new project before reporting', async () => {
      await runInit(project);

      expect(setLogDirectory).toHaveBeenCalledExactlyOnceWith(projectData);
      expect(vi.mocked(setLogDirectory).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(logger.info).mock.invocationCallOrder[0]!,
      );
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
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      // Stand in for the generator: it creates the destination and writes the module into it.
      vi.mocked(createModule).mockImplementation(async (destination, options) => {
        fs.mkdirSync(destination, { recursive: true });
        fs.writeFileSync(path.join(destination, 'module.json'), '{}');
        options?.onStep?.('wrote 1 files');
        return { destination, files: ['module.json'] };
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('creates a new module there, asking in the terminal', async () => {
      await runInit(fresh);

      expect(logger.warn).not.toHaveBeenCalled();
      expect(createModule).toHaveBeenCalledExactlyOnceWith(fresh, {
        given: {},
        prompter: terminalPrompter,
        onStep: expect.any(Function),
      });
      expect(fs.existsSync(path.join(fresh, 'module.json'))).toBe(true);
    });

    test('passes on the answers given as options, and nothing else from the command line', async () => {
      await runInit(fresh, undefined, { moduleId: 'given-id', 'module-id': 'given-id', gitInit: false, y: undefined });

      expect(vi.mocked(createModule).mock.calls[0]![1]).toMatchObject({
        given: { moduleId: 'given-id', gitInit: false },
      });
    });

    test('does not ask when told not to with --yes', async () => {
      await runInit(fresh, undefined, { y: true, yes: true, moduleId: 'given-id' });

      expect(logger.warn).not.toHaveBeenCalled();

      expect(vi.mocked(createModule).mock.calls[0]![1]).not.toHaveProperty('prompter');
    });

    test('does not ask when there is no terminal to ask in', async () => {
      mocks.canPrompt.mockReturnValue(false);

      await runInit(fresh);

      expect(vi.mocked(createModule).mock.calls[0]![1]).not.toHaveProperty('prompter');
      expect(fs.statSync(freshData).isDirectory()).toBe(true);
    });

    test('makes the new module a project only after it has been generated', async () => {
      const generate = vi.mocked(createModule).getMockImplementation()!;
      let dataExistedDuringGeneration: boolean | undefined;
      vi.mocked(createModule).mockImplementation(async (...args) => {
        dataExistedDuringGeneration = fs.existsSync(freshData);
        return generate(...args);
      });

      await runInit(fresh);

      expect(dataExistedDuringGeneration).toBe(false);
      expect(fs.statSync(freshData).isDirectory()).toBe(true);
      expect(setLogDirectory).toHaveBeenCalledExactlyOnceWith(freshData);
      expect(logger.info).toHaveBeenCalledExactlyOnceWith(m['info.pdtInitialised']({ path: fresh }));
    });

    test("tells the user what it is doing and shows the generator's progress", async () => {
      await runInit(fresh);

      expect(vi.mocked(console.log).mock.calls.flat()).toEqual([
        m['info.creatingModule']({ path: fresh }),
        '✔ wrote 1 files',
      ]);
    });

    test("fails with the generator's error and does not make a project", async () => {
      vi.mocked(createModule).mockRejectedValue(new Error('Invalid moduleId'));

      await expect(runInit(fresh)).rejects.toThrow('Invalid moduleId');

      expect(fs.existsSync(freshData)).toBe(false);
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('in a directory that is already a project', () => {
    beforeEach(() => {
      fs.mkdirSync(projectData);
      mocks.pfs.pdtConfigDir = projectData;
    });

    test('warns and leaves the project alone', async () => {
      fs.writeFileSync(path.join(projectData, 'keep.txt'), 'existing data');
      fs.rmSync(path.join(project, 'package.json'));

      await runInit(project);

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        m['warn.alreadyExists']({ description: 'PDT data directory' }),
      );
      expect(fs.readdirSync(projectData)).toEqual(['keep.txt']);
      expect(logger.info).not.toHaveBeenCalled();
      expect(setLogDirectory).not.toHaveBeenCalled();
      // Even though nothing but the data directory is there, it is not treated as empty.
      expect(createModule).not.toHaveBeenCalled();
    });

    test('also warns that no module is generated when new module options are given', async () => {
      await runInit(project, undefined, { uiFramework: 'lit' });

      expect(vi.mocked(logger.warn).mock.calls.flat()).toEqual([
        m['warn.moduleNotGenerated']({ path: project, options: '--ui-framework' }),
        m['warn.alreadyExists']({ description: 'PDT data directory' }),
      ]);
    });
  });

  describe('in a directory inside another project', () => {
    let nested: string;

    beforeEach(() => {
      nested = path.join(project, 'packages', 'inner');
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, 'package.json'), '{}');
      fs.mkdirSync(projectData);
      mocks.pfs.pdtConfigDir = projectData;
    });

    test('refuses, naming the parent project', async () => {
      await runInit(nested);

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(m['warn.pdtParentExists']({ path: project }));
      expect(fs.existsSync(path.join(nested, PDT.PROJECT_RTD_DIR_NAME))).toBe(false);
    });

    test('refuses before creating a module, even when the directory is empty', async () => {
      fs.rmSync(path.join(nested, 'package.json'));

      await runInit(nested);

      expect(createModule).not.toHaveBeenCalled();
      expect(fs.readdirSync(nested)).toEqual([]);
    });

    test('creates the nested project when forced', async () => {
      await runInit(nested, true);

      expect(fs.statSync(path.join(nested, PDT.PROJECT_RTD_DIR_NAME)).isDirectory()).toBe(true);
      expect(logger.info).toHaveBeenCalledExactlyOnceWith(m['info.pdtInitialised']({ path: nested }));
    });
  });

  describe('arguments', () => {
    /** Parse a command line against the command's own builder, without running its handler. */
    function parse(commandLine: string): Promise<Record<string, unknown>> {
      return new Promise((resolve, reject) => {
        yargs()
          .command({ ...initCommand, handler: argv => resolve(argv) })
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
          .command(initCommand)
          .parse('init --help', (_err: unknown, _argv: unknown, output: string) => resolve(output));
      });

      expect(generatorOptions().length).toBeGreaterThan(10);
      for (const option of generatorOptions()) {
        expect(help).toContain(`--${option.name}`);
      }
    });
  });
});
