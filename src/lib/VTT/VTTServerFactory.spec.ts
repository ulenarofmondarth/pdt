import { describe, test, expect } from 'vitest';
import createServer from '@lib/VTT/VTTServerFactory.js';
import VTTServer from '@lib/VTT/VTTServer.js';

describe('createServer()', () => {
  test('thows error on invalid VTT type', () => {
    const vttConfig = { type: 'unknown', name: 'test-server', version: '12' };

    expect(() => createServer(vttConfig)).toThrow();
  });

  test('returns a VTTServer', () => {
    const vttConfig = { type: 'foundry', name: 'test-server', version: '12' };

    const controller = createServer(vttConfig);

    expect(controller).toBeInstanceOf(VTTServer);
  });
});
