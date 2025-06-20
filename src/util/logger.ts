import config from '@util/config.js';
import { fs } from '@util/runtime-config.js';
import path from 'node:path';
import winston from 'winston';
import { m } from '@i18n/messages.js';

const log_file = `${path.resolve(fs.pdtConfigDir ?? process.cwd(), String(config.get('Logging.filename')))}`;

const logger = winston.createLogger({
  level: config.get('Logging.level'),
  transports: [
    new winston.transports.File({
      filename: log_file,
    }),
    new winston.transports.Console({
      format: winston.format.cli(),
    }),
  ],
});

if (fs.pdtConfigDir === undefined) {
  logger.warn(m['warn.noPdtRoot']());
}

process.on('exit', () => {
  logger.close();
});

export default logger;
