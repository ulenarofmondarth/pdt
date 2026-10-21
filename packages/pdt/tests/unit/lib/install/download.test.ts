import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { download, DownloadError } from '@lib/install/download.js';

describe('download', () => {
  let sandbox: string;
  let file: string;
  const url = 'https://example.org/my-module.zip';

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-download-'));
    file = path.join(sandbox, 'my-module.zip');
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  const answering = (response: Response | Error) =>
    vi.fn<typeof globalThis.fetch>(() =>
      response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
    );

  test('writes what it downloads to the file', async () => {
    const fetch = answering(new Response('zip bytes'));
    await download(fetch, url, file);
    expect(fs.readFileSync(file, 'utf8')).toBe('zip bytes');
    expect(fetch).toHaveBeenCalledWith(url);
  });

  test('fails when the server cannot be reached', async () => {
    await expect(download(answering(new TypeError('fetch failed')), url, file)).rejects.toEqual(
      new DownloadError(url, 'network'),
    );
  });

  test('fails, with the status, when the server answers with an error', async () => {
    await expect(download(answering(new Response('gone', { status: 404 })), url, file)).rejects.toMatchObject({
      reason: 'http',
      status: 404,
      message: `${url}: http 404`,
    });
  });

  test('fails when the answer has no body', async () => {
    await expect(download(answering(new Response(null, { status: 200 })), url, file)).rejects.toMatchObject({
      reason: 'http',
    });
  });

  test('stops at the size limit', async () => {
    await expect(download(answering(new Response('0123456789')), url, file, 5)).rejects.toEqual(
      new DownloadError(url, 'too-large'),
    );
  });

  test('fails when the answer breaks off', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('part'));
        controller.error(new Error('connection reset'));
      },
    });
    await expect(download(answering(new Response(body)), url, file)).rejects.toEqual(new DownloadError(url, 'network'));
  });
});
