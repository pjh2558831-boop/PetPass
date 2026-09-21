import type { ApiResult } from "@/types/api";
import type { RegionId } from "@/types/region";

export function createHomepageBrowserRequestCache<T>(
  request: (region: RegionId) => Promise<ApiResult<T>>,
) {
  const entries = new Map<RegionId, Promise<ApiResult<T>>>();

  return {
    load(region: RegionId) {
      const cached = entries.get(region);
      if (cached) return cached;

      const pending = request(region).then(
        (result) => {
          if (!result.ok && entries.get(region) === pending) entries.delete(region);
          return result;
        },
        (error: unknown) => {
          if (entries.get(region) === pending) entries.delete(region);
          throw error;
        },
      );
      entries.set(region, pending);
      return pending;
    },
    invalidate(region: RegionId) {
      entries.delete(region);
    },
  };
}
