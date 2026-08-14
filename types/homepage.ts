import type {
  TourPlaceList,
  TourPlaceSummary,
  TourSourceReference,
} from "@/types/place";
import type { TourPetAccessAssessment } from "@/types/tour-pet-access";

export const HOMEPAGE_FEATURED_STATES = [
  "ready",
  "partial",
  "empty",
  "unavailable",
] as const;

export type HomepageFeaturedState =
  (typeof HOMEPAGE_FEATURED_STATES)[number];

export interface HomepageFeaturedPlace {
  summary: TourPlaceSummary;
  assessment: TourPetAccessAssessment;
  source: TourSourceReference;
}

export interface TourHomepageSnapshot {
  catalog: TourPlaceList;
  featured: {
    state: HomepageFeaturedState;
    places: HomepageFeaturedPlace[];
    assessedCount: number;
    failedCount: number;
  };
}
