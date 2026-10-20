import { describe, expect, it } from 'vitest';
import { packageName } from '../src/index.js';

describe('@mondarth/fvtt-resolver', () => {
  it('names the package it is published as', () => {
    expect(packageName).toBe('@mondarth/fvtt-resolver');
  });
});
