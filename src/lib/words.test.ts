import { describe, expect, it } from 'vitest';
import { amountInWords } from './words';

describe('amountInWords', () => {
  it.each([
    [0, 'Rupees Zero Only'],
    [1, 'Rupees One Only'],
    [15, 'Rupees Fifteen Only'],
    [21, 'Rupees Twenty-One Only'],
    [100, 'Rupees One Hundred Only'],
    [105, 'Rupees One Hundred Five Only'],
    [1000, 'Rupees One Thousand Only'],
    [100000, 'Rupees One Lakh Only'],
    [112345, 'Rupees One Lakh Twelve Thousand Three Hundred Forty-Five Only'],
    [100000000, 'Rupees Ten Crore Only'],
    ['1000000000000', 'Rupees One Lakh Crore Only'],
  ])('%s', (amount, words) => {
    expect(amountInWords(amount)).toBe(words);
  });
  it('accepts the grand total as a string', () => {
    expect(amountInWords('653')).toBe('Rupees Six Hundred Fifty-Three Only');
  });
});
