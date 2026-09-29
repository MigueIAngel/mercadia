import type { ServiceName } from '../config.js';

/**
 * Public API surface: `/api/<path>` is forwarded to the service that owns `<path>`.
 * The first matching prefix wins, so more specific prefixes come first.
 */
export const ROUTES: { prefix: string; service: ServiceName; websocket?: boolean }[] = [
  // identity
  { prefix: '/auth', service: 'identity' },
  { prefix: '/users', service: 'identity' },
  { prefix: '/stores', service: 'identity' },
  { prefix: '/admin/users', service: 'identity' },
  { prefix: '/admin/stores', service: 'identity' },
  { prefix: '/admin/audit', service: 'identity' },
  { prefix: '/admin/stats', service: 'identity' },
  // catalog
  { prefix: '/categories', service: 'catalog' },
  { prefix: '/products', service: 'catalog' },
  { prefix: '/currency', service: 'catalog' },
  { prefix: '/seller/products', service: 'catalog' },
  { prefix: '/seller/uploads', service: 'catalog' },
  { prefix: '/admin/products', service: 'catalog' },
  { prefix: '/admin/catalog-stats', service: 'catalog' },
  // orders
  { prefix: '/cart', service: 'orders' },
  { prefix: '/checkout', service: 'orders' },
  { prefix: '/orders', service: 'orders' },
  { prefix: '/seller/orders', service: 'orders' },
  { prefix: '/seller/sales', service: 'orders' },
  { prefix: '/admin/orders', service: 'orders' },
  // payments
  { prefix: '/payments', service: 'payments' },
  { prefix: '/webhooks/stripe', service: 'payments' },
  { prefix: '/seller/payouts', service: 'payments' },
  { prefix: '/admin/payments', service: 'payments' },
  // fulfillment
  { prefix: '/addresses', service: 'fulfillment' },
  { prefix: '/shipping', service: 'fulfillment' },
  { prefix: '/shipments', service: 'fulfillment' },
  { prefix: '/returns', service: 'fulfillment' },
  { prefix: '/disputes', service: 'fulfillment' },
  { prefix: '/seller/shipments', service: 'fulfillment' },
  { prefix: '/seller/returns', service: 'fulfillment' },
  { prefix: '/admin/disputes', service: 'fulfillment' },
  // engagement
  { prefix: '/reviews', service: 'engagement' },
  { prefix: '/wishlist', service: 'engagement' },
  { prefix: '/conversations', service: 'engagement' },
  { prefix: '/notifications', service: 'engagement' },
  { prefix: '/realtime', service: 'engagement', websocket: true },
  { prefix: '/seller/reviews', service: 'engagement' },
  { prefix: '/reputation', service: 'engagement' },
  // ai
  { prefix: '/ai', service: 'ai' },
];

export function resolveRoute(path: string) {
  return ROUTES.find(
    (r) => path === r.prefix || path.startsWith(`${r.prefix}/`) || path.startsWith(`${r.prefix}?`),
  );
}

/** Service-to-service endpoints are never reachable from outside. */
export const isInternalPath = (path: string) => /(^|\/)internal(\/|$)/.test(path);
