import "server-only";

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export type TourCacheOutcome = "hit" | "miss" | "coalesced";

export type TourCacheObserver = (outcome: TourCacheOutcome) => void;

export class TourRequestCache {
  private readonly values = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<unknown>>();

  async getOrLoad<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
    now = Date.now(),
    observe?: TourCacheObserver,
  ): Promise<T> {
    const cached = this.values.get(key);
    if (cached && cached.expiresAt > now) {
      observe?.("hit");
      return cached.value as T;
    }

    const active = this.pending.get(key);
    if (active) {
      observe?.("coalesced");
      return active as Promise<T>;
    }

    observe?.("miss");

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
