import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, SERVICES, type GatewayConfig, type ServiceName } from '../config.js';
import { CircuitBreaker } from './circuit-breaker.js';

export class UpstreamError extends Error {
  constructor(
    readonly service: ServiceName,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

/** Where each service lives and its circuit breaker; also a small JSON client. */
@Injectable()
export class ServiceRegistry {
  readonly breakers: Record<ServiceName, CircuitBreaker>;

  constructor(@Inject(CONFIG) private readonly config: GatewayConfig) {
    this.breakers = Object.fromEntries(
      SERVICES.map((s) => [
        s,
        new CircuitBreaker(config.breakerThreshold, config.breakerCooldownMs),
      ]),
    ) as Record<ServiceName, CircuitBreaker>;
  }

  url(service: ServiceName) {
    return this.config.urls[service];
  }

  async getJson<T>(
    service: ServiceName,
    path: string,
    {
      timeoutMs = 5000,
      headers = {},
    }: { timeoutMs?: number; headers?: Record<string, string> } = {},
  ): Promise<T> {
    const breaker = this.breakers[service];
    if (!breaker.canRequest()) throw new UpstreamError(service, null, `${service} circuit open`);
    let response: Response;
    try {
      response = await fetch(`${this.url(service)}${path}`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers,
      });
    } catch (error) {
      breaker.failure();
      throw new UpstreamError(service, null, `${service} unreachable: ${String(error)}`);
    }
    if (response.status >= 500) {
      breaker.failure();
      throw new UpstreamError(service, response.status, `${service} failed`);
    }
    breaker.success();
    if (!response.ok) throw new UpstreamError(service, response.status, await response.text());
    return (await response.json()) as T;
  }
}
