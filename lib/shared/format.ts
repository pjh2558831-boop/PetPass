import type { PlaceCategory } from "@/types/pet";
import type { TourPlaceCategory } from "@/types/place";

export const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  ATTRACTION: "관광지",
  RESTAURANT: "식당",
  CAFE: "카페",
  ACCOMMODATION: "숙소",
  WALK: "산책",
};

export const TOUR_CATEGORY_LABELS: Record<TourPlaceCategory, string> = {
  leisure: "레저·스포츠",
  attraction: "관광지",
  transportation: "교통",
  culture: "문화시설",
  shopping: "쇼핑",
  accommodation: "숙박",
  food: "음식점·카페 미분류",
  festival: "축제·행사",
  unknown: "기타",
};

export function formatDistance(distanceKm: number): string {
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)}m`
    : `${distanceKm.toFixed(1)}km`;
}

export function joinNatural(values: string[]): string {
  return values.length > 0 ? values.join(" · ") : "없음";
}
