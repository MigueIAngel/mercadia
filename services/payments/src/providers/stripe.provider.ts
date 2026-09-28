import Stripe from 'stripe';
import { PaymentProvider, type IntentRequest, type TransferRequest } from './payment-provider.js';

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

  parseWebhook(payload: Buffer, signature: string, secret: string) {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
