import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '@mercadia/service-kit';
import { CONFIG, type PaymentsConfig } from '../config.js';
import { DB, type Database } from '../db/database.module.js';
import { paymentCustomers, paymentMethods, payments, type PaymentMethod } from '../db/schema.js';
import { simulateCharge } from '../providers/mock.provider.js';
import { PaymentProvider, type SavedCard } from '../providers/payment-provider.js';
import { PaymentsService } from '../payments/payments.service.js';

export interface CardInput {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
}

/** Saved cards: add (Stripe SetupIntent or simulated), list, default, remove and pay with one. */
@Injectable()
export class MethodsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: PaymentsConfig,
    private readonly provider: PaymentProvider,
    private readonly payments: PaymentsService,
  ) {}

  private view(m: PaymentMethod) {
    return {
      id: m.id,
      brand: m.brand,
      last4: m.last4,
      expMonth: m.expMonth,
      expYear: m.expYear,
      isDefault: m.isDefault,
      createdAt: m.createdAt,
    };
  }

  async list(userId: string) {
    const rows = await this.db
      .select()
      .from(paymentMethods)
      .where(
        and(eq(paymentMethods.userId, userId), eq(paymentMethods.provider, this.provider.name)),
      )
      .orderBy(desc(paymentMethods.isDefault), desc(paymentMethods.createdAt));
    return rows.map((m) => this.view(m));
  }

  /** The processor's customer for this user, created on first use. */
  async customerOf(user: Pick<AuthUser, 'sub' | 'email'>) {
    const [existing] = await this.db
      .select()
      .from(paymentCustomers)
      .where(eq(paymentCustomers.userId, user.sub));
    if (existing && existing.provider === this.provider.name) return existing.providerCustomerId;
    const id = await this.provider.createCustomer(user.sub, user.email);
    await this.db
      .insert(paymentCustomers)
      .values({ userId: user.sub, provider: this.provider.name, providerCustomerId: id })
      .onConflictDoUpdate({
        target: paymentCustomers.userId,
        set: { provider: this.provider.name, providerCustomerId: id },
      });
    return id;
  }

  /** Stripe: a SetupIntent for the card form. Simulated: the form posts the card to `saveTestCard`. */
  async setup(user: AuthUser) {
    if (this.provider.name === 'mock') return { provider: 'mock' as const };
    const { clientSecret } = await this.provider.createSetup(await this.customerOf(user));
    return {
      provider: 'stripe' as const,
      clientSecret,
      publishableKey: this.provider.publishableKey,
    };
  }

  async completeSetup(user: AuthUser, setupIntentId: string) {
    if (this.provider.name !== 'stripe') throw new BadRequestException('Stripe is not configured');
    let card: SavedCard;
    try {
      card = await this.provider.completeSetup(setupIntentId, await this.customerOf(user));
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    return this.store(user.sub, card);
  }

  /** Simulated processor: validates like a real one (Luhn, expiry, CVC, test declines). */
  async saveTestCard(user: AuthUser, card: CardInput) {
    if (this.provider.name !== 'mock') throw new BadRequestException('Use Stripe Elements');
    const outcome = simulateCharge(card);
    if (!outcome.ok) throw new BadRequestException(outcome.reason);
    const number = card.number.replace(/\s+/g, '');
    return this.store(user.sub, {
      ref: `mock_pm_${randomUUID()}`,
      brand: outcome.brand,
      last4: number.slice(-4),
      expMonth: card.expMonth,
      expYear: card.expYear < 100 ? 2000 + card.expYear : card.expYear,
    });
  }

  /** The first card becomes the default one. The same Stripe card saved twice is kept once. */
  async store(userId: string, card: SavedCard) {
    const current = await this.list(userId);
    const duplicate = current.find(
      (m) =>
        m.brand === card.brand &&
        m.last4 === card.last4 &&
        m.expMonth === card.expMonth &&
        m.expYear === card.expYear,
    );
    if (duplicate) {
      if (this.provider.name === 'stripe') await this.provider.detach(card.ref);
      return duplicate;
    }
    const [saved] = await this.db
      .insert(paymentMethods)
      .values({
        userId,
        provider: this.provider.name,
        providerRef: card.ref,
        brand: card.brand,
        last4: card.last4,
        expMonth: card.expMonth,
        expYear: card.expYear,
        isDefault: current.length === 0,
      })
      .returning();
    return this.view(saved);
  }

  private async own(userId: string, id: string) {
    const [method] = await this.db
      .select()
      .from(paymentMethods)
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, userId)));
    if (!method) throw new NotFoundException();
    return method;
  }

  async makeDefault(userId: string, id: string) {
    await this.own(userId, id);
    await this.db.transaction(async (tx) => {
      await tx
        .update(paymentMethods)
        .set({ isDefault: false })
        .where(and(eq(paymentMethods.userId, userId), ne(paymentMethods.id, id)));
      await tx.update(paymentMethods).set({ isDefault: true }).where(eq(paymentMethods.id, id));
    });
    return this.list(userId);
  }

  async remove(userId: string, id: string) {
    const method = await this.own(userId, id);
    await this.provider.detach(method.providerRef);
    await this.db.delete(paymentMethods).where(eq(paymentMethods.id, id));
    if (method.isDefault) {
      const [next] = await this.list(userId);
      if (next) await this.makeDefault(userId, next.id);
    }
  }

  /**
   * Pays an order with a saved card. Stripe may still ask for 3-D Secure: then the browser
   * finishes it with the returned client secret and the webhook records the result.
   */
  async payWithSaved(paymentId: string, user: AuthUser, methodId: string) {
    const [payment] = await this.db.select().from(payments).where(eq(payments.id, paymentId));
    if (!payment || payment.buyerId !== user.sub) throw new NotFoundException();
    if (payment.status !== 'requires_payment')
      throw new ConflictException(`Payment is ${payment.status}`);
    const method = await this.own(user.sub, methodId);
    const result = await this.provider.chargeSaved(
      payment.providerRef!,
      await this.customerOf(user),
      { ref: method.providerRef, brand: method.brand, last4: method.last4 },
      `${this.config.siteUrl}/es/pay/${payment.orderId}`,
    );
    if (result.status === 'succeeded')
      await this.payments.succeed(payment.providerRef!, result.card);
    else if (result.status === 'failed')
      await this.payments.fail(payment.providerRef!, result.reason, method.last4);
    const view = await this.payments.status(payment.orderId, user);
    return {
      ...view,
      nextActionClientSecret: result.status === 'requires_action' ? result.clientSecret : null,
    };
  }
}
