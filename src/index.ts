#!/usr/bin/env node
import os from 'node:os';
import { main } from './main.js';
import { closeLogger } from '@util/logger.js';
import { canPrompt, terminalPrompter } from '@util/prompt.js';
import { resolvePaths } from '@util/runtime-config.js';

process.exitCode = await main(process.argv.slice(2), {
  paths: resolvePaths({ cwd: process.cwd(), home: os.homedir(), platform: process.platform, env: process.env }),
  env: process.env,
  out: text => console.log(text),
  err: text => console.error(text),
  ...(canPrompt() ? { prompter: terminalPrompter } : {}),
});

// The process ends by itself once everything is written. process.exit() would cut off output still
// on its way to a pipe, such as `pdt --help | less`.
await closeLogger();
