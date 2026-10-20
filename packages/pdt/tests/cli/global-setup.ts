import fs from 'node:fs';
import { CLI } from './pdt.js';

/** The CLI tests run the build; without one, every test would fail for the same reason. */
export default function checkBuild() {
  if (!fs.existsSync(CLI)) {
    throw new Error(`${CLI} does not exist. Run \`pnpm build\` before \`pnpm test:cli\`.`);
  }
}
