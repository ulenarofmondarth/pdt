#!/usr/bin/env node
import { Arguments } from 'yargs';
import { prettyData } from '@util/diagnostic.js';
import logger from '@util/logger.js';
import { parser } from './cli/parsers.js';

try {
  parser.parseSync(process.argv.slice(2), function (err: object, argv: Arguments, output: string) {
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
