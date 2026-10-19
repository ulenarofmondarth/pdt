/**
 * Starting and stopping a project's VTTs, for `pdt vtt start`, `stop` and `restart`.
 *
 * What pdt starts is recorded in the project's run state, so that later commands find it: `start`
 * to see that it is running already, `stop` and `restart` to stop it. Stopping removes what ran
 * the VTT, so each start begins afresh from the configuration.
 */
import path from 'node:path';
import { leaves } from '@util/config-keys.js';
import { FIRST_AUTO_PORT, findFreePort } from '@util/ports.js';
import { forgetRunningVtt, recordRunningVtt, runningVtt, runStateFile } from '@util/run-state.js';
import { m } from '@i18n/messages.js';

import type { CommandContext } from '../../context.js';
import type VTTServer from '@lib/VTT/VTTServer.js';
import type { VttSettings } from '@schema/config.js';

/** A VTT of the project a command is run in, ready to start or stop. */
interface ProjectVtt {
  name: string;
  settings: VttSettings;
  server: VTTServer;
  /** The project's run state file. */
  runState: string;
  /** The project's root directory. */
  root: string;
}

/**
 * The name of the VTT to work on: the one given, or else the first the project's configuration
 * sets, or else the first configured at all.
 *
 * @throws {Error} When no VTT is configured, or the one given is not
 */
export function chooseVtt({ config, sourceOf }: Pick<CommandContext, 'config' | 'sourceOf'>, given?: string): string {
  const known = Object.keys(config.VTT);
  if (known.length === 0) throw new Error(m['error.vtt.noneConfigured']());
  if (given !== undefined) {
    if (!Object.hasOwn(config.VTT, given)) {
      throw new Error(m['error.vtt.unknownVtt']({ vtt: given, known: known.join(', ') }));
    }
    return given;
  }
  const fromProject = (name: string) =>
    leaves(config.VTT[name], ['VTT', name]).some(({ key }) => {
      const source = sourceOf(key);
      return source === 'project' || source === 'project-secrets';
    });
  // `known` is not empty, so there is a first.
  return known.find(fromProject) ?? (known[0] as string);
}

/**
 * What the VTT runs as on its host, such as its container's name: `pdt-<project>`, for the VTT
 * named after its project, or `pdt-<project>-<vtt>`. Characters a container name cannot have
 * become `-`.
 */
export function instanceName(project: string, vtt: string): string {
  return (project === vtt ? `pdt-${vtt}` : `pdt-${project}-${vtt}`).replace(/[^a-zA-Z0-9_.-]/g, '-');
}

/**
 * The VTT a command is for (see {@link chooseVtt}), in the project the command is run in.
 *
 * @throws {Error} When not in a project, or no VTT can be chosen
 */
function projectVtt(context: CommandContext, given: string | undefined): ProjectVtt {
  const pdtPath = context.paths.pdtConfigDir;
  if (pdtPath === undefined) throw new Error(m['error.notInPdtProject']());
  const name = chooseVtt(context, given);
  const settings = context.config.VTT[name] as VttSettings;
  return {
    name,
    settings,
    server: context.createVtt(name, settings),
    runState: runStateFile(pdtPath),
    root: path.dirname(pdtPath),
  };
}

/** @throws {Error} When the VTT's host cannot be reached */
async function assertHostAccessible({ name, settings, server }: ProjectVtt) {
  if (!(await server.host.isAccessible())) {
    throw new Error(m['error.vtt.hostUnreachable']({ vtt: name, type: settings.host.type }));
  }
}

/**
 * The port the VTT is to serve on: the first free one for `auto`, or the one it is set to.
 *
 * @throws {Error} When no port is free, or the one set is taken
 */
async function portFor({ name, settings }: ProjectVtt, isPortFree: CommandContext['isPortFree']): Promise<number> {
  const { port } = settings.server;
  if (port === 'auto') return findFreePort(FIRST_AUTO_PORT, isPortFree);
  if (!(await isPortFree(port))) throw new Error(m['error.vtt.portInUse']({ vtt: name, port }));
  return port;
}

/** Start `vtt`, unless it is running, and record it in the project's run state. */
async function start(vtt: ProjectVtt, { config, log, out, isPortFree }: CommandContext) {
  const { name, server, runState, root } = vtt;
  const running = runningVtt(runState, name);
  if (running !== undefined) {
    if (await server.host.isRunning(running)) {
      out(m['info.vtt.alreadyRunning']({ vtt: name, url: running.url }));
      return;
    }
    // It stopped without pdt, so clear up what is left of it.
    log.info(m['info.vtt.stoppedOnItsOwn']({ vtt: name }));
    await server.host.stop(running);
    forgetRunningVtt(runState, name);
  }

  const port = await portFor(vtt, isPortFree);
  const instance = instanceName(config.id ?? path.basename(root), name);
  out(m['info.vtt.starting']({ vtt: name, version: server.version, port }));
  const { id } = await server.start({ name: instance, port });
  const url = server.urlAt(port);
  recordRunningVtt(runState, name, { id, name: instance, port, url, started: new Date().toISOString() });
  out(m['info.vtt.started']({ vtt: name, url }));
}

/** Stop `vtt`, if the project's run state records it, and forget it. */
async function stop({ name, server, runState }: ProjectVtt, { out }: CommandContext) {
  const running = runningVtt(runState, name);
  if (running === undefined) {
    out(m['info.vtt.notRunning']({ vtt: name }));
    return;
  }
  out(m['info.vtt.stopping']({ vtt: name }));
  await server.host.stop(running);
  forgetRunningVtt(runState, name);
  out(m['info.vtt.stopped']({ vtt: name }));
}

/**
 * Start a VTT of the project, and wait until it has started. A VTT that is running already is left
 * alone.
 *
 * @param given - The VTT's name; see {@link chooseVtt} for when none is given
 * @throws {Error} When not in a project, the VTT is not configured, its host cannot be reached, no
 *   port can be had, or the host cannot start it
 */
export async function startVtt(context: CommandContext, given: string | undefined) {
  const vtt = projectVtt(context, given);
  await assertHostAccessible(vtt);
  await start(vtt, context);
}

/**
 * Stop a VTT of the project, and wait until it has stopped. A VTT pdt has no record of starting is
 * left alone.
 *
 * @param given - The VTT's name; see {@link chooseVtt} for when none is given
 * @throws {Error} When not in a project, the VTT is not configured, its host cannot be reached, or
 *   the host cannot stop it
 */
export async function stopVtt(context: CommandContext, given: string | undefined) {
  const vtt = projectVtt(context, given);
  if (runningVtt(vtt.runState, vtt.name) !== undefined) await assertHostAccessible(vtt);
  await stop(vtt, context);
}

/**
 * Stop a VTT of the project, if it is running, then start it again from its configuration.
 *
 * @param given - The VTT's name; see {@link chooseVtt} for when none is given
 * @throws {Error} As {@link stopVtt} and {@link startVtt} do
 */
export async function restartVtt(context: CommandContext, given: string | undefined) {
  const vtt = projectVtt(context, given);
  await assertHostAccessible(vtt);
  await stop(vtt, context);
  await start(vtt, context);
}
