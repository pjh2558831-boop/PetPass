import type { Coordinates } from "@/types/place";
import type { PlaceSourceRecord, PlaceTrustResult } from "@/types/place-source";

export interface KakaoPlaceSearchResult {
  id: string;
  name: string;
  address: string;
  roadAddress?: string;
  categoryName?: string;
  phone?: string;
  placeUrl?: string;
  distanceMeters?: number;
  coordinates: Coordinates;
}

export interface KakaoDiscoveryCandidate extends KakaoPlaceSearchResult {
  candidateStatus: "discovery_candidate";
  verificationStatus: "verification_required";
  sourceRecord: PlaceSourceRecord;
  trust: PlaceTrustResult;
  petAccessAssessment?: never;
  petAccessVerdict?: never;
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

export interface KakaoLocalSearchResponse {
  results: KakaoDiscoveryCandidate[];
  area: KakaoSearchAreaSummary;
  truncated: boolean;
}

export interface KakaoCurrentMapSearch {
  center: Coordinates;
  radiusMeters: number;
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
