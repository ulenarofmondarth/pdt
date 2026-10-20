import { Readable } from 'node:stream';
import { vi } from 'vitest';
import type Docker from 'dockerode';
import type { Container, ContainerInspectInfo, Image, ImageInspectInfo } from 'dockerode';

// The real progress parser, so tests see how dockerode splits Docker's progress stream into
// messages. Creating a client does not connect to anything.
const { default: ActualDocker } = await vi.importActual<{ default: typeof Docker }>('dockerode');
const actualModem = new ActualDocker({ socketPath: '/nonexistent/docker.sock' }).modem;

/**
 * Stand-in for a dockerode `Container`, limited to the members pdt uses. Starting, stopping and
 * removing it succeed; what inspecting it gives is for each test to say.
 *
 * The `satisfies` clause fails the type check if dockerode renames one of these methods.
 */
export function createContainerMock(id = 'container-id') {
  return {
    id,
    inspect: vi.fn<() => Promise<ContainerInspectInfo>>(),
    start: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    remove: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } satisfies Partial<Record<keyof Container, unknown>>;
}

export type ContainerMock = ReturnType<typeof createContainerMock>;

/**
 * Stand-in for a dockerode `Image`. By default the engine does not have the image.
 */
export function createImageMock() {
  return {
    inspect: vi.fn<() => Promise<ImageInspectInfo>>().mockRejectedValue(dockerError(404)),
  } satisfies Partial<Record<keyof Image, unknown>>;
}

export type ImageMock = ReturnType<typeof createImageMock>;

/**
 * Stand-in for a dockerode `Docker` client, limited to the methods pdt uses.
 *
 * By default the engine is reachable, the only known container is `container`, the engine does not
 * have the image, and pulling it completes after one progress message.
 *
 * @param container - Container returned by `getContainer` and `createContainer`
 * @param image - Image returned by `getImage`
 */
export function createDockerMock(
  container: ContainerMock = createContainerMock(),
  image: ImageMock = createImageMock(),
) {
  return {
    getImage: vi.fn<(name: string) => ImageMock>().mockReturnValue(image),
    ping: vi.fn<() => Promise<unknown>>().mockResolvedValue('OK'),
    getContainer: vi.fn<(id: string) => ContainerMock>().mockReturnValue(container),
    createContainer: vi.fn<(options: object) => Promise<ContainerMock>>().mockResolvedValue(container),
    pull: vi
      .fn<(image: string, options: object) => Promise<NodeJS.ReadableStream>>()
      .mockImplementation(async () => pullProgress()),
    modem: { followProgress: actualModem.followProgress.bind(actualModem) },
  } satisfies Partial<Record<keyof Docker, unknown>>;
}

export type DockerMock = ReturnType<typeof createDockerMock>;

/**
 * The mock, as the client a DockerHost takes.
 *
 * The mock has only the members pdt uses, which `createDockerMock` checks against the real client.
 */
export function asDocker(mock: DockerMock): Docker {
  return mock as unknown as Docker;
}

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
  return pullStream(`${JSON.stringify({ status: 'Pulling from library/image' })}\n`);
}

/**
 * An image pull whose progress arrives in the given chunks. Docker sends newline-delimited JSON,
 * and a chunk can end part way through a message.
 *
 * @param chunks - Raw text of each chunk, in order
 */
export function pullStream(...chunks: string[]): NodeJS.ReadableStream {
  return Readable.from(chunks.map(chunk => Buffer.from(chunk)));
}

/**
 * An image pull that fails part way through.
 *
 * @param error - Error the stream emits
 */
export function failingPullStream(error: Error): NodeJS.ReadableStream {
  return new Readable({
    read() {
      this.destroy(error);
    },
  });
}
