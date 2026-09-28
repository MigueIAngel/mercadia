import { HttpException, HttpStatus, Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { HealthRegistry } from '@mercadia/service-kit';
import { CONFIG, type IdentityConfig } from '../config.js';

const MAX_FAILURES = 5;
const WINDOW_SECONDS = 15 * 60;

/** Brute-force protection: 5 failed attempts per account lock it for 15 minutes. */
@Injectable()
export class LoginThrottleService implements OnModuleDestroy {
  readonly redis: Redis;

  constructor(@Inject(CONFIG) config: IdentityConfig, health: HealthRegistry) {
    this.redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
    health.add('redis', () => this.redis.ping());
  }

  private key(email: string) {
    return `login-failures:${email.toLowerCase()}`;
  }

  async assertNotLocked(email: string) {
    const failures = Number(await this.redis.get(this.key(email)));
    if (failures >= MAX_FAILURES) {
      const ttl = await this.redis.ttl(this.key(email));
      throw new HttpException(
        { statusCode: 429, message: 'Too many failed attempts. Try again later.', retryAfter: ttl },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Returns true when this failure locked the account. */
  async registerFailure(email: string): Promise<boolean> {
    const key = this.key(email);
    const failures = await this.redis.incr(key);
    if (failures === 1) await this.redis.expire(key, WINDOW_SECONDS);
    return failures === MAX_FAILURES;
  }

  async reset(email: string) {
    await this.redis.del(this.key(email));
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}
