import { describe, expect, test } from 'vitest';
import { prettyData } from '@util/diagnostic.js';

describe('prettyData', () => {
  test('renders nested data as JSON indented by two spaces', () => {
    expect(prettyData({ a: 1, b: { c: [true, null] } })).toBe(
      ['{', '  "a": 1,', '  "b": {', '    "c": [', '      true,', '      null', '    ]', '  }', '}'].join('\n'),
    );
  });

  test('renders null', () => {
    expect(prettyData(null)).toBe('null');
  });

  test('round-trips through JSON.parse', () => {
    const data = { name: 'pdt', ports: [30000, 'auto'] };

    expect(JSON.parse(prettyData(data))).toEqual(data);
  });
});
