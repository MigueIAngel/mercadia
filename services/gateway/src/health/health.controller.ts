import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@mercadia/service-kit';
import { SERVICES } from '../config.js';
import { ServiceRegistry } from '../resilience/registry.js';

@ApiTags('gateway')
@Controller('api/health')
export class GatewayHealthController {
  constructor(private readonly registry: ServiceRegistry) {}

  /** Status, latency and circuit state of every service (the web app shows this). */
  @Public()
  @Get()
  async check() {
    const entries = await Promise.all(
      SERVICES.map(async (service) => {
        const started = performance.now();
        try {
          const body = await this.registry.getJson<{ status: string }>(service, '/health', {
            timeoutMs: 8000,
          });
          return [
            service,
            {
              status: body.status === 'up' ? 'up' : 'degraded',
              latencyMs: Math.round(performance.now() - started),
              circuit: this.registry.breakers[service].state,
            },
          ] as const;
        } catch {
          return [
            service,
            { status: 'down', latencyMs: null, circuit: this.registry.breakers[service].state },
          ] as const;
        }
      }),
    );
    const statuses = entries.map(([, s]) => s.status);
    const status = statuses.every((s) => s === 'up')
      ? 'up'
      : statuses.every((s) => s === 'down')
        ? 'down'
        : 'degraded';
    return { status, services: Object.fromEntries(entries) };
  }
}
