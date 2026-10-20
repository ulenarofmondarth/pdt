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
      'chooseOrder',
      'chooseOrders',
      'coreRange',
      'coreVerifiedRange',
      'foundryDisagreements',
      'foundryOrder',
      'isNewerVersion',
      'normaliseManifest',
      'packageKey',
      'packageName',
      'rangeOps',
      'relationshipRange',
      'releaseConstraints',
      'semverOrder',
      'universeConstraints',
      'withDefaults',
    ]);
  });
});
