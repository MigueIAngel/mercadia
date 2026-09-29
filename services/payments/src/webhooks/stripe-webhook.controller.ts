import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { Public } from '@mercadia/service-kit';
import { CONFIG, type PaymentsConfig } from '../config.js';
import { DB, type Database } from '../db/database.module.js';
import { webhookEvents } from '../db/schema.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PaymentProvider } from '../providers/payment-provider.js';
import { StripeProvider } from '../providers/stripe.provider.js';

/** Stripe → us. The signature is verified on the raw body; events are handled once. */
@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(
    @Inject(CONFIG) private readonly config: PaymentsConfig,
    @Inject(DB) private readonly db: Database,
    private readonly provider: PaymentProvider,
    private readonly payments: PaymentsService,
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!(this.provider instanceof StripeProvider) || !this.config.stripeWebhookSecret) {
      throw new BadRequestException('Stripe is not configured');
    }
    // Platform events (payments) and Connect events (seller accounts) come from two Stripe
    // endpoints with their own signing secrets: STRIPE_WEBHOOK_SECRET may list both.
    let event: Stripe.Event | undefined;
    for (const secret of this.config.stripeWebhookSecret.split(',')) {
      try {
        event = this.provider.parseWebhook(req.rawBody!, signature, secret.trim());
        break;
      } catch {
        // try the next secret
      }
    }
    if (!event) throw new BadRequestException('Invalid signature');
    const inserted = await this.db
      .insert(webhookEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) return { received: true, duplicate: true };

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      const card = intent.payment_method_types.includes('card')
        ? await this.cardOf(intent)
        : undefined;
      await this.payments.succeed(intent.id, card);
    } else if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object;
      await this.payments.fail(intent.id, intent.last_payment_error?.code ?? 'payment_failed');
    } else if (event.type === 'account.updated') {
      const account = event.data.object;
      await this.payments.accountUpdated(account.id, account.payouts_enabled ?? false);
    }
    return { received: true };
  }

  private async cardOf(intent: Stripe.PaymentIntent) {
    if (typeof intent.payment_method !== 'string' || !(this.provider instanceof StripeProvider))
      return undefined;
    const method = await this.provider.stripe.paymentMethods.retrieve(intent.payment_method);
    return method.card ? { brand: method.card.brand, last4: method.card.last4 } : undefined;
  }
}
