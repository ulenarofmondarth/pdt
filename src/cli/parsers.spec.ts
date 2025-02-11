import { parser } from './parsers';
import { describe, test, expect } from '@jest/globals';

describe('no command', () => {
  test('outputs validation error', async () => {
    const expected = 'At least one top level command is required.';

    const argv = parser.parse('', (err: Error, argv: object, output: string) => {
      expect(err.message).toEqual(expected);
    });
  });
});

describe('', () => {});
