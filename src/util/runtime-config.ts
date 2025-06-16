import PDT from '@/constants.js';
import { findUpSync } from 'find-up';

/*
 * Look for the .pdt directory. Continue from CWD up to HOME (if on thesame path)
 */
function findConfig() {
  const dir = process.cwd();
  const home = process.env.HOME;

  return findUpSync(PDT.PROJECT_RTD_DIR_NAME, { cwd: dir, stopAt: home, type: 'directory' });
}

export const userDataDir =
  process.env.APPDATA ||
  (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');

export const fs = {
  pdtConfigDir: findConfig(),
} as const;
