import "server-only";

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class TourRequestCache {
  private readonly values = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<unknown>>();

  async getOrLoad<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
    now = Date.now(),
  ): Promise<T> {
    const cached = this.values.get(key);
    if (cached && cached.expiresAt > now) return cached.value as T;

    const active = this.pending.get(key);
    if (active) return active as Promise<T>;

    const request = loader()
      .then((value) => {
        this.values.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }

  clear(): void {
    this.values.clear();
    this.pending.clear();
  }
}
