import { randomUUID } from 'node:crypto';
import { PaymentProvider } from './payment-provider.js';

export type MockOutcome = { ok: true; brand: string } | { ok: false; reason: string };

/** Same test numbers as Stripe, so the demo teaches the real flow. */
export const TEST_CARDS: Record<string, MockOutcome> = {
  '4242424242424242': { ok: true, brand: 'visa' },
  '5555555555554444': { ok: true, brand: 'mastercard' },
  '378282246310005': { ok: true, brand: 'amex' },
  '4000000000000002': { ok: false, reason: 'card_declined' },
  '4000000000009995': { ok: false, reason: 'insufficient_funds' },
  '4000000000000069': { ok: false, reason: 'expired_card' },
};

export function luhn(number: string) {
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let digit = Number(number[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Decides the result of a simulated card payment. Card data is never stored. */
export function simulateCharge(card: {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
}): MockOutcome {
  const number = card.number.replace(/\s+/g, '');
  if (!/^\d{13,19}$/.test(number) || !luhn(number)) return { ok: false, reason: 'invalid_number' };
  const now = new Date();
  const year = card.expYear < 100 ? 2000 + card.expYear : card.expYear;
  if (
    year < now.getFullYear() ||
    (year === now.getFullYear() && card.expMonth < now.getMonth() + 1)
  ) {
    return { ok: false, reason: 'expired_card' };
  }
  if (!/^\d{3,4}$/.test(card.cvc)) return { ok: false, reason: 'incorrect_cvc' };
  return (
    TEST_CARDS[number] ?? {
      ok: true,
      brand: number.startsWith('4') ? 'visa' : number.startsWith('5') ? 'mastercard' : 'card',
    }
  );
}

export class MockProvider extends PaymentProvider {
  readonly name = 'mock' as const;
  readonly publishableKey = null;

  async createIntent() {
    return { ref: `mock_pi_${randomUUID()}`, clientSecret: null };
  }
  async clientSecret() {
    return null;
  }
  async cancelIntent() {}
  async refund() {
    return { ref: `mock_re_${randomUUID()}` };
  }
  async transfer() {
    return { ref: `mock_tr_${randomUUID()}` };
  }
  async onboarding(storeId: string) {
    return { accountId: `mock_acct_${storeId.slice(0, 8)}`, url: null };
  }
}
