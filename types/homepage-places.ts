import type { HomepageFeaturedState } from "@/types/homepage";

export const HOMEPAGE_PLACE_LAYERS = [
  "official",
  "kakao_candidate",
  "veterinary",
  "pet_shop",
] as const;

export type HomepagePlaceLayer = (typeof HOMEPAGE_PLACE_LAYERS)[number];
export type HomepageLayerState = "ready" | "empty" | "unavailable";

export interface HomepageLayerSnapshot {
  state: HomepageLayerState;
  count: number | null;
  markerCount: number | null;
  enabledByDefault: boolean;
}

export interface HomepageMapMarker {
  id: string;
  layer: HomepagePlaceLayer;
  name: string;
  categoryLabel: string;
  district: string | null;
  address: string;
  coordinates: { latitude: number; longitude: number };
  sourceLabel: string;
  statusLabel: string;
  warning: string | null;
  isAllowed: boolean;
  href: string | null;
  external: boolean;
  imageUrl: string | null;
  phone: string | null;
}

export interface HomepagePlaceCard {
  id: string;
  layer: HomepagePlaceLayer;
  name: string;
  categoryLabel: string;
  district: string | null;
  address: string;
  phone: string | null;
  sourceLabel: string;
  statusLabel: string;
  warning: string | null;
  isAllowed: boolean;
  href: string | null;
  external: boolean;
  imageUrl: string | null;
}

export interface HomepagePlacesSnapshot {
  official: {
    totalCount: number;
    markerCount: number;
    omittedCoordinateCount: number;
    categoryCounts: Array<{ label: string; count: number }>;
    featuredState: HomepageFeaturedState;
    retrievedAt: string;
  };
  layers: Record<HomepagePlaceLayer, HomepageLayerSnapshot>;
  markers: HomepageMapMarker[];
  cards: HomepagePlaceCard[];
}
