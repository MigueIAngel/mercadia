import type { Currency } from './money.js';

/**
 * Every message on the `mercadia:events` stream is an envelope around one of these
 * payloads. `correlationId` follows a business flow (usually the order id) across services.
 */
export interface EventEnvelope<T extends EventType = EventType> {
  id: string;
  type: T;
  source: string;
  occurredAt: string;
  correlationId: string;
  data: EventPayloads[T];
}

export interface OrderLineEvent {
  sellerOrderId: string;
  storeId: string;
  productId: string;
  variantSku: string;
  title: string;
  quantity: number;
  /** Unit price in the order currency, tax included, minor units. */
  unitPrice: number;
}

export interface EventPayloads {
  // identity
  'user.registered': { userId: string; email: string; name: string; locale: string };
  'store.opened': { storeId: string; ownerId: string; name: string; slug: string };
  'store.updated': { storeId: string; name: string; slug: string; logoUrl?: string | null };

  // catalog
  'product.published': {
    productId: string;
    storeId: string;
    title: string;
    category: string;
    priceUsd: number;
    imageUrl?: string;
  };
  'product.updated': { productId: string; storeId: string; title: string; category: string };
  'product.unpublished': { productId: string; storeId: string };
  'product.price_changed': {
    productId: string;
    title: string;
    oldPriceUsd: number;
    newPriceUsd: number;
  };
  'stock.reserved': { orderId: string };
  'stock.rejected': { orderId: string; reason: string; sku?: string };
  'stock.released': { orderId: string };

  // orders
  'order.placed': {
    orderId: string;
    buyerId: string;
    buyerEmail: string;
    currency: Currency;
    total: number;
    lines: OrderLineEvent[];
  };
  'order.paid': { orderId: string; buyerId: string };
  'order.cancelled': { orderId: string; buyerId: string; reason: string };
  'seller_order.status_changed': {
    orderId: string;
    sellerOrderId: string;
    storeId: string;
    buyerId: string;
    status: string;
  };

  // payments
  'payment.succeeded': { orderId: string; paymentId: string; amount: number; currency: Currency };
  'payment.failed': { orderId: string; paymentId: string; reason: string };
  'refund.succeeded': {
    orderId: string;
    sellerOrderId: string;
    amount: number;
    currency: Currency;
  };
  'store.payouts_enabled': { storeId: string };

  // fulfillment
  'shipment.status_changed': {
    orderId: string;
    sellerOrderId: string;
    buyerId: string;
    trackingNumber: string;
    status: string;
  };
  'dispute.opened': { disputeId: string; orderId: string; sellerOrderId: string; storeId: string };
  'dispute.resolved': {
    disputeId: string;
    orderId: string;
    sellerOrderId: string;
    resolution: 'refund' | 'partial_refund' | 'rejected';
    refundAmount: number;
    currency: Currency;
  };

  // engagement
  'review.created': { reviewId: string; productId: string; storeId: string; rating: number };
}

export type EventType = keyof EventPayloads;

export const EVENTS_STREAM = 'mercadia:events';
