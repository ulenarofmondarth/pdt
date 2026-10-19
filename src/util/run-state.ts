/**
 * pdt's run state: what pdt records for itself, as opposed to the configuration, which the user
 * writes. The user's run state is in their user data directory, and a project's in its `.pdt`
 * directory, each in a file named {@link RUN_STATE_FILENAME}.
 *
 * The user's run state registers each project under `PROJECTS`, by the project's id:
 *
 * ```json
 * { "PROJECTS": { "my-module": { "root": "/path/to/project/root" } } }
 * ```
 *
 * A project's run state records each of its VTTs that pdt started, under `VTT`, by the VTT's name:
 *
 * ```json
 * { "VTT": { "my-module": { "id": "<container id>", "name": "pdt-my-module", "port": 30000,
 *   "url": "http://localhost:30000", "started": "2026-10-19T17:00:00.000Z" } } }
 * ```
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod/v4';
import PDT from '@/constants.js';
import { m } from '@i18n/messages.js';

/** Name of the run state file, in the user data directory and in each project's `.pdt` directory. */
export const RUN_STATE_FILENAME = 'run.state.json';

const projectSchema = z.looseObject({
  /** The project's root directory. */
  root: z.string(),
});

const runningVttSchema = z.looseObject({
  /** The host's id for what runs the VTT, such as a container's id. */
  id: z.string(),
  /** What runs the VTT is called on its host, such as a container's name. */
  name: z.string(),
  /** The port the VTT serves on, on the machine pdt runs on. */
  port: z.int(),
  /** Where to reach the VTT. */
  url: z.string(),
  /** When pdt started the VTT, as an ISO 8601 time. */
  started: z.string(),
});

const runStateSchema = z.looseObject({
  PROJECTS: z.record(z.string(), projectSchema).optional(),
  VTT: z.record(z.string(), runningVttSchema).optional(),
});

/** A run state; anything it holds other than what pdt reads is kept as it is. */
export type RunState = z.output<typeof runStateSchema>;

/** A project, as the user's run state registers it. */
export type RegisteredProject = z.output<typeof projectSchema>;

/** A VTT pdt started, as the project's run state records it. */
export type RunningVtt = z.output<typeof runningVttSchema>;

/** The run state file in `dir`. */
export function runStateFile(dir: string): string {
  return path.join(dir, RUN_STATE_FILENAME);
}

/**
 * The run state in `file`, or none if it does not exist.
 *
 * @throws {Error} When the file cannot be read, or is not a valid run state
 */
export function readRunState(file: string): RunState {
  let content: unknown;
  try {
    content = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(m['error.runState.unreadable']({ file, reason }), { cause: error });
  }
  const result = z.safeParse(runStateSchema, content);
  if (!result.success) {
    const problems = result.error.issues.map(issue => `${issue.path.join('.')} ${issue.message}`).join('; ');
    throw new Error(m['error.runState.invalid']({ file, problems }), { cause: result.error });
  }
  return result.data;
}

/** Write `state` to `file`, creating its directory. */
export function writeRunState(file: string, state: RunState) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * The project registered as `id` in the user's run state `file`, if there is one.
 *
 * @throws {Error} When the file cannot be read, or is not a valid run state
 */
export function registeredProject(file: string, id: string): RegisteredProject | undefined {
  const projects = readRunState(file).PROJECTS ?? {};
  return Object.hasOwn(projects, id) ? projects[id] : undefined;
}

/**
 * Register the project at `root` as `id` in the user's run state `file`.
 *
 * @throws {Error} When the file cannot be read, or is not a valid run state
 */
export function registerProject(file: string, id: string, root: string) {
  const state = readRunState(file);
  writeRunState(file, { ...state, PROJECTS: { ...state.PROJECTS, [id]: { root } } });
}

/**
 * Remove the projects that `remove` picks from the user's run state `file`, writing it only if any are.
 *
 * @returns The projects removed, by id
 */
function removeProjects(file: string, remove: (project: RegisteredProject) => boolean): [string, RegisteredProject][] {
  const state = readRunState(file);
  const projects = Object.entries(state.PROJECTS ?? {});
  const removed = projects.filter(([, project]) => remove(project));
  if (removed.length === 0) return [];
  writeRunState(file, {
    ...state,
    PROJECTS: Object.fromEntries(projects.filter(entry => !removed.includes(entry))),
  });
  return removed;
}

/**
 * Remove every registration of the project at `root` from the user's run state `file`. A project
 * registered at another root is left alone, even if it has the same id.
 *
 * @returns The ids removed
 * @throws {Error} When the file cannot be read, or is not a valid run state
 */
export function unregisterProject(file: string, root: string): string[] {
  return removeProjects(file, project => path.resolve(project.root) === path.resolve(root)).map(([id]) => id);
}

/** Whether `root` is a pdt project: it holds a `.pdt` directory. */
export function isPdtProject(root: string): boolean {
  try {
    return fs.statSync(path.join(root, PDT.PROJECT_RTD_DIR_NAME)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Remove from the user's run state `file` every project whose root is no longer a pdt project.
 *
 * @returns The projects removed, by id
 * @throws {Error} When the file cannot be read, or is not a valid run state
 */
export function pruneProjects(file: string): [string, RegisteredProject][] {
  return removeProjects(file, project => !isPdtProject(project.root));
}

/**
 * The VTT `name` as the project's run state `file` records it, if it does.
 *
 * @throws {Error} When the file cannot be read, or is not a valid run state
 */
export function runningVtt(file: string, name: string): RunningVtt | undefined {
  const vtts = readRunState(file).VTT ?? {};
  return Object.hasOwn(vtts, name) ? vtts[name] : undefined;
}

/**
 * Record in the project's run state `file` that the VTT `name` runs as `running`.
 *
 * @throws {Error} When the file cannot be read, or is not a valid run state
 */
export function recordRunningVtt(file: string, name: string, running: RunningVtt) {
  const state = readRunState(file);
  writeRunState(file, { ...state, VTT: { ...state.VTT, [name]: running } });
}

/**
 * Remove the VTT `name` from the project's run state `file`, writing it only if it was there.
 *
 * @throws {Error} When the file cannot be read, or is not a valid run state
 */
export function forgetRunningVtt(file: string, name: string) {
  const state = readRunState(file);
  if (state.VTT === undefined || !Object.hasOwn(state.VTT, name)) return;
  writeRunState(file, { ...state, VTT: Object.fromEntries(Object.entries(state.VTT).filter(([key]) => key !== name)) });
}
