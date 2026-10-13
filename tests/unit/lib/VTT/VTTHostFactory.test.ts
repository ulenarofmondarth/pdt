import { describe, expect, test, vi } from 'vitest';
import createHost from '@lib/VTT/VTTHostFactory.js';
import DockerHost from '@lib/VTT/Host/Docker.js';
import VTTHost from '@lib/VTT/VTTHost.js';

// Constructing a DockerHost must not look for a real Docker engine.
vi.mock('dockerode', () => ({ default: vi.fn() }));

describe('createHost', () => {
  test('creates a Docker host for the docker type', () => {
    const host = createHost({ type: 'docker' });

    expect(host).toBeInstanceOf(DockerHost);
    expect(host).toBeInstanceOf(VTTHost);
  });

  test('rejects an unknown host type, naming it', () => {
    expect(() => createHost({ type: 'nosuchtype' })).toThrow('Unknown VTT Host type (nosuchtype)');
  });
});
