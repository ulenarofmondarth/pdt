import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yargs from 'yargs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import initCommand from '@/cli/cmds/init.js';
import PDT from '@/constants.js';
import logger, { setLogDirectory } from '@util/logger.js';
import { m } from '@i18n/messages.js';

const mocks = vi.hoisted(() => ({
  pfs: { userDataDir: '/unused', pdtConfigDir: undefined as string | undefined },
}));

vi.mock('@util/runtime-config.js', () => ({ pfs: mocks.pfs }));
vi.mock('@util/logger.js', async () => (await import('@tests/unit/mocks/logger.js')).createLoggerModuleMock());

function runInit(dir: string, force?: boolean) {
  return initCommand.handler({ _: ['init'], $0: 'pdt', dir, f: force });
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
    mocks.pfs.pdtConfigDir = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  describe('in a directory that is not yet a project', () => {
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

  describe('in a directory that is already a project', () => {
    beforeEach(() => {
      fs.mkdirSync(projectData);
      mocks.pfs.pdtConfigDir = projectData;
    });

    test('warns and leaves the project alone', async () => {
      fs.writeFileSync(path.join(projectData, 'keep.txt'), 'existing data');

      await runInit(project);

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        m['warn.alreadyExists']({ description: 'PDT data directory' }),
      );
      expect(fs.readdirSync(projectData)).toEqual(['keep.txt']);
      expect(logger.info).not.toHaveBeenCalled();
      expect(setLogDirectory).not.toHaveBeenCalled();
    });
  });

  describe('in a directory inside another project', () => {
    let nested: string;

    beforeEach(() => {
      nested = path.join(project, 'packages', 'inner');
      fs.mkdirSync(nested, { recursive: true });
      fs.mkdirSync(projectData);
      mocks.pfs.pdtConfigDir = projectData;
    });

    test('refuses, naming the parent project', async () => {
      await runInit(nested);

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(m['warn.pdtParentExists']({ path: project }));
      expect(fs.existsSync(path.join(nested, PDT.PROJECT_RTD_DIR_NAME))).toBe(false);
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
  });
});
