import config from '@util/config.js';
import { pfs } from '@util/runtime-config.js';
import path from 'node:path';
import winston from 'winston';

const log_file = `${path.resolve(pfs.pdtConfigDir ?? pfs.userDataDir, String(config.get('Logging.filename')))}`;

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

process.on('exit', () => {
  logger.close();
});

export default logger;
