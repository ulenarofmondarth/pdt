import net from 'node:net';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { FIRST_AUTO_PORT, findFreePort, isPortFree } from '@util/ports.js';
import { m } from '@i18n/messages.js';

describe('isPortFree', () => {
  let server: net.Server | undefined;

  afterEach(async () => {
    await new Promise(resolve => (server ? server.close(resolve) : resolve(undefined)));
    server = undefined;
  });

  /** A port something is listening on. */
  function listening(): Promise<number> {
    return new Promise(resolve => {
      server = net.createServer().listen(0, () => resolve((server!.address() as net.AddressInfo).port));
    });
  }

  test('is false for a port something listens on', async () => {
    await expect(isPortFree(await listening())).resolves.toBe(false);
  });

  test('is true for that port once it is let go', async () => {
    const port = await listening();
    await new Promise(resolve => server!.close(resolve));
    server = undefined;

    await expect(isPortFree(port)).resolves.toBe(true);
  });
});

describe('findFreePort', () => {
  test('starts from 30000', () => {
    expect(FIRST_AUTO_PORT).toBe(30000);
  });

  test('is the first free port from where it starts', async () => {
    const isFree = vi.fn((port: number) => Promise.resolve(port >= 30003));

    await expect(findFreePort(30000, isFree)).resolves.toBe(30003);
    expect(isFree.mock.calls.map(([port]) => port)).toEqual([30000, 30001, 30002, 30003]);
  });

  test('fails when no port up to the last is free', async () => {
    const isFree = vi.fn(() => Promise.resolve(false));

    await expect(findFreePort(65530, isFree)).rejects.toThrow(m['error.vtt.noFreePort']({ from: 65530 }));
    expect(isFree).toHaveBeenLastCalledWith(65535);
  });
});
