import "server-only";

import type { NormalizedItineraryRequest, ExplainablePlaceScore, TravelRole } from "@/types/route-generation";

const TRAVEL_ATTRACTIVENESS: Record<TravelRole, number> = {
  beach: 20,
  park: 19,
  walking_trail: 20,
  viewpoint: 19,
  cultural_venue: 19,
  experience: 20,
  photo_spot: 17,
  cafe: 16,
  meal: 17,
  rest_stop: 13,
  indoor_activity: 17,
  outdoor_activity: 17,
  accommodation: 16,
  tourism_market: 19,
  general_attraction: 15,
};

export interface PlaceScoreInput {
  petVerdict: "allowed" | "conditional" | "unknown";
  petConditionsConfirmed: boolean;
  category: Exclude<
    NormalizedItineraryRequest["selectedCategories"][number],
    "transportation" | "unknown"
  >;
  role: TravelRole;
  request: NormalizedItineraryRequest;
  hasOperatingInformation: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasVerifiedTourImage: boolean;
  hasDetailedInformation: boolean;
  kakaoRelevance: "none" | "exact_link" | "exploratory";
  evidenceCodes: string[];
}

export function scorePlace(input: PlaceScoreInput): ExplainablePlaceScore {
  const petCompatibility =
    input.petVerdict === "allowed"
      ? 30
      : input.petVerdict === "conditional"
        ? input.petConditionsConfirmed
          ? 30
          : 24
        : 8;
  const preferenceMatch = input.request.selectedCategories.includes(input.category)
    ? 25
    : 0;
  const travelAttractiveness = TRAVEL_ATTRACTIVENESS[input.role];
  const scheduleFit = input.hasOperatingInformation ? 10 : 6;
  const informationCompleteness = Math.min(
    10,
    (input.hasVerifiedTourImage ? 5 : 0) +
      (input.hasAddress ? 2 : 0) +
      (input.hasPhone ? 1 : 0) +
      (input.hasDetailedInformation ? 2 : 0),
  );
  const kakaoRelevance =
    input.kakaoRelevance === "exact_link"
      ? 5
      : input.kakaoRelevance === "exploratory"
        ? 3
        : 0;
  const components = {
    petCompatibility,
    preferenceMatch,
    travelAttractiveness,
    scheduleFit,
    informationCompleteness,
    kakaoRelevance,
  };
  const reasons = [
    input.petVerdict === "allowed"
      ? "관광공사 반려동물 동반 근거가 확인됐습니다."
      : input.petVerdict === "conditional"
        ? "관광공사 원문의 동반 조건을 지켜야 합니다."
        : "반려동물 동반 여부를 방문 전에 확인해야 합니다.",
    `${input.role} 여행 역할로 분류됐습니다.`,
    input.hasVerifiedTourImage
      ? "관광공사 대표 이미지가 제공됩니다."
      : "확인된 관광공사 대표 이미지가 없습니다.",
  ];

  return {
    total: Object.values(components).reduce((total, value) => total + value, 0),
    components,
    reasons,
    evidenceCodes: [...new Set(input.evidenceCodes)].sort(),
  };
}

export function scorePreliminaryCompleteness(input: {
  hasImage: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
}): number {
  return (
    (input.hasImage ? 5 : 0) +
    (input.hasAddress ? 3 : 0) +
    (input.hasPhone ? 2 : 0)
  );
}
