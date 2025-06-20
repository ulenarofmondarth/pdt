#!/usr/bin/env node
import { prettyData } from '@util/diagnostic.js';
import logger from '@util/logger.js';
import { parser } from './cli/parsers.js';

try {
  parser.parse(process.argv.slice(2), function (err: object, argv: unknown, output: string) {
    if (output) {
      console.log(output);
    }
    logger.debug(
      `Parser callback:\nerr =\n${prettyData(err)}\n\nargv =\n${prettyData(argv)}\n\noutput = \n"${output}"`,
    );
  });
} catch (e) {
  logger.error((e as Error).message);
}
