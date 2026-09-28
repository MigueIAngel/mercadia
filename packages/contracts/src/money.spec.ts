import { describe, expect, it } from 'vitest';
import { convert, formatMoney, splitTax } from './money.js';
import { ivaRate } from './tax.js';

describe('money', () => {
  it('converts between USD and COP in minor units', () => {
    expect(convert(1000, 'USD', 'COP', 4100)).toBe(4_100_000);
    expect(convert(4_100_000, 'COP', 'USD', 4100)).toBe(1000);
    expect(convert(123, 'USD', 'USD', 4100)).toBe(123);
  });

  it('splits IVA out of a tax-inclusive price', () => {
    expect(splitTax(11900, 0.19)).toEqual({ net: 10000, tax: 1900 });
    expect(splitTax(10000, 0)).toEqual({ net: 10000, tax: 0 });
  });

  it('uses the reduced rate for groceries', () => {
    expect(ivaRate('groceries')).toBe(0.05);
    expect(ivaRate('laptops')).toBe(0.19);
  });

  it('formats COP without decimals', () => {
    expect(formatMoney({ amount: 4_100_000, currency: 'COP' })).toMatch(/41\.000/);
    expect(formatMoney({ amount: 1999, currency: 'USD' }, 'en-US')).toBe('$19.99');
  });
});
