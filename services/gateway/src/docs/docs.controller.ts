import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@mercadia/service-kit';
import { SERVICES, type ServiceName } from '../config.js';
import { ServiceRegistry } from '../resilience/registry.js';

/** Each service's OpenAPI document, rewritten so "Try it out" goes through the gateway. */
@ApiExcludeController()
@Controller('api/docs')
export class DocsController {
  constructor(private readonly registry: ServiceRegistry) {}

  @Public()
  @Get(':service/openapi.json')
  async document(@Param('service') service: string) {
    if (!SERVICES.includes(service as ServiceName)) throw new NotFoundException();
    const doc = await this.registry.getJson<{ paths: Record<string, unknown> }>(
      service as ServiceName,
      '/openapi.json',
      { timeoutMs: 10_000 },
    );
    const paths = Object.fromEntries(
      Object.entries(doc.paths).filter(([p]) => p !== '/health' && !p.includes('/internal')),
    );
    return { ...doc, servers: [{ url: '/api' }], paths };
  }
}
