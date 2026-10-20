import { describe, expect, it } from 'vitest';
import * as resolver from '../src/index.js';

describe('@mondarth/fvtt-resolver', () => {
  it('names the package it is published as', () => {
    expect(resolver.packageName).toBe('@mondarth/fvtt-resolver');
  });

  it('exports what the core offers so far', () => {
    expect(Object.keys(resolver).sort()).toEqual(
      [
        'AVAILABILITY',
        'CORE',
        'DEFAULT_POLICY',
        'REQUIREMENTS',
        'WORLD_SYSTEM',
        'check',
        'chooseOrder',
        'chooseOrders',
        'coreCompatibility',
        'coreAvailability',
        'coreRange',
        'coreVerifiedRange',
        'describeIncompatibility',
        'describeReason',
        'englishMessages',
        'explain',
        'explanationText',
        'formatExplanation',
        'foundryDisagreements',
        'foundryOrder',
        'isNewerVersion',
        'isUnavailable',
        'looksLikePrerelease',
        'normaliseManifest',
        'packageKey',
        'packageName',
        'rangeOps',
        'relationshipRange',
        'releaseConstraints',
        'resolve',
        'resolveInRounds',
        'semverOrder',
        'universeConstraints',
        'withDefaults',
        'withinRelationship',
        'worldSystemVersion',
      ].sort(),
    );
  });
});
