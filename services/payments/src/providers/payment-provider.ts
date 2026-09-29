import type { Currency } from '@mercadia/contracts';

export interface IntentRequest {
  orderId: string;
  amount: number;
  currency: Currency;
  buyerEmail: string;
}

export interface TransferRequest {
  amount: number;
  currency: Currency;
  destination: string;
  transferGroup: string;
  sellerOrderId: string;
}

/**
 * The payment processor behind the service. Stripe is used when test keys are configured;
 * otherwise a simulated processor with Stripe's test card numbers keeps the demo usable.
 */
export abstract class PaymentProvider {
  abstract readonly name: 'stripe' | 'mock';
  abstract readonly publishableKey: string | null;
  abstract createIntent(
    request: IntentRequest,
  ): Promise<{ ref: string; clientSecret: string | null }>;
  abstract clientSecret(ref: string): Promise<string | null>;
  abstract cancelIntent(ref: string): Promise<void>;
  abstract refund(ref: string, amount: number, reason: string): Promise<{ ref: string }>;
  abstract transfer(request: TransferRequest): Promise<{ ref: string }>;
  abstract onboarding(
    storeId: string,
    email: string,
    returnUrl: string,
  ): Promise<{ accountId: string; url: string | null }>;
}
