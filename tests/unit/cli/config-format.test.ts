import YAML from 'yaml';
import { describe, expect, test } from 'vitest';
import { formatSettings, formatValue } from '@/cli/config-format.js';

const SETTINGS = {
  Logging: { filename: 'pdt.log', level: 'warn' },
  VTT: { prj: { host: { ports: [{ internal: 30000, external: 'auto' }] }, enabled: true } },
  count: 3,
};

/** Every value is a default, except those under Logging, which the user set. */
const sourceOf = (key: readonly string[]) => (key[0] === 'Logging' ? 'user' : 'default');

describe('formatSettings', () => {
  describe('flat', () => {
    test('writes a line for each value: its full key, then the value, strings quoted', () => {
      expect(formatSettings(SETTINGS, [], { format: 'flat' })).toBe(
        [
          'Logging.filename "pdt.log"',
          'Logging.level "warn"',
          'VTT.prj.host.ports [{"internal":30000,"external":"auto"}]',
          'VTT.prj.enabled true',
          'count 3',
        ].join('\n'),
      );
    });

    test('writes the full keys of a group', () => {
      expect(formatSettings(SETTINGS.Logging, ['Logging'], { format: 'flat' })).toBe(
        'Logging.filename "pdt.log"\nLogging.level "warn"',
      );
    });

    test('notes the source after each value when asked', () => {
      expect(formatSettings(SETTINGS, [], { format: 'flat', sourceOf }).split('\n')).toEqual([
        'Logging.filename "pdt.log" [user]',
        'Logging.level "warn" [user]',
        'VTT.prj.host.ports [{"internal":30000,"external":"auto"}] [default]',
        'VTT.prj.enabled true [default]',
        'count 3 [default]',
      ]);
    });
  });

  describe('tree', () => {
    test('writes the keys as a tree, each value after its name', () => {
      expect(formatSettings(SETTINGS, [], { format: 'tree' })).toBe(
        [
          'Logging',
          '├── filename: "pdt.log"',
          '└── level: "warn"',
          'VTT',
          '└── prj',
          '    ├── host',
          '    │   └── ports: [{"internal":30000,"external":"auto"}]',
          '    └── enabled: true',
          'count: 3',
        ].join('\n'),
      );
    });

    test('heads the tree of a group with its key', () => {
      expect(formatSettings(SETTINGS.VTT.prj, ['VTT', 'prj'], { format: 'tree' })).toBe(
        ['VTT.prj', '├── host', '│   └── ports: [{"internal":30000,"external":"auto"}]', '└── enabled: true'].join(
          '\n',
        ),
      );
    });

    test('notes the source after each value when asked', () => {
      expect(formatSettings(SETTINGS, [], { format: 'tree', sourceOf }).split('\n')).toEqual([
        'Logging',
        '├── filename: "pdt.log" [user]',
        '└── level: "warn" [user]',
        'VTT',
        '└── prj',
        '    ├── host',
        '    │   └── ports: [{"internal":30000,"external":"auto"}] [default]',
        '    └── enabled: true [default]',
        'count: 3 [default]',
      ]);
    });
  });

  test.each([
    ['json', (text: string): unknown => JSON.parse(text)],
    ['yml', (text: string): unknown => YAML.parse(text)],
  ] as const)('serialises as %s, without sources', (format, parse) => {
    const text = formatSettings(SETTINGS, [], { format, sourceOf });

    expect(parse(text)).toEqual(SETTINGS);
    expect(text).not.toContain('[user]');
    expect(text).not.toMatch(/\n$/);
  });
});

describe('formatValue', () => {
  test.each(['flat', 'tree'] as const)('writes a string alone, unquoted, in %s', format => {
    expect(formatValue('warn', ['Logging', 'level'], { format })).toBe('warn');
  });

  test('writes any other value as JSON', () => {
    expect(formatValue([{ internal: 1 }], ['ports'], { format: 'flat' })).toBe('[{"internal":1}]');
    expect(formatValue(3, ['count'], { format: 'flat' })).toBe('3');
  });

  test('notes the source when asked', () => {
    expect(formatValue('warn', ['Logging', 'level'], { format: 'flat', sourceOf })).toBe('warn [user]');
  });

  test.each([
    ['json', '"warn"'],
    ['yml', 'warn'],
  ] as const)('serialises as %s, without the source', (format, expected) => {
    expect(formatValue('warn', ['Logging', 'level'], { format, sourceOf })).toBe(expected);
  });
});
