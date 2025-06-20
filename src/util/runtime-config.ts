import PDT from '@/constants.js';
import { findUpSync } from 'find-up';

export class RTCError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RTCError';
  }
}

/*
 * Look for the .pdt directory. Continue from CWD up to HOME (if on thesame path)
 */
function findConfig(): string | undefined {
  const dir = process.cwd();
  const home = process.env.HOME;

  const pdtRoot = findUpSync(PDT.PROJECT_RTD_DIR_NAME, { cwd: dir, stopAt: home, type: 'directory' });

  return pdtRoot;
}

const userDataDir =
  process.env.APPDATA ||
  (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');

export const fs = {
  userDataDir,
  pdtConfigDir: findConfig(),
} as const;
