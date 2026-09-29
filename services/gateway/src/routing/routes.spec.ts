import { isInternalPath, resolveRoute } from './routes.js';

describe('route table', () => {
  it.each([
    ['/auth/login', 'identity'],
    ['/admin/users/1', 'identity'],
    ['/admin/products/1', 'catalog'],
    ['/products?q=x', 'catalog'],
    ['/seller/products', 'catalog'],
    ['/seller/orders', 'orders'],
    ['/webhooks/stripe', 'payments'],
    ['/realtime/socket.io/', 'engagement'],
    ['/ai/chat', 'ai'],
  ])('%s → %s', (path, service) => {
    expect(resolveRoute(path)?.service).toBe(service);
  });

  it('does not match partial words', () => {
    expect(resolveRoute('/productsX')).toBeUndefined();
  });

  it('detects internal endpoints anywhere in the path', () => {
    expect(isInternalPath('/internal/quote')).toBe(true);
    expect(isInternalPath('/users/internal/lookup')).toBe(true);
    expect(isInternalPath('/products/internals-guide')).toBe(false);
  });
});
