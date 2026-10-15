import { describe, expect, test } from 'vitest';
import { config as configSchema, hostSchema, serverSchema } from '@schema/config.js';
import defaults from '@/pdt-internal-config/default.json' with { type: 'json' };
import testOverrides from '@/pdt-internal-config/test.json' with { type: 'json' };

const DOCKER_HOST = { type: 'docker', image: 'felddy/foundryvtt-docker', version: '12', ports: [] };

/** A copy of the shipped defaults that a test is free to break. */
function validConfig() {
  return structuredClone(defaults) as Record<string, Record<string, unknown>>;
}

describe('config schema', () => {
  test('accepts the configuration shipped with pdt', () => {
    expect(configSchema.safeParse(defaults).success).toBe(true);
  });

  test('accepts the shipped configuration with the test overrides applied', () => {
    const merged = { ...defaults, VTT: { ...defaults.VTT, ...testOverrides.VTT } };

    expect(configSchema.safeParse(merged).success).toBe(true);
  });

  test.each(['Logging', 'VTT', 'DOCS'])('requires the %s section', section => {
    const config = validConfig();
    delete config[section];

    expect(configSchema.safeParse(config).success).toBe(false);
  });

  test.each(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])('accepts the %s log level', level => {
    const config = validConfig();
    config['Logging'] = { filename: 'pdt.log', level };

    expect(configSchema.safeParse(config).success).toBe(true);
  });

  test('rejects a log level that is not an npm level, reporting where', () => {
    const config = validConfig();
    config['Logging'] = { filename: 'pdt.log', level: 'chatty' };

    const result = configSchema.safeParse(config);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => issue.path.join('.'))).toEqual(['Logging.level']);
  });
});

describe('host schema', () => {
  test('accepts a docker host without a repository', () => {
    expect(hostSchema.safeParse(DOCKER_HOST).success).toBe(true);
  });

  test('accepts a docker host with a repository', () => {
    expect(hostSchema.safeParse({ ...DOCKER_HOST, repository: 'ghcr.io' }).success).toBe(true);
  });

  test.each([30000, 'auto'])('accepts %s as an external port', external => {
    const host = { ...DOCKER_HOST, ports: [{ internal: 30000, external }] };

    expect(hostSchema.safeParse(host).success).toBe(true);
  });

  test.each(['30000', 'any', 1.5, null])('rejects %s as an external port', external => {
    const host = { ...DOCKER_HOST, ports: [{ internal: 30000, external }] };

    expect(hostSchema.safeParse(host).success).toBe(false);
  });

  test('rejects a host type it does not know', () => {
    expect(hostSchema.safeParse({ ...DOCKER_HOST, type: 'podman' }).success).toBe(false);
  });

  test.each(['image', 'version', 'ports'])('requires %s', field => {
    const host: Record<string, unknown> = { ...DOCKER_HOST };
    delete host[field];

    expect(hostSchema.safeParse(host).success).toBe(false);
  });
});

describe('server schema', () => {
  const FOUNDRY_SERVER = { type: 'foundry', hostname: 'localhost', version: '12' };

  test('accepts a foundry server', () => {
    expect(serverSchema.safeParse(FOUNDRY_SERVER).success).toBe(true);
  });

  test('rejects a server type it does not know', () => {
    expect(serverSchema.safeParse({ ...FOUNDRY_SERVER, type: 'roll20' }).success).toBe(false);
  });

  test.each(['hostname', 'version'])('requires %s', field => {
    const server: Record<string, unknown> = { ...FOUNDRY_SERVER };
    delete server[field];

    expect(serverSchema.safeParse(server).success).toBe(false);
  });
});
