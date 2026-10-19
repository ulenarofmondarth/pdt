import { describe, expect, test } from 'vitest';
import { config as configSchema, DEFAULT_DOCKER_IMAGE, hostSchema, serverSchema } from '@schema/config.js';
import defaults from '@/pdt-internal-config/default.json' with { type: 'json' };
import { vttSettings } from '@lib/projectVtt.js';

const DOCKER_HOST = { type: 'docker', image: 'felddy/foundryvtt-docker', version: '12', ports: [] };

/** A copy of the shipped defaults that a test is free to break. */
function validConfig() {
  return structuredClone(defaults) as Record<string, Record<string, unknown>>;
}

describe('config schema', () => {
  test('accepts the configuration shipped with pdt', () => {
    expect(configSchema.safeParse(defaults).success).toBe(true);
  });

  // Regression: validating dropped the port the shipped defaults set, since the schema lacked it.
  test('keeps the port of a server', () => {
    const config = configSchema.parse({ ...defaults, VTT: { mod: vttSettings('13') } });

    expect(config.VTT['mod']?.server.port).toBe('auto');
  });

  test('accepts the shipped defaults, which configure no VTT', () => {
    expect(configSchema.parse(defaults).VTT).toEqual({});
  });

  test('has no project id by default, and keeps one it is given', () => {
    expect(configSchema.parse(defaults)).not.toHaveProperty('id');
    expect(configSchema.parse({ ...defaults, id: 'arcane-ledger' }).id).toBe('arcane-ledger');
  });

  test.each(['', 'arcane.ledger'])('rejects a project id that cannot be a configuration key: "%s"', id => {
    const result = configSchema.safeParse({ ...defaults, id });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['id']);
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

  test('requires ports', () => {
    const host: Record<string, unknown> = { ...DOCKER_HOST };
    delete host['ports'];

    expect(hostSchema.safeParse(host).success).toBe(false);
  });

  test('runs the Foundry VTT image when it names no image', () => {
    const host: Record<string, unknown> = { ...DOCKER_HOST };
    delete host['image'];

    expect(hostSchema.parse(host).image).toBe(DEFAULT_DOCKER_IMAGE);
  });

  // A server's version tags the image a VTT host runs.
  test('does not require a version', () => {
    const host: Record<string, unknown> = { ...DOCKER_HOST };
    delete host['version'];

    expect(hostSchema.safeParse(host).success).toBe(true);
  });

  // Regression: validation dropped the socket, which the Docker host reads.
  test('keeps the socket to reach the engine through', () => {
    expect(hostSchema.parse({ ...DOCKER_HOST, socketPath: '/run/docker.sock' })).toMatchObject({
      socketPath: '/run/docker.sock',
    });
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

  test('accepts a port', () => {
    expect(serverSchema.safeParse({ ...FOUNDRY_SERVER, port: 'auto' }).success).toBe(true);
  });

  test.each(['hostname', 'version'])('requires %s', field => {
    const server: Record<string, unknown> = { ...FOUNDRY_SERVER };
    delete server[field];

    expect(serverSchema.safeParse(server).success).toBe(false);
  });
});
