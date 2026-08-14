import type { PublicMapPlaceCategory, PublicMapPlaceDTO } from "@/types/public-map-place";
import type { TourPlaceSummary } from "@/types/place";

export type PublicCatalogLayer = "tourism" | "kakao" | "veterinary" | "pet_shop";

export interface PublicCatalogPlace {
  id: string;
  providerPlaceId: string;
  name: string;
  layer: PublicCatalogLayer;
  category: PublicMapPlaceCategory;
  districtCode: string | null;
  districtName: string | null;
  address: string;
  coordinates: { latitude: number; longitude: number } | null;
  phone: string | null;
  placeUrl: string | null;
  publicLabel: string;
  sourceLabel: "한국관광공사" | "카카오 검색 후보";
  warning: string | null;
  tourPlace: TourPlaceSummary | null;
}

export function normalizeTourCatalogPlace(place: TourPlaceSummary): PublicCatalogPlace {
  const category: PublicMapPlaceCategory =
    place.category === "food" ? "food" :
    place.category === "accommodation" ? "accommodation" :
    place.category === "leisure" ? "leisure" :
    ["attraction", "culture", "festival"].includes(place.category) ? "attraction" : "other";
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
    placeUrl: `/places/${place.contentId}${place.contentTypeId ? `?contentTypeId=${place.contentTypeId}` : ""}`,
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
    placeUrl: place.placeUrl,
    publicLabel: place.publicLabel,
    sourceLabel: "카카오 검색 후보",
    warning: "카카오 검색 후보입니다. 방문 전 반려동물 동반 가능 여부를 확인해 주세요.",
    tourPlace: null,
  };
}
