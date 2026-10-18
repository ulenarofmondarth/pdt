# Logging

Logging is provided using [winston](https://www.npmjs.com/package/winston) via the `@util/logger.ts` module.

Simply:

```typescript
import logger from '@util/logger.js';
```

Then use `logger.info()` etc.

Every message goes to the console and to the log file. Only messages at or above the configured level are output; the default level is `warn`. Set the `PDT_LOG_LEVEL` environment variable (for example to `debug`) to see more.

## Where the log file is

The log file is named by the `Logging.filename` configuration entry (`pdt.log` by default). `main()` chooses its directory as {{pdt}} starts:

- inside a {{pdt}} project it is the project's `.pdt` directory;
- anywhere else it is the user data directory (`~/.local/share/pdt` on Linux).

The file is created when the first message is written, so a run that logs nothing leaves no file behind.

Loading the logger reads no configuration. It starts with the shipped defaults and writes to the console only; `main()` then applies the configuration with `configureLogger()` and sets the directory with `setLogDirectory()`.

If the right directory only comes into existence during a run, call `setLogDirectory()` once it exists. `pdt init` does this so that its messages land in the project it has just created:

```typescript
import logger, { setLogDirectory } from '@util/logger.js';

setLogDirectory(pdtPath);
logger.info('This goes to the new project log.');
```

## Ending the process

Nothing in {{pdt}} calls `process.exit()`. A command that fails throws (or rejects); `main()` logs the error's message and returns the exit code, and `src/index.ts` sets `process.exitCode` and calls `closeLogger()`, which waits until everything logged has been written. The process then ends by itself. `process.exit()` would cut off output still on its way to a pipe, such as `pdt --help | less`.

`closeLogger()` is terminal: nothing can be logged afterwards.

Log lines are appended to the file synchronously. winston's own file transport was not used because it reports itself finished before its output is on disk, which loses messages when the process exits promptly.

If the log file cannot be written (for example, its directory cannot be created), {{pdt}} says so once on standard error and carries on, logging to the console only, until another directory is set. A failed write is never passed on as an error: it would be an unhandled `'error'` event, which ends the process.
