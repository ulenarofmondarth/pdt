import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The built command line. */
export const CLI = path.resolve('dist/index.js');

/** How a run of pdt ended. */
export interface PdtRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Directory to run in; the sandbox's work directory by default. */
  cwd?: string;
  /** Environment variables, in addition to PATH and HOME. */
  env?: Record<string, string>;
}

/**
 * A home directory and a work directory of its own, so that pdt reads and writes nothing of the
 * person running the tests.
 */
export class Sandbox {
  readonly root = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-cli-'));
  readonly home = path.join(this.root, 'home');
  readonly work = path.join(this.root, 'work');

  constructor() {
    fs.mkdirSync(this.home);
    fs.mkdirSync(this.work);
  }

  /** Where pdt looks for the user's configuration, unless XDG_CONFIG_HOME says otherwise. */
  get userConfigDir() {
    return path.join(this.home, '.config', 'pdt');
  }

  /** Where pdt keeps the user's data and, outside a project, its log. */
  get userDataDir() {
    return path.join(this.home, '.local', 'share', 'pdt');
  }

  /** Write a JSON file, creating its directory. */
  writeJson(file: string, content: unknown) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(content));
  }

  /** The messages in a log file, or none if there is no file. */
  logged(file: string): string[] {
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(line => line !== '')
      .map(line => (JSON.parse(line) as { message: string }).message);
  }

  /**
   * Run pdt with only PATH and HOME from the environment, and no terminal to ask questions on.
   */
  run(args: readonly string[], { cwd = this.work, env = {} }: RunOptions = {}): Promise<PdtRun> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CLI, ...args], {
        cwd,
        env: { PATH: process.env.PATH ?? '', HOME: this.home, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
      child.on('error', reject);
      child.on('close', code => resolve({ code, stdout, stderr }));
    });
  }

  remove() {
    fs.rmSync(this.root, { recursive: true, force: true });
  }
}
