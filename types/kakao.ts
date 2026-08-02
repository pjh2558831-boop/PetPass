import type { Coordinates } from "@/types/place";

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
