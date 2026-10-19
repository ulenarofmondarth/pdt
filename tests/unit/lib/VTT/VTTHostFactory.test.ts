import { describe, expect, test } from 'vitest';
import createHost from '@lib/VTT/VTTHostFactory.js';
import DockerHost from '@lib/VTT/Host/Docker.js';
import { m } from '@i18n/messages.js';

import type { HostSettings } from '@schema/config.js';

// Creating a Docker client does not connect to anything.
const DOCKER: HostSettings = { type: 'docker', image: 'felddy/foundryvtt' };

describe('createHost', () => {
  test('creates a Docker host, with its settings, for the docker type', () => {
    const host = createHost(DOCKER);

    expect(host).toBeInstanceOf(DockerHost);
    expect(host).toMatchObject({ settings: DOCKER });
  });

  test('rejects an unknown host type, naming it', () => {
    const unknown = { ...DOCKER, type: 'podman' } as unknown as HostSettings;

    expect(() => createHost(unknown)).toThrow(m['error.vtt.unknownHostType']({ type: 'podman' }));
  });
});
