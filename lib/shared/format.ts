import type { PlaceCategory } from "@/types/pet";
import type { TourPlaceCategory } from "@/types/place";
import type {
  LicenseMatchState,
  LicenseOperatingState,
  RefinedVenueKind,
} from "@/types/license";

export const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  ATTRACTION: "관광지",
  RESTAURANT: "식당",
  CAFE: "카페",
  ACCOMMODATION: "숙소",
  WALK: "산책",
};

export const TOUR_CATEGORY_LABELS: Record<TourPlaceCategory, string> = {
  leisure: "레저",
  attraction: "관광지",
  transportation: "교통",
  culture: "문화시설",
  shopping: "쇼핑",
  accommodation: "숙박",
  food: "음식점",
  festival: "축제·행사",
  unknown: "기타",
};

export const LICENSE_MATCH_LABELS: Record<LicenseMatchState, string> = {
  matched_high: "인허가 기록 일치",
  matched_possible: "유사한 인허가 기록 확인 필요",
  ambiguous: "일치 가능한 인허가 기록이 여러 개입니다",
  not_found: "공공데이터에서 일치 기록을 찾지 못했습니다",
  unavailable: "현재 인허가 정보를 확인할 수 없습니다",
  not_applicable: "인허가 확인 대상 아님",
};

export const ACCOMMODATION_LICENSE_MATCH_LABELS: Record<LicenseMatchState, string> = {
  matched_high: "숙박 인허가 기록 일치",
  matched_possible: "유사한 숙박 인허가 기록 확인 필요",
  ambiguous: "일치 가능한 숙박 인허가 기록이 여러 개입니다",
  not_found: "공공데이터에서 일치 기록을 찾지 못했습니다",
  unavailable: "현재 숙박 인허가 정보를 확인할 수 없습니다",
  not_applicable: "숙박 인허가 확인 대상 아님",
};

export const LICENSE_OPERATING_LABELS: Record<LicenseOperatingState, string> = {
  active: "영업·정상 기록",
  closed: "폐업 기록",
  suspended: "휴업·영업정지 기록",
  unknown: "영업 상태 확인 필요",
};

export const REFINED_VENUE_LABELS: Record<Exclude<RefinedVenueKind, null>, string> = {
  restaurant: "일반음식점",
  cafe: "휴게음식점",
  pension: "관광펜션",
  hotel: "호텔",
  resort: "리조트·콘도미니엄",
  accommodation: "숙박시설",
};

export function formatDistance(distanceKm: number): string {
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)}m`
    : `${distanceKm.toFixed(1)}km`;
}

export function joinNatural(values: string[]): string {
  return values.length > 0 ? values.join(" · ") : "없음";
}
