import { describe, expect, test } from 'vitest';
import { leaves, parseKey, parseValue, schemaAt, valueAt } from '@util/config-keys.js';
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
