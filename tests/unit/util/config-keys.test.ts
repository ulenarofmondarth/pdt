import { describe, expect, test } from 'vitest';
import {
  isSecretKey,
  leaves,
  maskSecrets,
  parseKey,
  parseValue,
  schemaAt,
  SECRET_MASK,
  settingKey,
  splitSecrets,
  valueAt,
  withoutKey,
} from '@util/config-keys.js';
import { m } from '@i18n/messages.js';

describe('parseKey', () => {
  test('splits a key at its dots', () => {
    expect(parseKey('VTT.prj.server.version')).toEqual(['VTT', 'prj', 'server', 'version']);
  });

  test('takes a key without dots as it is', () => {
    expect(parseKey('Logging')).toEqual(['Logging']);
  });

  test.each(['', '.', 'Logging.', '.Logging', 'VTT..prj'])('refuses %j, which has an empty part', key => {
    expect(() => parseKey(key)).toThrow(m['error.config.badKey']({ key }));
  });
});

describe('schemaAt', () => {
  test.each([
    ['a setting', 'Logging.level'],
    ['a group of settings', 'Logging'],
    ['a setting with a default', 'VTT.prj.host.image'],
    ['an optional setting', 'VTT.prj.server.port'],
    ['any name under a record', 'VTT.anything.server.version'],
    ['the discriminator of a union', 'VTT.prj.host.type'],
  ])('finds %s', (_case, key) => {
    expect(schemaAt(parseKey(key))).toBeDefined();
  });

  test.each([
    ['a top level name the schema lacks', 'Colours'],
    ['a name the schema lacks in a group', 'Logging.colour'],
    ['a name below a value', 'Logging.level.more'],
    ['a name no option of a union has', 'VTT.prj.server.colour'],
  ])('finds nothing for %s', (_case, key) => {
    expect(schemaAt(parseKey(key))).toBeUndefined();
  });
});

describe('valueAt', () => {
  const settings = { Logging: { level: 'warn' }, list: [1, 2] };

  test('is the value at the key', () => {
    expect(valueAt(settings, ['Logging', 'level'])).toBe('warn');
  });

  test('is the group at the key', () => {
    expect(valueAt(settings, ['Logging'])).toEqual({ level: 'warn' });
  });

  test.each([
    ['a name that is not there', ['Logging', 'filename']],
    ['a name below a value', ['Logging', 'level', 'more']],
    ['a name inside a list', ['list', '0']],
    ['an inherited name', ['Logging', 'toString']],
  ] as const)('is undefined for %s', (_case, key) => {
    expect(valueAt(settings, key)).toBeUndefined();
  });
});

describe('leaves', () => {
  test('lists every value with its key, in order, keeping lists whole', () => {
    expect(leaves({ a: { b: 1, c: { d: 'x' } }, e: [1, 2] })).toEqual([
      { key: ['a', 'b'], value: 1 },
      { key: ['a', 'c', 'd'], value: 'x' },
      { key: ['e'], value: [1, 2] },
    ]);
  });

  test('starts keys at the key it is given', () => {
    expect(leaves({ level: 'warn' }, ['Logging'])).toEqual([{ key: ['Logging', 'level'], value: 'warn' }]);
  });

  test('is the value itself when it is not a group', () => {
    expect(leaves('warn', ['Logging', 'level'])).toEqual([{ key: ['Logging', 'level'], value: 'warn' }]);
  });

  test('is nothing for a value without a key', () => {
    expect(leaves('warn')).toEqual([]);
  });
});

describe('parseValue', () => {
  test.each([
    ['text for a string setting', 'Logging.level', 'debug', 'debug'],
    ['digits for a string setting', 'VTT.prj.server.version', '13', '13'],
    ['JSON for an empty list', 'VTT.prj.host.ports', '[]', []],
    [
      'JSON for a list',
      'VTT.prj.host.ports',
      '[{"internal":1,"external":"auto"}]',
      [{ internal: 1, external: 'auto' }],
    ],
    ['JSON for a group', 'Logging', '{"level":"info"}', { level: 'info' }],
  ])('reads %s', (_case, key, text, expected) => {
    expect(parseValue(parseKey(key), text)).toEqual(expected);
  });

  test('keeps text that is not JSON as it is, to be refused by validation', () => {
    expect(parseValue(parseKey('VTT.prj.host.ports'), 'lots')).toBe('lots');
  });

  test('refuses a key that is not a setting', () => {
    expect(() => parseValue(parseKey('Logging.colour'), 'red')).toThrow(
      m['error.config.unknownKey']({ key: 'Logging.colour' }),
    );
  });
});

describe('settingKey', () => {
  test('splits a key the schema has', () => {
    expect(settingKey('VTT.prj.host')).toEqual(['VTT', 'prj', 'host']);
  });

  test('refuses a key the schema does not have', () => {
    expect(() => settingKey('Logging.colour')).toThrow(m['error.config.unknownKey']({ key: 'Logging.colour' }));
  });

  test('refuses a key that is not one', () => {
    expect(() => settingKey('Logging.')).toThrow(m['error.config.badKey']({ key: 'Logging.' }));
  });
});

describe('withoutKey', () => {
  const settings = { Logging: { level: 'warn', filename: 'x.log' }, VTT: { prj: { server: { version: '13' } } } };

  test('removes the value, keeping the rest of its group', () => {
    expect(withoutKey(settings, ['Logging', 'level'])).toEqual({
      Logging: { filename: 'x.log' },
      VTT: settings.VTT,
    });
  });

  test('removes a whole group', () => {
    expect(withoutKey(settings, ['Logging'])).toEqual({ VTT: settings.VTT });
  });

  test('removes the groups the removal leaves empty', () => {
    expect(withoutKey(settings, ['VTT', 'prj', 'server', 'version'])).toEqual({ Logging: settings.Logging });
  });

  test.each([
    ['a name that is not there', ['Logging', 'colour']],
    ['a group that is not there', ['DOCS', 'host']],
    ['a name below a value', ['Logging', 'level', 'more']],
  ] as const)('leaves the settings alone for %s', (_case, key) => {
    expect(withoutKey(settings, key)).toEqual(settings);
  });

  test('does not change the settings it is given', () => {
    const copy = structuredClone(settings);

    withoutKey(settings, ['Logging', 'level']);

    expect(settings).toEqual(copy);
  });
});

describe('isSecretKey', () => {
  test.each([
    ['FOUNDRY', 'username'],
    ['FOUNDRY', 'password'],
    ['FOUNDRY', 'license_key'],
    ['VTT', 'any', 'server', 'admin_key'],
  ])('is true for the secret setting %s.%s', (...key) => {
    expect(isSecretKey(key)).toBe(true);
  });

  test.each([
    [['Logging', 'level']],
    [['VTT', 'any', 'server', 'version']],
    [['FOUNDRY']],
    [['VTT', 'any', 'server']],
    [['Nothing', 'here']],
    [[]],
  ])('is false for a setting, a group or a key that is not a secret: %j', key => {
    expect(isSecretKey(key)).toBe(false);
  });
});

describe('maskSecrets', () => {
  const settings = {
    Logging: { level: 'warn' },
    FOUNDRY: { username: 'me', password: 'hunter2' },
    VTT: { mod: { server: { version: '14', admin_key: 'k' } } },
  };

  test('masks every secret in a group, keeping the rest, without changing the group', () => {
    expect(maskSecrets(settings)).toEqual({
      Logging: { level: 'warn' },
      FOUNDRY: { username: SECRET_MASK, password: SECRET_MASK },
      VTT: { mod: { server: { version: '14', admin_key: SECRET_MASK } } },
    });
    expect(settings.FOUNDRY.password).toBe('hunter2');
  });

  test('masks a secret given by its key', () => {
    expect(maskSecrets('hunter2', ['FOUNDRY', 'password'])).toBe(SECRET_MASK);
  });

  test('keeps a value that is not secret', () => {
    expect(maskSecrets('warn', ['Logging', 'level'])).toBe('warn');
  });
});

describe('splitSecrets', () => {
  test('splits a group into its secrets and the rest', () => {
    expect(
      splitSecrets({ Logging: { level: 'warn' }, VTT: { mod: { server: { version: '14', admin_key: 'k' } } } }),
    ).toEqual({
      plain: { Logging: { level: 'warn' }, VTT: { mod: { server: { version: '14' } } } },
      secret: { VTT: { mod: { server: { admin_key: 'k' } } } },
    });
  });

  test('has nothing on a side that has no settings', () => {
    expect(splitSecrets({ Logging: { level: 'warn' } })).toEqual({
      plain: { Logging: { level: 'warn' } },
      secret: undefined,
    });
    expect(splitSecrets({ FOUNDRY: { password: 'p' } })).toEqual({
      plain: undefined,
      secret: { FOUNDRY: { password: 'p' } },
    });
  });

  test('splits a group found at a key', () => {
    expect(splitSecrets({ password: 'p', other: 1 }, ['FOUNDRY'])).toEqual({
      plain: { other: 1 },
      secret: { password: 'p' },
    });
  });
});
