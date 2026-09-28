import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { convert, type Currency } from '@mercadia/contracts';
import { CONFIG, type CatalogConfig } from '../config.js';

const REFRESH_MS = 12 * 3600 * 1000;

/**
 * USD→COP rate from a free public API (open.er-api.com, no key), refreshed twice a day.
 * If the API is unreachable the configured fallback rate is used.
 */
@Injectable()
export class RatesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RatesService.name);
  private usdToCop: number;
  private updatedAt = new Date();
  private source: 'live' | 'fallback' = 'fallback';
  private timer?: NodeJS.Timeout;

  constructor(@Inject(CONFIG) private readonly config: CatalogConfig) {
    this.usdToCop = config.usdToCop;
  }

  async onModuleInit() {
    if (!this.config.fetchRates) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async refresh() {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD', {
        signal: AbortSignal.timeout(5000),
      });
      const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
      const cop = body.rates?.COP;
      if (body.result === 'success' && cop && cop > 1000 && cop < 10000) {
        this.usdToCop = Math.round(cop);
        this.updatedAt = new Date();
        this.source = 'live';
      }
    } catch (error) {
      this.logger.warn(`FX refresh failed, keeping ${this.usdToCop}: ${String(error)}`);
    }
  }

  get rate() {
    return this.usdToCop;
  }

  snapshot() {
    return {
      base: 'USD',
      rates: { USD: 1, COP: this.usdToCop },
      source: this.source,
      updatedAt: this.updatedAt,
    };
  }

  /** USD cents → minor units of `currency`. COP prices are rounded to whole pesos x100. */
  fromUsd(amountUsd: number, currency: Currency): number {
    const value = convert(amountUsd, 'USD', currency, this.usdToCop);
    return currency === 'COP' ? Math.round(value / 10000) * 10000 : value;
  }

  toUsd(amount: number, currency: Currency): number {
    return convert(amount, currency, 'USD', this.usdToCop);
  }
}
