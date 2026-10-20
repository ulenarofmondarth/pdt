import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { isUrlReachable, POLL_INTERVAL, waitUntilReachable } from '@util/reachable.js';

describe('isUrlReachable', () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    await new Promise(resolve => (server ? server.close(resolve) : resolve(undefined)));
    server = undefined;
  });

  /** A server that answers every request with `status`, at the URL it is reached at. */
  function serving(status: number): Promise<string> {
    return new Promise(resolve => {
      server = http
        .createServer((_request, response) => response.writeHead(status, { Location: '/setup' }).end())
        .listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server!.address() as net.AddressInfo).port}`));
    });
  }

  test.each([200, 302, 500])('is true for a server that answers with %s', async status => {
    await expect(isUrlReachable(await serving(status))).resolves.toBe(true);
  });

  test('is false where nothing listens', async () => {
    const url = await serving(200);
    await new Promise(resolve => server!.close(resolve));
    server = undefined;

    await expect(isUrlReachable(url)).resolves.toBe(false);
  });
});

describe('waitUntilReachable', () => {
  /** A clock that moves on only when slept on. */
  function clock() {
    let time = 0;
    return {
      now: () => time,
      sleep: vi.fn((ms: number) => {
        time += ms;
        return Promise.resolve();
      }),
    };
  }

  test('is reachable as soon as the server answers', async () => {
    const { now, sleep } = clock();
    const isReachable = vi.fn<(url: string) => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValue(true);

    await expect(
      waitUntilReachable({
        url: 'http://x',
        timeout: 60_000,
        isReachable,
        isRunning: () => Promise.resolve(true),
        now,
        sleep,
      }),
    ).resolves.toBe('reachable');

    expect(isReachable).toHaveBeenCalledTimes(2);
    expect(isReachable).toHaveBeenCalledWith('http://x');
    expect(sleep).toHaveBeenCalledExactlyOnceWith(POLL_INTERVAL);
  });

  test('is stopped as soon as what runs the server stops', async () => {
    const { now, sleep } = clock();

    await expect(
      waitUntilReachable({
        url: 'http://x',
        timeout: 60_000,
        isReachable: () => Promise.resolve(false),
        isRunning: () => Promise.resolve(false),
        now,
        sleep,
      }),
    ).resolves.toBe('stopped');
    expect(sleep).not.toHaveBeenCalled();
  });

  test('times out once the time is up, never sleeping past it', async () => {
    const { now, sleep } = clock();
    const isReachable = vi.fn(() => Promise.resolve(false));

    await expect(
      waitUntilReachable({
        url: 'http://x',
        timeout: 5000,
        isReachable,
        isRunning: () => Promise.resolve(true),
        now,
        sleep,
      }),
    ).resolves.toBe('timedOut');

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 2000, 1000]);
    expect(isReachable).toHaveBeenCalledTimes(4);
  });

  test('asks once even with no time at all', async () => {
    const isReachable = vi.fn(() => Promise.resolve(true));

    await expect(
      waitUntilReachable({ url: 'http://x', timeout: 0, isReachable, isRunning: () => Promise.resolve(true) }),
    ).resolves.toBe('reachable');
  });
});
