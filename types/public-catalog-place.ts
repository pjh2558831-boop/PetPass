import { mapTourSummaryToPlaceCategory } from "@/lib/map-places/place-categories";
import type { PublicMapPlaceCategory, PublicMapPlaceDTO } from "@/types/public-map-place";
import type { TourPlaceSummary } from "@/types/place";

export type PublicCatalogLayer = "tourism" | "kakao" | "veterinary" | "pet_shop";

export interface PublicCatalogMarker {
  id: string;
  providerPlaceId: string;
  name: string;
  layer: PublicCatalogLayer;
  category: PublicMapPlaceCategory;
  districtCode: string | null;
  districtName: string | null;
  address: string;
  coordinates: { latitude: number; longitude: number } | null;
  categoryGroupCode?: string | null;
  lastSeenAt?: string | null;
  matchedQueryCount?: number;
  categoryQueryAgreementCount?: number;
  completeness?: number;
  publicLabel: string;
  sourceLabel: "한국관광공사" | "카카오 검색 후보" | "동물병원" | "펫샵·용품점";
}

export interface PublicCatalogPlace extends PublicCatalogMarker {
  phone: string | null;
  imageUrl: string | null;
  approvedImageUrl?: string | null;
  placeUrl: string | null;
  warning: string | null;
  tourPlace: TourPlaceSummary | null;
}

export interface PublicCatalogMarkerPage {
  items: PublicCatalogMarker[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNext: boolean;
  nextCursor?: number | null;
}

function completeness(values: readonly boolean[]): number {
  return values.filter(Boolean).length / values.length;
}

export function normalizeTourCatalogMarker(place: TourPlaceSummary): PublicCatalogMarker {
  const normalized = normalizeTourCatalogPlace(place);
  return {
    id: normalized.id,
    providerPlaceId: normalized.providerPlaceId,
    name: normalized.name,
    layer: normalized.layer,
    category: normalized.category,
    districtCode: normalized.districtCode,
    districtName: normalized.districtName,
    address: normalized.address,
    coordinates: normalized.coordinates,
    categoryGroupCode: normalized.categoryGroupCode,
    lastSeenAt: normalized.lastSeenAt,
    matchedQueryCount: normalized.matchedQueryCount,
    categoryQueryAgreementCount: normalized.categoryQueryAgreementCount,
    completeness: completeness([
      normalized.address !== "주소 확인 필요",
      Boolean(normalized.coordinates),
      Boolean(normalized.phone),
      Boolean(normalized.category),
      Boolean(normalized.imageUrl),
      Boolean(normalized.approvedImageUrl),
    ]),
    publicLabel: normalized.publicLabel,
    sourceLabel: normalized.sourceLabel,
  };
}

export function normalizeKakaoCatalogMarker(place: PublicMapPlaceDTO): PublicCatalogMarker {
  const normalized = normalizeKakaoCatalogPlace(place);
  return {
    id: normalized.id,
    providerPlaceId: normalized.providerPlaceId,
    name: normalized.name,
    layer: normalized.layer,
    category: normalized.category,
    districtCode: normalized.districtCode,
    districtName: normalized.districtName,
    address: normalized.address,
    coordinates: normalized.coordinates,
    categoryGroupCode: normalized.categoryGroupCode,
    lastSeenAt: normalized.lastSeenAt,
    matchedQueryCount: normalized.matchedQueryCount,
    categoryQueryAgreementCount: normalized.categoryQueryAgreementCount,
    completeness: completeness([
      normalized.address !== "주소 확인 필요",
      Boolean(normalized.coordinates),
      Boolean(normalized.phone),
      Boolean(normalized.category),
      false,
      false,
    ]),
    publicLabel: normalized.publicLabel,
    sourceLabel: normalized.sourceLabel,
  };
}

export function markerToCatalogCard(marker: PublicCatalogMarker): PublicCatalogPlace {
  const isTour = marker.layer === "tourism";
  return {
    ...marker,
    phone: null,
    imageUrl: null,
    approvedImageUrl: null,
    placeUrl: isTour
      ? `/places/${marker.providerPlaceId}`
      : `https://place.map.kakao.com/${marker.providerPlaceId}`,
    warning: marker.layer === "kakao"
      ? "카카오 검색 후보입니다. 방문 전 반려동물 동반 가능 여부를 확인해 주세요."
      : null,
    tourPlace: null,
  };
}

export function normalizeTourCatalogPlace(place: TourPlaceSummary): PublicCatalogPlace {
  const category = mapTourSummaryToPlaceCategory(place);
  return {
    id: `tour:${place.contentId}`,
    providerPlaceId: place.contentId,
    name: place.title?.trim() || "이름 확인 필요",
    layer: "tourism",
    category,
    districtCode: place.legalDistrictCode,
    districtName: null,
    address: [place.address, place.detailAddress].filter(Boolean).join(" ") || "주소 확인 필요",
    coordinates: place.latitude !== null && place.longitude !== null
      ? { latitude: place.latitude, longitude: place.longitude }
      : null,
    phone: place.phone?.trim() || null,
    imageUrl: place.thumbnailUrl ?? place.imageUrl,
    approvedImageUrl: null,
    placeUrl: `/places/${place.contentId}${place.contentTypeId ? `?contentTypeId=${place.contentTypeId}` : ""}`,
    categoryGroupCode: null,
    lastSeenAt: place.source.retrievedAt,
    matchedQueryCount: 0,
    categoryQueryAgreementCount: 0,
    completeness: completeness([
      Boolean(place.address || place.detailAddress),
      place.latitude !== null && place.longitude !== null,
      Boolean(place.phone?.trim()),
      true,
      Boolean(place.thumbnailUrl ?? place.imageUrl),
      false,
    ]),
    publicLabel: "동반 정보 확인 필요",
    sourceLabel: "한국관광공사",
    warning: null,
    tourPlace: place,
  };
}

export function normalizeKakaoCatalogPlace(place: PublicMapPlaceDTO): PublicCatalogPlace {
  return {
    id: `kakao:${place.providerPlaceId}`,
    providerPlaceId: place.providerPlaceId,
    name: place.name,
    layer: place.kind === "pet_travel_candidate" ? "kakao" : place.kind,
    category: place.category ?? "other",
    districtCode: place.district.code,
    districtName: place.district.name,
    address: place.address,
    coordinates: place.coordinates,
    phone: place.phone,
    imageUrl: null,
    approvedImageUrl: null,
    placeUrl: place.placeUrl,
    categoryGroupCode: place.categoryGroupCode ?? null,
    lastSeenAt: place.lastSeenAt ?? null,
    matchedQueryCount: place.matchedQueryCount ?? 0,
    categoryQueryAgreementCount: place.categoryQueryAgreementCount ?? 0,
    completeness: completeness([
      Boolean(place.address),
      Boolean(place.coordinates),
      Boolean(place.phone),
      Boolean(place.category),
      false,
      false,
    ]),
    publicLabel: place.kind === "pet_travel_candidate" ? "동반 여부 확인 필요" : "반려동물 편의시설",
    sourceLabel: place.kind === "pet_travel_candidate"
      ? "카카오 검색 후보"
      : place.kind === "veterinary"
        ? "동물병원"
        : "펫샵·용품점",
    warning: place.kind === "pet_travel_candidate"
      ? "카카오 검색 후보입니다. 방문 전 반려동물 동반 가능 여부를 확인해 주세요."
      : null,
    tourPlace: null,
  };
}
