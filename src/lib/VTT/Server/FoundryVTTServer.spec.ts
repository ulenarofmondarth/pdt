import { describe, test, expect, vi } from 'vitest';
import FoundryVTTServer from './FoundryVTTServer.js';
import DockerHost from '@lib/VTT/Host/Docker.js';

import type { DockerHostConfig } from '@lib/VTT/Host/Docker.js';
import type { FoundryVTTServerConfig } from './FoundryVTTServer.js';

const MOCK_FOUNDRYVTT_CONFIG: FoundryVTTServerConfig = {
  type: 'foundry',
  name: 'JestFoundryVTT',
  version: '12',
  hostname: 'localhost',
  port: '80',
};

const MOCK_VTTHOST_CONFIG: DockerHostConfig = {
  type: 'docker',
  socketPath: '/var/run/docker.sock',
};

describe('FoundryVTTServer', () => {
  test('start runs VTT instance on host', async () => {
    const vttConfig: FoundryVTTServerConfig = MOCK_FOUNDRYVTT_CONFIG;
    const controller = new FoundryVTTServer(vttConfig);
    controller._host = new DockerHost(MOCK_VTTHOST_CONFIG);
    const spy = vi.spyOn(controller._host, 'start').mockImplementation(() => {});

    await controller.start();

    expect(spy).toHaveBeenCalled();
  });

  test('throws error when VTT instance has no host on start()', async () => {
    const vttConfig: FoundryVTTServerConfig = MOCK_FOUNDRYVTT_CONFIG;
    const controller = new FoundryVTTServer(vttConfig);

    await expect(controller.start()).rejects.toThrowError();
  });

  test.skip('report running when running', () => {});
});
