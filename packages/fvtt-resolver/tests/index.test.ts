import { describe, expect, it } from 'vitest';
import * as resolver from '../src/index.js';

describe('@mondarth/fvtt-resolver', () => {
  it('names the package it is published as', () => {
    expect(resolver.packageName).toBe('@mondarth/fvtt-resolver');
  });

  it('exports what the core offers so far', () => {
    expect(Object.keys(resolver).sort()).toEqual([
      'CORE',
      'DEFAULT_POLICY',
      'REQUIREMENTS',
      'WORLD_SYSTEM',
      'chooseOrder',
      'chooseOrders',
      'coreRange',
      'coreVerifiedRange',
      'foundryDisagreements',
      'foundryOrder',
      'isNewerVersion',
      'looksLikePrerelease',
      'normaliseManifest',
      'packageKey',
      'packageName',
      'rangeOps',
      'relationshipRange',
      'releaseConstraints',
      'resolve',
      'semverOrder',
      'universeConstraints',
      'withDefaults',
      'worldSystemVersion',
    ]);
  });
});
