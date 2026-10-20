import { describe, expect, it } from 'vitest';
import { chooseOrder } from '../../src/version/choose.js';
import { foundryOrder } from '../../src/version/foundry.js';
import { semverOrder } from '../../src/version/semver.js';

describe('chooseOrder', () => {
  it('uses Foundry’s order when asked for it', () => {
    expect(chooseOrder('foundry', ['1.0.0', 'not semver'])).toEqual({ order: foundryOrder, unreadable: [] });
  });

  it('uses SemVer when it can read every version', () => {
    expect(chooseOrder('semver', ['1.0.0', '1.1.0-beta', '2'])).toEqual({ order: semverOrder, unreadable: [] });
  });

  it('falls back to Foundry’s order, and reports why, when SemVer cannot read a version', () => {
    expect(chooseOrder('semver', ['1.0.0', 'v2', '2023-04-08'])).toEqual({
      order: foundryOrder,
      unreadable: ['v2', '2023-04-08'],
    });
  });
});
