import fs from 'node:fs';
import path from 'node:path';
import PDT from '@/constants.js';
import { isPdtProject, registeredProject, registerProject, runStateFile } from '@util/run-state.js';
import { m } from '@i18n/messages.js';
import { UsageError } from '../usage-error.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../context.js';

interface MoveArgs {
  destination: string | undefined;
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
 */
export function createMoveCommand({
  paths,
  config,
  sourceOf,
  log,
  out,
}: CommandContext): CommandModule<object, MoveArgs> {
  return {
    command: 'move [destination]',

    describe: m['ui.cmd.move.description'](),

    builder: yargs => yargs.positional('destination', { describe: m['ui.cmd.move.destination'](), type: 'string' }),

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

      if (argv.destination === undefined) {
        if (registeredHere) {
          out(m['info.move.unchanged']({ id, root }));
          return;
        }
        registerProject(file, id, root);
        out(m['info.move.registered']({ id, root, file }));
        return;
      }

      const destination = destinationFor(argv.destination, root, paths.cwd);
      relocate(root, destination);
      registerProject(file, id, destination);
      // The log was in the project; it goes with it.
      log.setDirectory(path.join(destination, PDT.PROJECT_RTD_DIR_NAME));
      out(m['info.move.moved']({ id, from: root, to: destination }));

      // pdt cannot change the directory of the shell that started it, so say where to go.
      if (isWithin(paths.cwd, root)) {
        out(m['info.move.changeDirectory']({ dir: path.join(destination, path.relative(root, paths.cwd)) }));
      }
    },
  };
}
