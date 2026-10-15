type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private nextAttempt = 0;

  constructor(
    private readonly threshold: number = 5,
    private readonly cooldownMs: number = 30000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        const retryInSeconds = Math.max(1, Math.ceil((this.nextAttempt - Date.now()) / 1000));
        throw new Error(`Provider temporarily unavailable after repeated failures. Retry in about ${retryInSeconds} seconds.`);
      }
      this.state = 'half-open';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  getState(): CircuitState {
    if (this.state === 'open' && Date.now() >= this.nextAttempt) {
      this.state = 'half-open';
    }
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  getRemainingCooldownMs(): number {
    return this.state === 'open' ? Math.max(0, this.nextAttempt - Date.now()) : 0;
  }

  // Force the circuit into open state for the cooldown period.
  trip(): void {
    this.failureCount = this.threshold;
    this.state = 'open';
    this.nextAttempt = Date.now() + this.cooldownMs;
  }

  reset(): void {
    this.failureCount = 0;
    this.state = 'closed';
    this.nextAttempt = 0;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.cooldownMs;
    }
  }
}
