#!/usr/bin/env node
import { main } from './main.js';
import { closeLogger } from '@util/logger.js';
import { pfs } from '@util/runtime-config.js';

process.exitCode = await main(process.argv.slice(2), {
  paths: pfs,
  env: process.env,
  out: text => console.log(text),
  err: text => console.error(text),
});

// The process ends by itself once everything is written. process.exit() would cut off output still
// on its way to a pipe, such as `pdt --help | less`.
await closeLogger();
