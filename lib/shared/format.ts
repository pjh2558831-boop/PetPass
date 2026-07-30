import type { PlaceCategory } from "@/types/pet";

export const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  ATTRACTION: "관광지",
  RESTAURANT: "식당",
  CAFE: "카페",
  ACCOMMODATION: "숙소",
  WALK: "산책",
};

export function formatDistance(distanceKm: number): string {
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)}m`
    : `${distanceKm.toFixed(1)}km`;
}

export function joinNatural(values: string[]): string {
  return values.length > 0 ? values.join(" · ") : "없음";
}
