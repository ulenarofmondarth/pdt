import { describe, test, expect } from 'vitest';
import { parser } from './parsers.js';

describe('no command', () => {
  test('outputs validation error', async () => {
    const expected = 'At least one top level command is required.';

    parser.parse('', (err: Error) => {
      expect(err.message).toEqual(expected);
    });
  });
});
