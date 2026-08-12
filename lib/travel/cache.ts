import "server-only";

import type {
  CachedTravelEdge,
  TravelEdgeCacheKey,
  TravelTimeCache,
} from "@/lib/travel/types";

export function serializeTravelEdgeCacheKey(key: TravelEdgeCacheKey): string {
  return JSON.stringify({
    ...key,
    avoid: [...new Set(key.avoid)].sort(),
  });
}

export class MemoryTravelTimeCache implements TravelTimeCache {
  private readonly values = new Map<string, CachedTravelEdge>();

  async getEdge(key: TravelEdgeCacheKey): Promise<CachedTravelEdge | null> {
    return this.values.get(serializeTravelEdgeCacheKey(key)) ?? null;
  }

  async setEdge(
    key: TravelEdgeCacheKey,
    value: CachedTravelEdge,
  ): Promise<void> {
    this.values.set(serializeTravelEdgeCacheKey(key), structuredClone(value));
  }
}

export class NoDataTravelTimeCache implements TravelTimeCache {
  async getEdge(): Promise<null> {
    return null;
  }

  async setEdge(): Promise<void> {}
}

let defaultTravelTimeCache: MemoryTravelTimeCache | undefined;

export function getDefaultTravelTimeCache(): MemoryTravelTimeCache {
  defaultTravelTimeCache ??= new MemoryTravelTimeCache();
  return defaultTravelTimeCache;
}
