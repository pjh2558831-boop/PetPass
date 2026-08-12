import "server-only";

import type { PopularityResult } from "@/lib/recommendation/popularity/popularity-calculator";
import type { TourPlaceCategory } from "@/types/place";

export interface PopularitySnapshotQuery {
  contentIds: readonly string[];
  categoriesByContentId: Readonly<Record<string, TourPlaceCategory>>;
  asOf: string;
}

/** Batch snapshot boundary so the candidate pipeline does not perform N+1 reads. */
export interface PopularityRepository {
  getPopularitySnapshot(
    query: PopularitySnapshotQuery,
  ): Promise<ReadonlyMap<string, PopularityResult>>;
}

export class NoDataPopularityRepository implements PopularityRepository {
  async getPopularitySnapshot(
    query: PopularitySnapshotQuery,
  ): Promise<ReadonlyMap<string, PopularityResult>> {
    const uniqueIds = [...new Set(query.contentIds)].sort((left, right) =>
      left.localeCompare(right),
    );
    return new Map(
      uniqueIds.map((contentId) => [
        contentId,
        {
          score: 0.5,
          status: "insufficient_data" as const,
          qualityComponent: 0,
          trendComponent: 0,
          sampleWeight: 0,
          version: "popularity-v1" as const,
        },
      ]),
    );
  }
}
