import Stripe from 'stripe';
import {
  PaymentProvider,
  type ChargeResult,
  type IntentRequest,
  type SavedCard,
  type TransferRequest,
} from './payment-provider.js';

/**
 * Stripe in test mode. Marketplace flow = "separate charges and transfers": the buyer pays the
 * platform once per order; each seller is paid later with a Transfer to their Connect (Express)
 * account, grouped by `transfer_group = orderId`.
 */
export class StripeProvider extends PaymentProvider {
  readonly name = 'stripe' as const;
  readonly stripe: Stripe;

  constructor(
    secretKey: string,
    readonly publishableKey: string | null,
  ) {
    super();
    this.stripe = new Stripe(secretKey);
  }

  async createIntent({ orderId, amount, currency, buyerEmail }: IntentRequest) {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount,
        currency: currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        receipt_email: buyerEmail,
        transfer_group: orderId,
        metadata: { orderId },
      },
      { idempotencyKey: `intent-${orderId}` },
    );
    return { ref: intent.id, clientSecret: intent.client_secret };
  }

  async clientSecret(ref: string) {
    return (await this.stripe.paymentIntents.retrieve(ref)).client_secret;
  }

  async cancelIntent(ref: string) {
    await this.stripe.paymentIntents.cancel(ref).catch(() => undefined);
  }

  async refund(ref: string, amount: number, reason: string) {
    const refund = await this.stripe.refunds.create({
      payment_intent: ref,
      amount,
      metadata: { reason },
    });
    return { ref: refund.id };
  }

  async transfer({ amount, currency, destination, transferGroup, sellerOrderId }: TransferRequest) {
    const transfer = await this.stripe.transfers.create(
      {
        amount,
        currency: currency.toLowerCase(),
        destination,
        transfer_group: transferGroup,
        metadata: { sellerOrderId },
      },
      { idempotencyKey: `transfer-${sellerOrderId}` },
    );
    return { ref: transfer.id };
  }

  async onboarding(storeId: string, email: string, returnUrl: string) {
    const account = await this.stripe.accounts.create({
      type: 'express',
      email,
      metadata: { storeId },
      capabilities: { transfers: { requested: true } },
    });
    const link = await this.stripe.accountLinks.create({
      account: account.id,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return { accountId: account.id, url: link.url };
  }

  async createCustomer(userId: string, email: string) {
    const customer = await this.stripe.customers.create(
      { email, metadata: { userId } },
      { idempotencyKey: `customer-${userId}` },
    );
    return customer.id;
  }

  async createSetup(customerId: string) {
    const setup = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'on_session',
    });
    return { clientSecret: setup.client_secret };
  }

  async completeSetup(setupRef: string, customerId: string): Promise<SavedCard> {
    const setup = await this.stripe.setupIntents.retrieve(setupRef, {
      expand: ['payment_method'],
    });
    const method = setup.payment_method as Stripe.PaymentMethod | null;
    if (setup.customer !== customerId || setup.status !== 'succeeded' || !method?.card) {
      throw new Error('The card was not saved');
    }
    return {
      ref: method.id,
      brand: method.card.brand,
      last4: method.card.last4,
      expMonth: method.card.exp_month,
      expYear: method.card.exp_year,
    };
  }

  /** Demo seed: Stripe's test token saves a real test Visa to the customer. */
  async attachTestCard(customerId: string): Promise<SavedCard> {
    const method = await this.stripe.paymentMethods.attach('pm_card_visa', {
      customer: customerId,
    });
    return {
      ref: method.id,
      brand: method.card!.brand,
      last4: method.card!.last4,
      expMonth: method.card!.exp_month,
      expYear: method.card!.exp_year,
    };
  }

  async detach(methodRef: string) {
    await this.stripe.paymentMethods.detach(methodRef).catch(() => undefined);
  }

  async chargeSaved(
    intentRef: string,
    customerId: string,
    method: Pick<SavedCard, 'ref' | 'brand' | 'last4'>,
    returnUrl: string,
  ): Promise<ChargeResult> {
    try {
      // A saved card belongs to a customer, so the intent must name it before confirming.
      await this.stripe.paymentIntents.update(intentRef, { customer: customerId });
      const intent = await this.stripe.paymentIntents.confirm(intentRef, {
        payment_method: method.ref,
        return_url: returnUrl,
      });
      if (intent.status === 'succeeded')
        return { status: 'succeeded', card: { brand: method.brand, last4: method.last4 } };
      if (intent.status === 'requires_action' && intent.client_secret)
        return { status: 'requires_action', clientSecret: intent.client_secret };
      return { status: 'failed', reason: intent.last_payment_error?.code ?? intent.status };
    } catch (error) {
      const err = error as Stripe.errors.StripeError;
      if (err.type === 'StripeCardError')
        return { status: 'failed', reason: err.code ?? 'card_declined' };
      throw error;
    }
  }

  parseWebhook(payload: Buffer, signature: string, secret: string) {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
