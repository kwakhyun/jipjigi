/** Shares one connection attempt, drops failed promises and bounds reconnect frequency. */
export class ConnectionCache<T> {
  private pending: Promise<T> | undefined;
  private retryAt = 0;
  private failure: unknown;

  constructor(private readonly create: () => Promise<T>, private readonly dispose: (value: T) => Promise<void>, private readonly cooldownMs = 1_000) {}

  get(): Promise<T> {
    if (this.pending) return this.pending;
    if (Date.now() < this.retryAt) return Promise.reject(this.failure);
    const attempt = Promise.resolve().then(this.create);
    this.pending = attempt;
    void attempt.catch((error: unknown) => {
      if (this.pending !== attempt) return;
      this.pending = undefined;
      this.failure = error;
      this.retryAt = Date.now() + this.cooldownMs;
    });
    return attempt;
  }

  async close() {
    const attempt = this.pending;
    try {
      if (attempt) await this.dispose(await attempt);
    } catch {
      // A failed creation already disposed any resources it acquired.
    } finally {
      if (this.pending === attempt) this.pending = undefined;
      this.failure = undefined;
      this.retryAt = 0;
    }
  }
}
