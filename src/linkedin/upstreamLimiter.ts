export class UpstreamLimiter {
  private queue: Promise<unknown> = Promise.resolve();
  private lastStartedAt = 0;

  constructor(private readonly minIntervalMs: number) {}
  
  run<T>(task: () => Promise<T>): Promise<T> {
    const scheduled = this.queue.then(async () => {
      const waitMs = this.lastStartedAt + this.minIntervalMs - Date.now();
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.lastStartedAt = Date.now();
      return task();
    });

    this.queue = scheduled.catch(() => undefined);
    return scheduled;
  }
}
