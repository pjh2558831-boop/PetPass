import type { MapPlacesSnapshotDataset } from "@/types/map-places-snapshot";
import type { RegionId } from "@/types/region";

export const MAP_PLACE_CARD_DETAILS_VERSION = 1 as const;
export const MAP_PLACE_CARD_PAGE_SIZE = 12;

export interface MapPlaceCardDetail {
  id: string;
  address: string;
  phone: string | null;
  imageUrl: string | null;
  placeUrl: string | null;
  contentTypeId: string | null;
}

export interface MapPlaceCardDetailsRequest {
  region: RegionId;
  dataset: MapPlacesSnapshotDataset;
  ids: string[];
}

export interface MapPlaceCardDetailsAssemblyRequest extends MapPlaceCardDetailsRequest {
  publicationVersion: `p1-${string}`;
}

export interface MapPlaceCardDetailsPage {
  contractVersion: typeof MAP_PLACE_CARD_DETAILS_VERSION;
  region: RegionId;
  dataset: MapPlacesSnapshotDataset;
  publicationVersion: `p1-${string}`;
  items: MapPlaceCardDetail[];
  page: 1;
  pageSize: typeof MAP_PLACE_CARD_PAGE_SIZE;
  totalCount: number;
}
