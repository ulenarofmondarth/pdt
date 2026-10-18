import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import winston from 'winston';
import defaults from '@/pdt-internal-config/default.json' with { type: 'json' };
import { m } from '@i18n/messages.js';

import type { Config } from '@schema/config.js';

let logFilename = defaults.Logging.filename;
/** No file output until a directory is set. */
let logDirectory: string | undefined;
/** Set once writing to the log file in the current directory has failed. */
let fileFailed = false;
let closing: Promise<void> | undefined;

/**
 * Appends each log line to the log file in the current log directory.
 *
 * Writes are synchronous. winston's own file transport buffers output and reports itself
 * finished before that output is on disk, so lines are lost if the process exits promptly.
 * A CLI logs little, so the cost of a synchronous append is not a concern.
 *
 * The file is only created when the first line is written. Until a directory is set, lines go to
 * the console only.
 *
 * A log file that cannot be written must not stop pdt, so a failure is reported once, on standard
 * error, and lines go to the console only until another directory is set. Passing the error on
 * would make it an unhandled 'error' event, which ends the process.
 */
const logFile = new Writable({
  write(chunk: Buffer, _encoding, callback) {
    if (logDirectory === undefined || fileFailed) {
      callback();
      return;
    }
    const file = path.join(logDirectory, logFilename);
    try {
      fs.mkdirSync(logDirectory, { recursive: true });
      fs.appendFileSync(file, chunk);
    } catch (error) {
      fileFailed = true;
      // Not through the logger: this is the logger failing.
      console.error(
        m['warn.logFileUnavailable']({ file, reason: error instanceof Error ? error.message : String(error) }),
      );
    }
    callback();
  },
});

const logger = winston.createLogger({
  level: defaults.Logging.level,
  transports: [
    new winston.transports.Stream({ stream: logFile }),
    new winston.transports.Console({
      format: winston.format.cli(),
    }),
  ],
});

/**
 * Apply the logging configuration: the level, and the name of the log file.
 *
 * Until this is called the logger uses the shipped defaults.
 *
 * @param settings - The `Logging` section of the configuration
 */
export function configureLogger({ level, filename }: Config['Logging']): void {
  logger.level = level;
  logFilename = filename;
}

/**
 * Send all further file output to the log file in another directory.
 *
 * pdt sets this as it starts. Set it again when the right place only comes into
 * existence later, e.g. when a project is initialised.
 *
 * @param dir - Directory that will hold the log file
 */
export function setLogDirectory(dir: string): void {
  logDirectory = path.resolve(dir);
  fileFailed = false;
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

export default logger;
