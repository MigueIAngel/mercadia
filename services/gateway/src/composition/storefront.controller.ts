import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@mercadia/service-kit';
import { ServiceRegistry } from '../resilience/registry.js';

interface Page {
  items: unknown[];
}

/**
 * API composition: the home page needs data from several services; one round trip from the
 * browser instead of five. Sections that fail are returned empty rather than failing the page.
 */
@ApiTags('gateway')
@Controller('api/storefront')
export class StorefrontController {
  constructor(private readonly registry: ServiceRegistry) {}

  @Public()
  @Get('home')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Categories, best sellers, deals, new arrivals and stores in one call' })
  async home(@Query('currency') currency = 'COP') {
    const cur = currency === 'USD' ? 'USD' : 'COP';
    const list = (params: string) =>
      this.registry
        .getJson<Page>('catalog', `/products?currency=${cur}&limit=8&${params}`)
        .then((p) => p.items);
    const results = await Promise.allSettled([
      this.registry.getJson<unknown[]>('catalog', '/categories'),
      list('sort=bestselling'),
      list('onSale=true&sort=rating'),
      list('sort=newest'),
      list('sort=rating&inStock=true'),
      this.registry.getJson<unknown[]>('identity', '/stores'),
    ]);
    const value = <T>(r: PromiseSettledResult<T>, fallback: T) =>
      r.status === 'fulfilled' ? r.value : fallback;
    return {
      currency: cur,
      categories: value(results[0], []),
      bestSellers: value(results[1], []),
      deals: value(results[2], []),
      newArrivals: value(results[3], []),
      topRated: value(results[4], []),
      stores: value(results[5], []),
      degraded: results.some((r) => r.status === 'rejected'),
    };
  }
}
