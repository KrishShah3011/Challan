import { describe, expect, it } from 'vitest';
import { gstinCheckChar, gstinProblem, isStateCode, normalizeGstin, stateName } from './gstin';

describe('gstinProblem', () => {
  it('accepts real GSTINs', () => {
    for (const g of ['27AAPFU0939F1ZV', '29AAGCB7383J1Z4', '24AAACS1234A1Z8', '27AABCA2222E1ZD']) {
      expect(gstinProblem(g)).toBeNull();
    }
  });
  it('computes the mod-36 check character', () => {
    expect(gstinCheckChar('27AAPFU0939F1Z')).toBe('V');
    expect(gstinCheckChar('24AABCA1111D1Z')).toBe('R');
  });
  it('catches a single typing mistake through the check character', () => {
    expect(gstinProblem('27AAPFU0939F1ZW')).toMatch(/last character/);
    expect(gstinProblem('27AAPFU0938F1ZV')).toMatch(/last character/);
  });
  it('rejects the wrong length', () => {
    expect(gstinProblem('27AAPFU0939F1Z')).toMatch(/15 characters/);
  });
  it('rejects the wrong shape', () => {
    expect(gstinProblem('27AAPFU0939F1XV')).toMatch(/does not look like a GSTIN/);
  });
  it('rejects an unknown state code even when the check character fits', () => {
    expect(gstinProblem('39AAPFU0939F1ZQ')).toMatch(/state code/);
  });
});

describe('normalizeGstin', () => {
  it('removes spaces and upper-cases', () => {
    expect(normalizeGstin(' 27aapfu 0939f1zv ')).toBe('27AAPFU0939F1ZV');
  });
});

describe('states', () => {
  it('knows GST state codes', () => {
    expect(stateName('24')).toBe('Gujarat');
    expect(stateName('27')).toBe('Maharashtra');
    expect(isStateCode('97')).toBe(true);
    expect(isStateCode('38')).toBe(true);
    expect(isStateCode('39')).toBe(false);
    expect(isStateCode('00')).toBe(false);
    expect(isStateCode('99')).toBe(false);
  });
});
