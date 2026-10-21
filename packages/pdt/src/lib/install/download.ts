/**
 * Downloading a package's zip to a file, within a size limit.
 */
import fs from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { ReadableStream } from 'node:stream/web';

/** The largest package zip pdt downloads. Real packages are far smaller. */
export const MAX_DOWNLOAD = 1024 ** 3;

/** Why a download failed. */
export class DownloadError extends Error {
  constructor(
    readonly url: string,
    readonly reason: 'http' | 'network' | 'too-large',
    readonly status?: number,
  ) {
    super(`${url}: ${reason}${status === undefined ? '' : ` ${status}`}`);
    this.name = 'DownloadError';
  }
}

/**
 * Downloads `url` to `file`.
 *
 * @throws {DownloadError} When the server cannot be reached, answers with an error, or sends more
 *   than `maxBytes`
 */
export async function download(
  fetch: typeof globalThis.fetch,
  url: string,
  file: string,
  maxBytes = MAX_DOWNLOAD,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new DownloadError(url, 'network');
  }
  if (!response.ok || response.body === null) throw new DownloadError(url, 'http', response.status);

  let received = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      received += chunk.length;
      done(received > maxBytes ? new DownloadError(url, 'too-large') : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body as ReadableStream<Uint8Array>), limit, fs.createWriteStream(file));
  } catch (error) {
    if (error instanceof DownloadError) throw error;
    throw new DownloadError(url, 'network');
  }
}
