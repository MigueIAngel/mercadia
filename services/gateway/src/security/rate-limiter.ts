import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Redis } from 'ioredis';
import { CONFIG, type GatewayConfig } from '../config.js';

const WINDOW_SECONDS = 60;
const AUTH_PATHS = /^\/api\/auth\/(login|register|login\/2fa|google|demo)/;

/**
 * Fixed-window limits per client IP stored in Redis, so every gateway replica shares them.
 * Sign-in endpoints get a much smaller budget than normal reads.
 */
@Injectable()
export class RateLimiter implements OnModuleDestroy {
  readonly redis: Redis;

  constructor(@Inject(CONFIG) private readonly config: GatewayConfig) {
    this.redis = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
    });
  }

  bucket(req: Request): { name: 'auth' | 'write' | 'read'; limit: number } {
    if (AUTH_PATHS.test(req.path)) return { name: 'auth', limit: this.config.rateLimits.auth };
    if (req.method === 'GET' || req.method === 'HEAD')
      return { name: 'read', limit: this.config.rateLimits.read };
    return { name: 'write', limit: this.config.rateLimits.write };
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.path.startsWith('/api/') || req.path.startsWith('/api/webhooks/')) return next();
      // The web app calls from its server and forwards the browser IP.
      const forwarded = req.headers['x-client-ip'];
      const ip = (typeof forwarded === 'string' && forwarded) || req.ip || 'unknown';
      const { name, limit } = this.bucket(req);
      const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
      const key = `ratelimit:${name}:${ip}:${window}`;
      let count: number;
      try {
        count = await this.redis.incr(key);
        if (count === 1) await this.redis.expire(key, WINDOW_SECONDS);
      } catch {
        return next(); // fail open: Redis trouble must not take the API down
      }
      res.setHeader('RateLimit-Limit', String(limit));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - count)));
      if (count > limit) {
        const retryAfter = WINDOW_SECONDS - (Math.floor(Date.now() / 1000) % WINDOW_SECONDS);
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({ statusCode: 429, message: 'Too many requests', retryAfter });
        return;
      }
      next();
    };
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}
