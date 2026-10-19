/**
 * Starting and stopping a project's VTTs, for `pdt vtt start`, `stop` and `restart`, and for the
 * commands that must stop them first, `force-reset` and `move`.
 *
 * What pdt starts is recorded in the project's run state, so that later commands find it: `start`
 * to see that it is running already, `stop` and `restart` to stop it. Stopping removes what ran
 * the VTT, so each start begins afresh from the configuration. The VTT's data is kept, in the
 * user's data directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { leaves } from '@util/config-keys.js';
import { FIRST_AUTO_PORT, findFreePort } from '@util/ports.js';
import { waitUntilReachable } from '@util/reachable.js';
import { forgetRunningVtt, readRunState, recordRunningVtt, runningVtt, runStateFile } from '@util/run-state.js';
import { m } from '@i18n/messages.js';

import type { CommandContext } from '../../context.js';
import type { Mount } from '@lib/VTT/VTTHost.js';
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
 * Where the VTT `instance` keeps its data: in the user's data directory, outside the project, as
 * the project itself is given to the VTT as a module, and a VTT's data can be large.
 */
export function vttDataDir(userDataDir: string, instance: string): string {
  return path.join(userDataDir, 'vtt', instance);
}

/** The project's `.pdt` directory. @throws {Error} When not in a project */
function projectData({ paths }: CommandContext): string {
  if (paths.pdtConfigDir === undefined) throw new Error(m['error.notInPdtProject']());
  return paths.pdtConfigDir;
}

/** The configured VTT `name`, in the project the command is run in. */
function projectVtt(context: CommandContext, name: string): ProjectVtt {
  const pdtPath = projectData(context);
  const settings = context.config.VTT[name] as VttSettings;
  return {
    name,
    settings,
    server: context.createVtt(name, settings, context.config.FOUNDRY),
    runState: runStateFile(pdtPath),
    root: path.dirname(pdtPath),
  };
}

/** The VTT a command is for (see {@link chooseVtt}), in the project the command is run in. */
function chosenVtt(context: CommandContext, given: string | undefined): ProjectVtt {
  projectData(context);
  return projectVtt(context, chooseVtt(context, given));
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

/** The directories to give the VTT: its data, and the project as the module it is. */
function mountsFor({ name, server, root }: ProjectVtt, instance: string, context: CommandContext): Mount[] {
  const data = vttDataDir(context.paths.userDataDir, instance);
  fs.mkdirSync(data, { recursive: true });
  const mounts: Mount[] = [{ source: data, target: server.dataPath }];
  if (context.config.id === undefined) {
    context.log.warn(m['warn.vtt.noModuleMount']({ vtt: name }));
  } else {
    const target = server.modulePath(context.config.id);
    // Made here, as the user: Docker would make the mount point inside the data owned by root, and
    // the user could not remove the data.
    fs.mkdirSync(path.join(data, path.posix.relative(server.dataPath, target)), { recursive: true });
    mounts.push({ source: root, target });
  }
  return mounts;
}

/**
 * Start `vtt`, unless it is running, record it in the project's run state, and wait until it
 * answers.
 */
async function start(vtt: ProjectVtt, context: CommandContext) {
  const { config, log, out, isPortFree, isUrlReachable, owner } = context;
  const { name, settings, server, runState, root } = vtt;
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
  const mounts = mountsFor(vtt, instance, context);
  if (
    settings.server.type === 'foundry' &&
    (config.FOUNDRY?.username === undefined || config.FOUNDRY.password === undefined)
  ) {
    // A Foundry VTT installed by an earlier start is kept with the VTT's data, so this may not matter.
    log.warn(m['warn.vtt.noAccount']({ vtt: name }));
  }

  out(m['info.vtt.starting']({ vtt: name, version: server.version, port }));
  const { id } = await server.start({
    name: instance,
    port,
    environment: server.environment(),
    mounts,
    ...(owner === undefined ? {} : { user: owner }),
  });
  const url = server.urlAt(port);
  // Recorded before waiting, so that a VTT that does not answer can still be stopped.
  recordRunningVtt(runState, name, { id, name: instance, port, url, started: new Date().toISOString() });

  const { timeout } = settings.server.ready;
  out(m['info.vtt.waiting']({ vtt: name, url, timeout }));
  const result = await waitUntilReachable({
    url,
    timeout: timeout * 1000,
    isReachable: isUrlReachable,
    isRunning: () => server.host.isRunning({ id }),
  });
  if (result === 'stopped') throw new Error(m['error.vtt.stoppedWhileStarting']({ vtt: name, container: instance }));
  if (result === 'timedOut') {
    throw new Error(m['error.vtt.notReachable']({ vtt: name, url, timeout, container: instance }));
  }
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
 * Start a VTT of the project, and wait until it answers. A VTT that is running already is left
 * alone.
 *
 * @param given - The VTT's name; see {@link chooseVtt} for when none is given
 * @throws {Error} When not in a project, the VTT is not configured, its host cannot be reached, no
 *   port can be had, the host cannot start it, or it stops or does not answer in time
 */
export async function startVtt(context: CommandContext, given: string | undefined) {
  const vtt = chosenVtt(context, given);
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
  const vtt = chosenVtt(context, given);
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
  const vtt = chosenVtt(context, given);
  await assertHostAccessible(vtt);
  await stop(vtt, context);
  await start(vtt, context);
}

/**
 * The VTTs the project's run state records that are running, by name. A VTT that is no longer
 * configured cannot be asked about, so it counts as running.
 *
 * @throws {Error} When not in a project, or the host of a recorded VTT cannot be reached
 */
export async function runningProjectVtts(context: CommandContext): Promise<string[]> {
  const recorded = readRunState(runStateFile(projectData(context))).VTT ?? {};
  const running: string[] = [];
  for (const [name, record] of Object.entries(recorded)) {
    if (!Object.hasOwn(context.config.VTT, name)) {
      running.push(name);
      continue;
    }
    const vtt = projectVtt(context, name);
    await assertHostAccessible(vtt);
    if (await vtt.server.host.isRunning(record)) running.push(name);
  }
  return running;
}

/**
 * Stop every VTT the project's run state records, and forget them. One that is no longer
 * configured cannot be stopped: it is forgotten, with a warning naming what runs it.
 *
 * @throws {Error} When not in a project, or a VTT's host cannot be reached or cannot stop it
 */
export async function stopAllVtts(context: CommandContext) {
  const runState = runStateFile(projectData(context));
  for (const [name, record] of Object.entries(readRunState(runState).VTT ?? {})) {
    if (!Object.hasOwn(context.config.VTT, name)) {
      context.log.warn(m['warn.vtt.notConfiguredToStop']({ vtt: name, container: record.name }));
      forgetRunningVtt(runState, name);
      continue;
    }
    const vtt = projectVtt(context, name);
    await assertHostAccessible(vtt);
    await stop(vtt, context);
  }
}

/** What a VTT of a project is doing, as far as pdt can tell. */
export type VttStatus =
  | { vtt: string; state: 'running'; url: string; container: string }
  | { vtt: string; state: 'stopped' }
  | { vtt: string; state: 'unknown'; reason: string };

/**
 * The state of each VTT of the project: those configured, in order, then any the run state records
 * that are no longer configured. A VTT pdt has no record of starting is stopped, without asking its
 * host; one it has is running or stopped as its host says, or unknown when the host cannot be
 * reached.
 *
 * @throws {Error} When not in a project, or the project's run state cannot be read
 */
export async function vttStatuses(context: CommandContext): Promise<VttStatus[]> {
  const recorded = readRunState(runStateFile(projectData(context))).VTT ?? {};
  const statuses: VttStatus[] = [];
  for (const name of Object.keys(context.config.VTT)) {
    const record = Object.hasOwn(recorded, name) ? recorded[name] : undefined;
    if (record === undefined) {
      statuses.push({ vtt: name, state: 'stopped' });
      continue;
    }
    const vtt = projectVtt(context, name);
    if (!(await vtt.server.host.isAccessible())) {
      const reason = m['error.vtt.hostUnreachable']({ vtt: name, type: vtt.settings.host.type });
      statuses.push({ vtt: name, state: 'unknown', reason });
    } else if (await vtt.server.host.isRunning(record)) {
      statuses.push({ vtt: name, state: 'running', url: record.url, container: record.name });
    } else {
      statuses.push({ vtt: name, state: 'stopped' });
    }
  }
  for (const [name, record] of Object.entries(recorded)) {
    if (Object.hasOwn(context.config.VTT, name)) continue;
    statuses.push({ vtt: name, state: 'unknown', reason: m['info.status.notConfigured']({ container: record.name }) });
  }
  return statuses;
}
