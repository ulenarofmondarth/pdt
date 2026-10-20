import { describe, expect, it } from 'vitest';
import { AVAILABILITY, coreAvailability, isUnavailable, withinRelationship } from '../src/availability.js';

import type { CoreRelease } from '../src/universe.js';

const known: CoreRelease[] = [
  { version: '13.351', generation: 13, channel: 'stable' },
  { version: '14.368', generation: 14, channel: 'stable' },
  { version: '15.300', generation: 15, channel: 'testing' },
];

describe('coreAvailability, by Foundry VTT 14.368’s rules', () => {
  it.each([
    [
      { minimum: '14.369' },
      '14.368',
      AVAILABILITY.REQUIRES_CORE_UPGRADE_STABLE,
      'a newer build of a stable generation',
    ],
    [{ minimum: '15' }, '14.368', AVAILABILITY.REQUIRES_CORE_UPGRADE_UNSTABLE, 'a generation only in testing'],
    [{ minimum: '16' }, '14.368', AVAILABILITY.REQUIRES_CORE_UPGRADE_UNKNOWN, 'a generation not known'],
    [{ maximum: '13' }, '14.368', AVAILABILITY.REQUIRES_CORE_DOWNGRADE, 'an older generation'],
    [{ maximum: '13.351' }, '13.352', AVAILABILITY.REQUIRES_CORE_DOWNGRADE, 'an older build'],
    [{ maximum: '13' }, '13.351', AVAILABILITY.UNKNOWN, 'any build of the generation, with nothing verified'],
    [{ verified: '14' }, '14.368', AVAILABILITY.VERIFIED, 'verified on the generation'],
    [{ verified: '14.368' }, '14.368', AVAILABILITY.VERIFIED, 'verified on the build'],
    [{ verified: '14.360' }, '14.368', AVAILABILITY.UNVERIFIED_BUILD, 'verified on an earlier build'],
    [{ verified: '13' }, '14.368', AVAILABILITY.UNVERIFIED_GENERATION, 'verified on an earlier generation'],
    [{}, '14.368', AVAILABILITY.UNKNOWN, 'no bounds at all'],
  ])('gives %j on %s the code %i: %s', (compatibility, core, code, why) => {
    expect(coreAvailability(compatibility, core, known), why).toBe(code);
  });

  it('reads a minimum of a generation as every build of it', () => {
    expect(coreAvailability({ minimum: '14', verified: '14' }, '14.0', known)).toBe(AVAILABILITY.VERIFIED);
  });

  it('knows no generation when it knows no core release', () => {
    expect(coreAvailability({ minimum: '14' }, '13.351', [])).toBe(AVAILABILITY.REQUIRES_CORE_UPGRADE_UNKNOWN);
  });
});

describe('isUnavailable', () => {
  it('counts the codes above 4 as unusable, as Foundry does', () => {
    expect(Object.values(AVAILABILITY).filter(isUnavailable)).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('withinRelationship', () => {
  it('reads bounds exactly, as Foundry tests a dependency', () => {
    expect(withinRelationship({ minimum: '3.2', maximum: '4' }, '4')).toBe(true);
    expect(withinRelationship({ minimum: '3.2', maximum: '4' }, '4.1.0')).toBe(false);
    expect(withinRelationship({ minimum: '3.2' }, '3.1')).toBe(false);
    expect(withinRelationship({ verified: '1' }, '9')).toBe(true);
  });
});
