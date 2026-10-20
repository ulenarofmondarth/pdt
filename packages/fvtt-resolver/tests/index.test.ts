import { describe, expect, it } from 'vitest';
import * as resolver from '../src/index.js';

describe('@mondarth/fvtt-resolver', () => {
  it('names the package it is published as', () => {
    expect(resolver.packageName).toBe('@mondarth/fvtt-resolver');
  });

  it('exports the version orders and range operations', () => {
    expect(Object.keys(resolver).sort()).toEqual([
      'chooseOrder',
      'coreRange',
      'coreVerifiedRange',
      'foundryDisagreements',
      'foundryOrder',
      'isNewerVersion',
      'packageName',
      'rangeOps',
      'relationshipRange',
      'semverOrder',
    ]);
  });
});
