import config from '@util/config.js';
import path from 'node:path';
import winston from 'winston';

const __dirname = import.meta.dirname;

const log_file = `${path.resolve(__dirname, String(config.get('Logging.filename')))}`;

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

export default logger;
