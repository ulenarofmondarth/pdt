import PDT from '@/constants.js';
import path from 'node:path';
import fs from 'node:fs';
import { findUpSync } from 'find-up';

export class RTCError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RTCError';
  }
}

/**
 * Look for the .pdt directory. Continue from CWD up to HOME (if on thesame path)
 *
 * @returns Path to config
 */
function findConfig(): string | undefined {
  const dir = process.cwd();
  const home = process.env.HOME;

  const pdtRoot = findUpSync(PDT.PROJECT_RTD_DIR_NAME, { cwd: dir, stopAt: home, type: 'directory' });

  return pdtRoot;
}

const userDataDir = path.join(
  process.env.APPDATA ||
    (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share'),
  PDT.PROGRAM_NAME,
);

if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

export const pfs = {
  userDataDir,
  pdtConfigDir: findConfig(),
} as const;
