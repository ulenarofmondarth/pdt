import config from '@util/config.js';
import { pfs } from '@util/runtime-config.js';
import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import winston from 'winston';

const logFilename = config.Logging.filename;

let logDirectory = pfs.pdtConfigDir ?? pfs.userDataDir;
let closing: Promise<void> | undefined;

/**
 * Appends each log line to the log file in the current log directory.
 *
 * Writes are synchronous. winston's own file transport buffers output and reports itself
 * finished before that output is on disk, so lines are lost if the process exits promptly.
 * A CLI logs little, so the cost of a synchronous append is not a concern.
 *
 * The file is only created when the first line is written.
 */
const logFile = new Writable({
  write(chunk: Buffer, _encoding, callback) {
    try {
      fs.mkdirSync(logDirectory, { recursive: true });
      fs.appendFileSync(path.join(logDirectory, logFilename), chunk);
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  },
});

const logger = winston.createLogger({
  level: config.Logging.level,
  transports: [
    new winston.transports.Stream({ stream: logFile }),
    new winston.transports.Console({
      format: winston.format.cli(),
    }),
  ],
});

/**
 * Send all further file output to the log file in another directory.
 *
 * The directory is otherwise chosen once, when this module loads. Use this when the
 * right place only comes into existence later, e.g. when a project is initialised.
 *
 * @param dir - Directory that will hold the log file
 */
export function setLogDirectory(dir: string): void {
  logDirectory = path.resolve(dir);
}

/**
 * Stop logging and wait until everything logged so far has been written.
 *
 * This is terminal: nothing can be logged afterwards. Safe to call more than once.
 */
export function closeLogger(): Promise<void> {
  closing ??= new Promise<void>(resolve => {
    logger.once('finish', () => resolve());
    logger.end();
  });

  return closing;
}

/**
 * Terminate the process once all log output has been written.
 *
 * Always use this in place of `process.exit()`, which can discard log output that is
 * still on its way through the logger.
 *
 * @param code - Process exit code
 */
export async function exit(code: number): Promise<never> {
  await closeLogger();
  process.exit(code);
}

export default logger;
