import { describe, expect, test } from 'vitest';
import createServer from '@lib/VTT/VTTServerFactory.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import { createHostMock } from '@tests/unit/mocks/vttHost.js';
import { m } from '@i18n/messages.js';

import type { ServerSettings } from '@schema/config.js';

const FOUNDRY: ServerSettings = { type: 'foundry', version: '13', hostname: 'localhost', port: 'auto' };

describe('createServer', () => {
  test('creates a Foundry VTT server, with its name, settings and host, for the foundry type', () => {
    const host = createHostMock();

    const server = createServer('unit-test-vtt', FOUNDRY, host);

    expect(server).toBeInstanceOf(FoundryVTTServer);
    expect(server).toMatchObject({ name: 'unit-test-vtt', settings: FOUNDRY, host, account: {} });
  });

  test('gives a Foundry VTT server the account', () => {
    expect(createServer('unit-test-vtt', FOUNDRY, createHostMock(), { password: 'p' })).toMatchObject({
      account: { password: 'p' },
    });
  });

  test('rejects an unknown VTT type, naming it', () => {
    const unknown = { ...FOUNDRY, type: 'roll20' } as unknown as ServerSettings;

    expect(() => createServer('unit-test-vtt', unknown, createHostMock())).toThrow(
      m['error.vtt.unknownServerType']({ type: 'roll20' }),
    );
  });
});
