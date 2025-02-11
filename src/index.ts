#!/usr/bin/env node
import logger from './logger';
import { parser } from './cli/parsers';

logger.warn('my test');

const argv = parser.parse(process.argv.slice(2));

logger.end();
