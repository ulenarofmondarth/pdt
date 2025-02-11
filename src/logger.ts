import PDT from '@/constants';
import winston from 'winston';
import path from 'node:path';

const userdatadir =
  process.env.APPDATA ||
  (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');
const current_config_dir = process.env.NODE_CONFIG_DIR || `${path.join(__dirname, PDT.CONF_DIR)}`;
process.env.NODE_CONFIG_DIR = `${path.join(userdatadir, PDT.PROGRAM_NAME)}${path.delimiter}${current_config_dir}`;
import config from 'config';

const log_file = String(config.get('Logging.filename'));

const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.File({
      filename: log_file,
    }),
    new winston.transports.Console({
      level: 'warn',
      format: winston.format.cli(),
    }),
  ],
});

export default logger;
