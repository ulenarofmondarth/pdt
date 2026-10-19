import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../../context.js';

interface StartArgs {
  vtt: string;
}

/** `pdt vtt start`: start one of the project's VTTs. */
export function createVttStartCommand({
  config,
  log,
  out,
  createVtt,
}: CommandContext): CommandModule<object, StartArgs> {
  return {
    command: 'start [vtt] [options]',

    describe: m['ui.cmd.start.description'](),

    builder: yargs =>
      yargs.positional('vtt', { describe: m['ui.cmd.arg.vtt.description'](), type: 'string', default: 'prj' }),

    /**
     * Start the VTT, and wait until it is running. A VTT that is already running is left alone.
     *
     * @throws When the VTT is not configured, its host cannot be reached, or the host cannot start it
     */
    async handler(argv) {
      log.debug(m['debug.running']({ argv: JSON.stringify(argv) }));

      const settings = config.VTT[argv.vtt];
      if (settings === undefined) {
        throw new Error(m['error.vtt.unknownVtt']({ vtt: argv.vtt, known: Object.keys(config.VTT).join(', ') }));
      }

      const server = createVtt(argv.vtt, settings);
      // Asked first, so that an engine that is not running is reported as such, not as a failed start.
      if (!(await server.host.isAccessible())) {
        throw new Error(m['error.vtt.hostUnreachable']({ vtt: argv.vtt, type: settings.host.type }));
      }
      if (await server.isRunning()) {
        out(m['info.vtt.alreadyRunning']({ vtt: argv.vtt }));
        return;
      }

      out(m['info.vtt.starting']({ vtt: argv.vtt, version: server.version }));
      await server.start();
      out(m['info.vtt.started']({ vtt: argv.vtt }));
    },
  };
}
