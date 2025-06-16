#!/usr/bin/env node
import logger from './logger.js';
import { parser } from './cli/parsers.js';

try {
  parser.parse(process.argv.slice(2), function (err: object, argv: unknown, output: string) {
    if (output) console.log(output);
    logger.debug(`Command: ${JSON.stringify(argv)}`);
  });
} catch (e) {
  logger.error((e as Error).message);
}
