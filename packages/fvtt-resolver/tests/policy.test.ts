import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, withDefaults } from '../src/policy.js';

describe('policy', () => {
  it('defaults as decided', () => {
    expect(DEFAULT_POLICY).toEqual({
      verified: 'prefer',
      conflicts: 'enforce',
      coreChannels: ['stable'],
      prereleases: 'exclude',
      recommends: 'report',
      missingCompatibility: 'any',
      systemCompatibility: 'prefer',
      relationshipBounds: 'foundry',
      versionOrder: 'foundry',
      listingCompatibility: 'prefer',
    });
  });

  it('fills in the defaults for the settings not given', () => {
    expect(withDefaults()).toEqual(DEFAULT_POLICY);
    expect(withDefaults({ conflicts: 'warn' })).toEqual({ ...DEFAULT_POLICY, conflicts: 'warn' });
  });
});
