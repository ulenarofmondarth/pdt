import fs from 'node:fs';
import path from 'node:path';
import PDT from '@/constants.js';
import { isPdtProject, registeredProject, registerProject, runStateFile } from '@util/run-state.js';
import { m } from '@i18n/messages.js';
import { UsageError } from '../usage-error.js';
import { runningProjectVtts, startVtt, stopAllVtts } from './vtt_cmds/lifecycle.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../context.js';

interface MoveArgs {
  destination: string | undefined;
  'stop-all-containers': boolean;
  'restart-all-containers': boolean;
}

/** Whether `child` is `parent`, or inside it. */
function isWithin(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || !(relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

/**
 * Move the directory `from` to `to`, which must not exist. Within a filesystem this is a rename;
 * across filesystems the directory is copied, then removed.
 */
export function relocate(from: string, to: string) {
  try {
    fs.renameSync(from, to);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
  }
  try {
    fs.cpSync(from, to, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true, errorOnExist: true });
  } catch (error) {
    // Leave nothing half copied; the project is still where it was.
    fs.rmSync(to, { recursive: true, force: true });
    throw error;
  }
  fs.rmSync(from, { recursive: true, force: true });
}

/**
 * Where to move the project at `root` to, from the destination the user gave.
 *
 * @throws {UsageError} When the destination exists, its parent directory does not, or it is inside
 *   the project
 */
function destinationFor(given: string, root: string, cwd: string): string {
  const destination = path.resolve(cwd, given);
  if (fs.existsSync(destination)) throw new UsageError(m['error.move.destinationExists']({ path: destination }));
  const parent = path.dirname(destination);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
    throw new UsageError(m['error.move.noParent']({ path: parent }));
  }
  if (isWithin(destination, root)) throw new UsageError(m['error.move.intoItself']({ path: destination }));
  return destination;
}

/**
 * `pdt move [destination]`: keep the user's run state up to date with where the project is.
 *
 * Without a destination, the project has been moved already, and its registration is updated to
 * where it is now. With one, the project is moved there first.
 *
 * A running VTT has the project at its old place, so `move` refuses while one runs, unless told to
 * stop them all first, or to stop them and start them again once the project is where it belongs.
 */
export function createMoveCommand(context: CommandContext): CommandModule<object, MoveArgs> {
  const { paths, config, sourceOf, log, out } = context;
  return {
    command: 'move [destination]',

    describe: m['ui.cmd.move.description'](),

    builder: yargs =>
      yargs
        .positional('destination', { describe: m['ui.cmd.move.destination'](), type: 'string' })
        .option('stop-all-containers', {
          describe: m['ui.cmd.move.stopAllContainers'](),
          type: 'boolean',
          default: false,
        })
        .option('restart-all-containers', {
          describe: m['ui.cmd.move.restartAllContainers'](),
          type: 'boolean',
          default: false,
        }),

    async handler(argv) {
      log.debug(m['debug.running']({ argv: JSON.stringify(argv) }));
      const pdtPath = paths.pdtConfigDir;
      if (pdtPath === undefined) throw new Error(m['error.notInPdtProject']());
      const root = path.dirname(pdtPath);
      // Only the project's own file says what the project's id is.
      const id = sourceOf(['id']) === 'project' ? config.id : undefined;
      if (id === undefined) throw new Error(m['error.move.noId']());

      const file = runStateFile(paths.userDataDir);
      const registered = registeredProject(file, id);
      const registeredHere = registered !== undefined && path.resolve(registered.root) === root;
      if (registered !== undefined && !registeredHere && isPdtProject(registered.root)) {
        throw new Error(m['error.move.stillAProject']({ id, root: registered.root, file }));
      }

      const stopAll = argv['stop-all-containers'];
      const restartAll = argv['restart-all-containers'];
      if (stopAll && restartAll) throw new UsageError(m['error.move.stopOrRestart']());
      const destination =
        argv.destination === undefined ? undefined : destinationFor(argv.destination, root, paths.cwd);

      // Nothing has changed yet, so a VTT that is running can stop the move.
      const running = await runningProjectVtts(context);
      if (running.length > 0) {
        if (!stopAll && !restartAll) throw new Error(m['error.move.vttsRunning']({ vtts: running.join(', ') }));
        await stopAllVtts(context);
      }
      const at = destination ?? root;
      // Started again from where the project now is, so that they find it there.
      const restart = async () => {
        if (!restartAll) return;
        const moved = { ...context, paths: { ...paths, pdtConfigDir: path.join(at, PDT.PROJECT_RTD_DIR_NAME) } };
        for (const name of running.filter(vtt => Object.hasOwn(config.VTT, vtt))) await startVtt(moved, name);
      };

      if (destination === undefined) {
        if (registeredHere) {
          out(m['info.move.unchanged']({ id, root }));
        } else {
          registerProject(file, id, root);
          out(m['info.move.registered']({ id, root, file }));
        }
        await restart();
        return;
      }

      relocate(root, destination);
      registerProject(file, id, destination);
      // The log was in the project; it goes with it.
      log.setDirectory(path.join(destination, PDT.PROJECT_RTD_DIR_NAME));
      out(m['info.move.moved']({ id, from: root, to: destination }));

      // pdt cannot change the directory of the shell that started it, so say where to go.
      if (isWithin(paths.cwd, root)) {
        out(m['info.move.changeDirectory']({ dir: path.join(destination, path.relative(root, paths.cwd)) }));
      }
      await restart();
    },
  };
}
