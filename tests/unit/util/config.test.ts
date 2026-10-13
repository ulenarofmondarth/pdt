import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest';
import PDT from '@/constants.js';
import defaults from '@/pdt-internal-config/default.json' with { type: 'json' };

const mocks = vi.hoisted(() => ({ toObject: vi.fn() }));

vi.mock('config', () => ({ default: { util: { toObject: mocks.toObject } } }));
// The real module rewrites NODE_CONFIG_DIR for the whole process.
vi.mock('@util/fudge_node_config.js', () => ({}));

/** The module validates the configuration as it loads, so each test loads it afresh. */
async function loadConfig() {
  vi.resetModules();
  return await import('@util/config.js');
}

describe('configuration loading', () => {
  let processExit: MockInstance<typeof process.exit>;
  let consoleLog: MockInstance<typeof console.log>;

  beforeEach(() => {
    processExit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as () => never);
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mocks.toObject.mockReset();
  });

  test('provides the configuration when it is valid', async () => {
    mocks.toObject.mockReturnValue(structuredClone(defaults));

    const { default: config } = await loadConfig();

    expect(config.util.toObject).toBe(mocks.toObject);
    expect(processExit).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });

  test('exits with the invalid configuration code when the configuration is invalid', async () => {
    mocks.toObject.mockReturnValue({ ...structuredClone(defaults), Logging: { filename: 'pdt.log', level: 'chatty' } });

    await loadConfig();

    expect(processExit).toHaveBeenCalledExactlyOnceWith(PDT.EXITCODE.INVALID_CONFIG);
  });

  test('names each invalid entry before exiting', async () => {
    mocks.toObject.mockReturnValue({ ...structuredClone(defaults), Logging: { filename: 42, level: 'chatty' } });

    await loadConfig();

    const printed = consoleLog.mock.calls.flat().join('\n');
    expect(printed).toContain('Error in configuration.');
    expect(printed).toContain('Logging.filename');
    expect(printed).toContain('Logging.level');
  });

  test('does not hide an unexpected failure as a configuration error', async () => {
    mocks.toObject.mockImplementation(() => {
      throw new Error('disk on fire');
    });

    await expect(loadConfig()).rejects.toThrow('disk on fire');
    expect(processExit).not.toHaveBeenCalled();
  });
});
