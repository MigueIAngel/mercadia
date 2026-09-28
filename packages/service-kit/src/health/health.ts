import { Controller, Get, Global, Injectable, Module, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators.js';

type Check = () => Promise<unknown>;

/** Services register their dependencies (database, Redis, ...) at startup. */
@Injectable()
export class HealthRegistry {
  readonly checks = new Map<string, Check>();
  service = 'unknown';

  add(name: string, check: Check) {
    this.checks.set(name, check);
  }

  async run() {
    const results: Record<string, 'up' | 'down'> = {};
    await Promise.all(
      [...this.checks].map(async ([name, check]) => {
        try {
          await Promise.race([
            check(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
          ]);
          results[name] = 'up';
        } catch {
          results[name] = 'down';
        }
      }),
    );
    const status = Object.values(results).every((r) => r === 'up') ? 'up' : 'degraded';
    return { status, service: this.service, checks: results };
  }
}

@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(private readonly registry: HealthRegistry) {}

  @Public()
  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    const result = await this.registry.run();
    if (result.status !== 'up') res.status(503);
    return result;
  }
}

@Global()
@Module({
  controllers: [HealthController],
  providers: [HealthRegistry],
  exports: [HealthRegistry],
})
export class HealthModule {}
