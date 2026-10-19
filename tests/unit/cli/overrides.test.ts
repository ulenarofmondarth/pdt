import { describe, expect, test } from 'vitest';
import { configOverrides } from '@/cli/overrides.js';
import { ConfigError } from '@util/load-config.js';
import { m } from '@i18n/messages.js';

describe('configOverrides', () => {
  test('is nothing without --config', () => {
    expect(configOverrides(['vtt', 'start'])).toEqual([]);
  });

  test('picks out each --config, in order, wherever it is', () => {
    expect(
      configOverrides(['--config', 'Logging.level=debug', 'vtt', 'start', '--config=Logging.filename=x.log']),
    ).toEqual([
      { key: 'Logging.level', value: 'debug' },
      { key: 'Logging.filename', value: 'x.log' },
    ]);
  });

  test('splits at the first =, so a value can hold one', () => {
    expect(configOverrides(['--config', 'Logging.filename=a=b.log'])).toEqual([
      { key: 'Logging.filename', value: 'a=b.log' },
    ]);
  });

  test('takes an empty value', () => {
    expect(configOverrides(['--config', 'Logging.filename='])).toEqual([{ key: 'Logging.filename', value: '' }]);
  });

  test('ignores anything after --', () => {
    expect(configOverrides(['info', '--', '--config', 'Logging.level=debug'])).toEqual([]);
  });

  test('leaves a --config without a value for the parser to report', () => {
    expect(configOverrides(['info', '--config'])).toEqual([]);
  });

  test.each(['Logging.level', '=debug'])('refuses %j, which is not <key>=<value>', text => {
    const error = (() => {
      try {
        configOverrides(['--config', text]);
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(ConfigError);
    expect(error).toHaveProperty('message', m['error.config.badOverride']({ value: text }));
  });
});
