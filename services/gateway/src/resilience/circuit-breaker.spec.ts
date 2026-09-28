import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('opens after the threshold, half-opens after the cool-down and closes on success', () => {
    let now = 0;
    const breaker = new CircuitBreaker(2, 1000, () => now);
    breaker.failure();
    expect(breaker.canRequest()).toBe(true);
    breaker.failure();
    expect(breaker.state).toBe('open');
    expect(breaker.retryAfterMs()).toBe(1000);
    now = 1000;
    expect(breaker.state).toBe('half-open');
    breaker.failure();
    expect(breaker.state).toBe('open');
    now = 2500;
    breaker.success();
    expect(breaker.state).toBe('closed');
  });
});
