import "server-only";

export const POPULARITY_EVENT_TYPES = [
  "detail_view",
  "favorite",
  "itinerary_add",
  "route_start",
  "route_complete",
  "share",
  "itinerary_remove",
] as const;

export type PopularityEventType = (typeof POPULARITY_EVENT_TYPES)[number];

export const POPULARITY_V1_CONFIG = {
  version: "popularity-v1",
  eventWeights: {
    detail_view: 1,
    favorite: 4,
    itinerary_add: 5,
    route_start: 6,
    route_complete: 10,
    share: 3,
    itinerary_remove: -2,
  },
  qualityEvents: [
    "favorite",
    "itinerary_add",
    "route_complete",
    "share",
    "itinerary_remove",
  ],
  trendEvents: ["detail_view", "route_start"],
  qualityHalfLifeDays: 90,
  trendHalfLifeDays: 14,
  qualityScale: 20,
  trendScale: 10,
  qualityWeight: 0.7,
  trendWeight: 0.3,
  priorWeight: 20,
  defaultCategoryPrior: 0.5,
  minimumEffectiveSampleWeight: 20,
  precision: 1_000_000,
} as const satisfies {
  version: "popularity-v1";
  eventWeights: Record<PopularityEventType, number>;
  qualityEvents: readonly PopularityEventType[];
  trendEvents: readonly PopularityEventType[];
  qualityHalfLifeDays: number;
  trendHalfLifeDays: number;
  qualityScale: number;
  trendScale: number;
  qualityWeight: number;
  trendWeight: number;
  priorWeight: number;
  defaultCategoryPrior: number;
  minimumEffectiveSampleWeight: number;
  precision: number;
};
