import { Readable } from 'node:stream';
import { vi } from 'vitest';
import type Docker from 'dockerode';
import type { Container, ContainerInspectInfo } from 'dockerode';

/**
 * Stand-in for a dockerode `Container`, limited to the methods pdt uses.
 *
 * The `satisfies` clause fails the type check if dockerode renames one of these methods.
 */
export function createContainerMock() {
  return {
    inspect: vi.fn<() => Promise<ContainerInspectInfo>>(),
    start: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } satisfies Partial<Record<keyof Container, unknown>>;
}

export type ContainerMock = ReturnType<typeof createContainerMock>;

/**
 * Stand-in for a dockerode `Docker` client, limited to the methods pdt uses.
 *
 * By default the engine is reachable, the only known container is `container`, and pulling
 * an image completes after one progress message.
 *
 * @param container - Container returned by `getContainer` and `createContainer`
 */
export function createDockerMock(container: ContainerMock = createContainerMock()) {
  return {
    ping: vi.fn<() => Promise<unknown>>().mockResolvedValue('OK'),
    getContainer: vi.fn<(id: string) => ContainerMock>().mockReturnValue(container),
    createContainer: vi.fn<(options: object) => Promise<ContainerMock>>().mockResolvedValue(container),
    pull: vi
      .fn<(image: string, options: object) => Promise<NodeJS.ReadableStream>>()
      .mockImplementation(async () => pullProgress()),
  } satisfies Partial<Record<keyof Docker, unknown>>;
}

export type DockerMock = ReturnType<typeof createDockerMock>;

/**
 * The part of a container inspection that pdt reads.
 *
 * @param running - Whether the container reports itself as running
 */
export function inspectInfo(running: boolean): ContainerInspectInfo {
  // A full ContainerInspectInfo has dozens of required fields that pdt never touches.
  return { State: { Running: running } } as ContainerInspectInfo;
}

/**
 * The error dockerode raises for a failed engine request.
 *
 * @param statusCode - HTTP status returned by the Docker engine
 */
export function dockerError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`(HTTP code ${statusCode})`), { statusCode });
}

/** A finished image pull: one progress message, then end of stream. */
export function pullProgress(): NodeJS.ReadableStream {
  return Readable.from([Buffer.from(JSON.stringify({ status: 'Pulling from library/image' }))]);
}
