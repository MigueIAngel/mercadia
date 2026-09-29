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

export interface SavedCard {
  ref: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export type ChargeResult =
  | { status: 'succeeded'; card: { brand: string; last4: string } }
  | { status: 'requires_action'; clientSecret: string }
  | { status: 'failed'; reason: string };

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

  // ----- saved cards -----
  abstract createCustomer(userId: string, email: string): Promise<string>;
  /** Starts saving a card (Stripe SetupIntent); null when the card form is our own. */
  abstract createSetup(customerId: string): Promise<{ clientSecret: string | null }>;
  /** Reads the card a finished SetupIntent saved, checking it belongs to the customer. */
  abstract completeSetup(setupRef: string, customerId: string): Promise<SavedCard>;
  abstract detach(methodRef: string): Promise<void>;
  /** Charges an open intent with a saved card. */
  abstract chargeSaved(
    intentRef: string,
    customerId: string,
    method: Pick<SavedCard, 'ref' | 'brand' | 'last4'>,
    returnUrl: string,
  ): Promise<ChargeResult>;
}
