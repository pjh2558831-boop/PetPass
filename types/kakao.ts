import type { Coordinates } from "@/types/place";

export const KAKAO_DISCOVERY_CATEGORIES = [
  "attraction",
  "culture",
  "leisure",
  "accommodation",
  "food",
] as const;

export type KakaoDiscoveryCategory =
  (typeof KAKAO_DISCOVERY_CATEGORIES)[number];

export interface KakaoDiscoveryRectangle {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface KakaoPlaceSearchResult {
  id: string;
  name: string;
  address: string;
  roadAddress?: string;
  categoryName?: string;
  categoryGroupCode?: string;
  phone?: string;
  placeUrl?: string;
  distanceMeters?: number;
  coordinates: Coordinates;
}

export interface KakaoDiscoveryExactExistingPlaceLink {
  classification: "exact";
  contentId: string;
  title: string;
}

export interface KakaoDiscoveryCandidate {
  id: string;
  name: string;
  category: KakaoDiscoveryCategory;
  kakaoCategoryText: string;
  address: string;
  coordinates: Coordinates;
  phone?: string;
  placeUrl?: string;
  source: "KAKAO";
  candidateStatus: "discovery_candidate";
  verificationStatus: "verification_required";
  petAccessVerdict: "unknown";
  recommendationEligible: false;
  exactExistingPlaceLink?: KakaoDiscoveryExactExistingPlaceLink;
}

export interface KakaoPlaceSearchPage {
  results: KakaoPlaceSearchResult[];
  totalCount: number;
  pageableCount: number;
  isEnd: boolean;
}

export type KakaoSearchAreaMode =
  | "district"
  | "region"
  | "trip-origin"
  | "current-map"
  | "fallback";

export interface KakaoSearchAreaSummary {
  mode: KakaoSearchAreaMode;
  label: string;
  radiusLabel: string;
  requestCount: number;
}

export interface KakaoCurrentMapSearch {
  center: Coordinates;
  radiusMeters: number;
  rectangle: KakaoDiscoveryRectangle;
}

export type KakaoDiscoveryStoppingReason =
  | "external_call_budget"
  | "maximum_depth"
  | "maximum_rectangles"
  | "minimum_rectangle_size"
  | "provider_partial_failure"
  | "catalog_linking_unavailable";

export interface KakaoDiscoveryResponse {
  candidates: KakaoDiscoveryCandidate[];
  searchArea: {
    mode: "district" | "viewport";
    rectangle: KakaoDiscoveryRectangle;
    center: Coordinates | null;
  };
  district: { code: string; name: string } | null;
  category: KakaoDiscoveryCategory;
  metadata: {
    externalCallCount: number;
    upstreamDocumentCount: number;
    duplicateCount: number;
    outOfRegionRemovalCount: number;
    excludedCategoryCount: number;
    exactExistingPlaceLinkCount: number;
    verificationRequiredCandidateCount: number;
    saturated: boolean;
    partial: boolean;
    stoppingReasons: KakaoDiscoveryStoppingReason[];
  };
}

export interface KakaoGeocodeResult {
  address: string;
  addressType: string;
  roadAddress?: string;
  coordinates: Coordinates;
}

export interface KakaoDirectionsPoint {
  name: string;
  x: number;
  y: number;
}

export interface KakaoDirectionsRequest {
  origin: KakaoDirectionsPoint;
  destination: KakaoDirectionsPoint;
  waypoints: KakaoDirectionsPoint[];
}

export interface KakaoDirectionsSection {
  distanceMeters: number;
  durationSeconds: number;
}

export interface KakaoDrivingRoute {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  taxiFareWon?: number;
  tollFareWon?: number;
  coordinates: Coordinates[];
  sections: KakaoDirectionsSection[];
}
