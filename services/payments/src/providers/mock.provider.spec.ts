import { luhn, simulateCharge } from './mock.provider.js';

const card = (
  number: string,
  extra: Partial<{ expMonth: number; expYear: number; cvc: string }> = {},
) => simulateCharge({ number, expMonth: 12, expYear: 2030, cvc: '123', ...extra });

describe('simulated processor', () => {
  it('validates card numbers with the Luhn checksum', () => {
    expect(luhn('4242424242424242')).toBe(true);
    expect(luhn('4242424242424241')).toBe(false);
    expect(card('4242 4242 4242 4241')).toEqual({ ok: false, reason: 'invalid_number' });
  });

  it("follows Stripe's test cards", () => {
    expect(card('4242 4242 4242 4242')).toEqual({ ok: true, brand: 'visa' });
    expect(card('4000000000000002')).toEqual({ ok: false, reason: 'card_declined' });
    expect(card('4000000000009995')).toEqual({ ok: false, reason: 'insufficient_funds' });
  });

  it('rejects expired cards and bad CVCs', () => {
    expect(card('4242424242424242', { expYear: 2020 })).toEqual({
      ok: false,
      reason: 'expired_card',
    });
    expect(card('4242424242424242', { cvc: '1' })).toEqual({ ok: false, reason: 'incorrect_cvc' });
  });
});
