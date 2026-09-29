export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * closed → (N consecutive failures) → open → (cool-down) → half-open
 * half-open: one success closes the circuit, one failure opens it again.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private current: CircuitState = 'closed';

  constructor(
    private readonly threshold = 5,
    private readonly coolDownMs = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): CircuitState {
    if (this.current === 'open' && this.now() - this.openedAt >= this.coolDownMs)
      this.current = 'half-open';
    return this.current;
  }

  canRequest() {
    return this.state !== 'open';
  }

  success() {
    this.failures = 0;
    this.current = 'closed';
  }

  failure() {
    this.failures += 1;
    if (this.state === 'half-open' || this.failures >= this.threshold) {
      this.current = 'open';
      this.openedAt = this.now();
    }
  }

  retryAfterMs() {
    return this.state === 'open' ? Math.max(0, this.coolDownMs - (this.now() - this.openedAt)) : 0;
  }
}
