import { UsageError } from '../../usage-error.js';
import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../../context.js';

interface StartArgs {
  vtt: string | undefined;
}

/**
 * The name of the VTT to start: the one given, or the only one configured.
 *
 * @throws When no VTT is configured
 * @throws {UsageError} When none is given and several are configured
 */
function vttName(given: string | undefined, known: readonly string[]): string {
  if (known.length === 0) throw new Error(m['error.vtt.noneConfigured']());
  if (given !== undefined) return given;
  const [only, ...others] = known;
  if (only === undefined || others.length > 0)
    throw new UsageError(m['error.vtt.nameRequired']({ known: known.join(', ') }));
  return only;
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

    builder: yargs => yargs.positional('vtt', { describe: m['ui.cmd.arg.vtt.description'](), type: 'string' }),

    /**
     * Start the VTT, and wait until it is running. A VTT that is already running is left alone.
     *
     * @throws When no VTT, or not this one, is configured, its host cannot be reached, or the host
     *   cannot start it
     * @throws {UsageError} When no VTT is named and several are configured
     */
    async handler(argv) {
      log.debug(m['debug.running']({ argv: JSON.stringify(argv) }));

      const known = Object.keys(config.VTT);
      const name = vttName(argv.vtt, known);
      const settings = config.VTT[name];
      if (settings === undefined) {
        throw new Error(m['error.vtt.unknownVtt']({ vtt: name, known: known.join(', ') }));
      }

      const server = createVtt(name, settings);
      // Asked first, so that an engine that is not running is reported as such, not as a failed start.
      if (!(await server.host.isAccessible())) {
        throw new Error(m['error.vtt.hostUnreachable']({ vtt: name, type: settings.host.type }));
      }
      if (await server.isRunning()) {
        out(m['info.vtt.alreadyRunning']({ vtt: name }));
        return;
      }

      out(m['info.vtt.starting']({ vtt: name, version: server.version }));
      await server.start();
      out(m['info.vtt.started']({ vtt: name }));
    },
  };
}
