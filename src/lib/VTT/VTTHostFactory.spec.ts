import { describe, test, expect } from 'vitest';
import createHost from './VTTHostFactory.js';

import type { VTTHostConfig } from './VTTHost.js';

describe('createHost())', () => {
  test('throws error on unrecognised Host type', () => {
    const hostOptions: VTTHostConfig = {
      type: 'nosuchtype',
    };

    expect(() => createHost(hostOptions)).toThrow();
  });
});
