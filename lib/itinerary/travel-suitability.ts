import "server-only";

import {
  BUSAN_REGION_CONFIG,
  coordinatesInRegion,
} from "@/lib/regions/config";
import type { KakaoDiscoveryCandidate } from "@/types/kakao";
import type { TourPlaceSummary } from "@/types/place";
import type {
  NormalizedItineraryRequest,
  TravelRole,
  TravelSuitabilityAssessment,
  TravelSuitabilityEvidence,
  TravelSuitabilityExclusionReason,
} from "@/types/route-generation";

const ROLE_RULES: ReadonlyArray<{
  role: TravelRole;
  pattern: RegExp;
  evidenceCode: string;
}> = [
  { role: "beach", pattern: /해수욕장|해변|비치/u, evidenceCode: "role_beach" },
  { role: "walking_trail", pattern: /산책로|둘레길|등산로|트레일|갈맷길/u, evidenceCode: "role_trail" },
  { role: "park", pattern: /(?:공원|수목원|정원|생태공원)/u, evidenceCode: "role_park" },
  { role: "viewpoint", pattern: /전망대|스카이워크|전망\s*공간/u, evidenceCode: "role_viewpoint" },
  { role: "cultural_venue", pattern: /박물관|미술관|기념관|전시관|문화관|공연장|영화의전당|문화재|유적|사찰/u, evidenceCode: "role_culture" },
  { role: "experience", pattern: /체험|공방|목장|농장|도예|공예/u, evidenceCode: "role_experience" },
  { role: "photo_spot", pattern: /포토존|사진\s*명소|벽화마을/u, evidenceCode: "role_photo_spot" },
  { role: "cafe", pattern: /카페|커피|찻집/u, evidenceCode: "role_cafe" },
  { role: "rest_stop", pattern: /휴게소|쉼터/u, evidenceCode: "role_rest_stop" },
];

const SHOPPING_TRAVEL_ROLE_PATTERN =
  /전통시장|관광시장|문화시장|지역\s*특산|특산물.{0,8}체험|공예.{0,8}체험|문화\s*복합공간|관광.{0,8}복합|체험형.{0,8}(?:공예|상점)/u;

const EXCLUSION_RULES: ReadonlyArray<{
  reason: TravelSuitabilityExclusionReason;
  pattern: RegExp;
  evidenceCode: string;
}> = [
  {
    reason: "medical_business",
    pattern: /약국|병원|의원|클리닉|치과|한의원|의료|건강검진/u,
    evidenceCode: "non_travel_medical",
  },
  {
    reason: "household_or_wedding_retail",
    pattern: /침구|가구|가전|생활용품|주방용품|인테리어|혼수|웨딩|예물|예복|신혼/u,
    evidenceCode: "non_travel_household_wedding",
  },
  {
    reason: "optical_or_beauty_service",
    pattern: /안경(?:원|점)?|콘택트렌즈|미용실|헤어샵|네일|피부관리|에스테틱|마사지|왁싱|애견미용/u,
    evidenceCode: "non_travel_optical_beauty",
  },
  {
    reason: "finance_or_daily_service",
    pattern: /은행|보험|증권|대출|금융|세무|법무|공인중개|부동산|수리|정비|세차|물류|택배|배송|세탁|열쇠|인쇄/u,
    evidenceCode: "non_travel_daily_service",
  },
  {
    reason: "generic_retail",
    pattern: /백화점|쇼핑몰|쇼핑센터|아울렛|종합\s*소매|소매점|잡화점|편의점|슈퍼마켓|대형마트|판매점/u,
    evidenceCode: "non_travel_generic_retail",
  },
  {
    reason: "pet_supply_only",
    pattern: /반려동물\s*용품|애견용품|펫용품|펫샵|사료\s*전문|동물약국/u,
    evidenceCode: "non_travel_pet_supply",
  },
  {
    reason: "non_visitor_facility",
    pattern: /사무실|본사|지사|오피스|학원|교습소|연구소|공장|산업단지|제조|물류센터|창고/u,
    evidenceCode: "non_travel_facility",
  },
];

function combinedTourClassification(place: TourPlaceSummary): string {
  return [
    place.title,
    place.classificationCodes.primary,
    place.classificationCodes.secondary,
    place.classificationCodes.tertiary,
    place.classificationCodes.largeCategory,
    place.classificationCodes.middleCategory,
    place.classificationCodes.smallCategory,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .normalize("NFKC");
}

function roleFromText(
  text: string,
  category: NonNullable<TravelSuitabilityAssessment["normalizedCategory"]>,
): { role: TravelRole; evidenceCode: string; explicit: boolean } {
  const rule = ROLE_RULES.find(({ pattern }) => pattern.test(text));
  if (rule) return { role: rule.role, evidenceCode: rule.evidenceCode, explicit: true };
  const defaults: Record<
    NonNullable<TravelSuitabilityAssessment["normalizedCategory"]>,
    TravelRole
  > = {
    attraction: "general_attraction",
    culture: "cultural_venue",
    festival: "experience",
    leisure: "outdoor_activity",
    accommodation: "accommodation",
    food: "meal",
    shopping: "tourism_market",
  };
  return {
    role: defaults[category],
    evidenceCode: `content_type_${category}`,
    explicit: false,
  };
}

function coordinatesInBusan(latitude: number, longitude: number): boolean {
  return coordinatesInRegion(BUSAN_REGION_CONFIG, { latitude, longitude });
}

function excludedAssessment(
  source: TravelSuitabilityAssessment["source"],
  category: TravelSuitabilityAssessment["normalizedCategory"],
  reason: TravelSuitabilityExclusionReason,
  evidence: TravelSuitabilityEvidence[],
): TravelSuitabilityAssessment {
  return {
    travelSuitable: false,
    travelRole: null,
    normalizedCategory: category,
    recommendationTier: "excluded",
    exclusionReason: reason,
    eligibilityReason: null,
    evidence,
    source,
    petVerificationState: "unknown",
    scoringEligible: false,
  };
}

export function classifyTourTravelSuitability(
  place: TourPlaceSummary,
  request: NormalizedItineraryRequest,
): TravelSuitabilityAssessment {
  const source = {
    provider: "Korea Tourism Organization" as const,
    identity: `tour:${place.contentId}`,
  };
  const category =
    place.category === "transportation" || place.category === "unknown"
      ? null
      : place.category;
  const evidence: TravelSuitabilityEvidence[] = [];

  if (
    place.latitude === null ||
    place.longitude === null ||
    !Number.isFinite(place.latitude) ||
    !Number.isFinite(place.longitude)
  ) {
    return excludedAssessment(source, category, "invalid_coordinates", [
      { source: "region", code: "invalid_coordinates", value: "invalid" },
    ]);
  }
  if (
    !coordinatesInBusan(place.latitude, place.longitude) ||
    (place.legalRegionCode !== null &&
      place.legalRegionCode !== request.scope.regionCode) ||
    (request.scope.type === "district" &&
      place.legalDistrictCode !== null &&
      place.legalDistrictCode !== request.scope.districtCode)
  ) {
    return excludedAssessment(source, category, "outside_selected_region", [
      { source: "region", code: "outside_selected_region", value: request.scope.type },
    ]);
  }
  evidence.push({
    source: "region",
    code: "selected_region_match",
    value: request.scope.type === "district" ? request.scope.districtCode : request.scope.regionCode,
  });

  if (!category || !place.contentTypeId || !place.title?.trim()) {
    return excludedAssessment(source, category, "unsupported_record", evidence);
  }
  evidence.push({
    source: "tour_content_type",
    code: `content_type_${place.contentTypeId}`,
    value: place.contentTypeId,
  });
  const text = combinedTourClassification(place);
  const role = roleFromText(text, category);
  const explicitTravelShopping =
    category === "shopping" && SHOPPING_TRAVEL_ROLE_PATTERN.test(text);
  const exclusion = EXCLUSION_RULES.find(({ pattern }) => pattern.test(text));

  if (category === "shopping" && !request.includeShopping) {
    return excludedAssessment(source, category, "shopping_disabled", evidence);
  }
  if (exclusion && (category === "shopping" || !role.explicit)) {
    return excludedAssessment(source, category, exclusion.reason, [
      ...evidence,
      { source: "tour_name", code: exclusion.evidenceCode, value: exclusion.reason },
    ]);
  }
  if (category === "shopping" && !explicitTravelShopping) {
    return excludedAssessment(
      source,
      category,
      "shopping_missing_travel_role",
      evidence,
    );
  }

  evidence.push({
    source: role.explicit ? "tour_name" : "tour_content_type",
    code: explicitTravelShopping ? "shopping_positive_travel_role" : role.evidenceCode,
    value: role.role,
  });
  for (const value of Object.values(place.classificationCodes)) {
    if (!value) continue;
    evidence.push({
      source: "tour_classification",
      code: "provider_classification",
      value,
    });
  }
  return {
    travelSuitable: true,
    travelRole: explicitTravelShopping ? "tourism_market" : role.role,
    normalizedCategory: category,
    recommendationTier: "conditional",
    exclusionReason: null,
    eligibilityReason: explicitTravelShopping
      ? "positive_travel_shopping_role"
      : "supported_tourism_role",
    evidence,
    source,
    petVerificationState: "unknown",
    scoringEligible: true,
  };
}

export function classifyKakaoTravelSuitability(
  candidate: KakaoDiscoveryCandidate,
  request: NormalizedItineraryRequest,
): TravelSuitabilityAssessment {
  const source = {
    provider: "Kakao Local" as const,
    identity: `kakao:${candidate.id}`,
  };
  const evidence: TravelSuitabilityEvidence[] = [];
  if (
    !coordinatesInBusan(
      candidate.coordinates.latitude,
      candidate.coordinates.longitude,
    )
  ) {
    return excludedAssessment(
      source,
      candidate.category,
      "outside_selected_region",
      [{ source: "region", code: "outside_selected_region", value: request.scope.type }],
    );
  }
  if (candidate.category === "accommodation") {
    return excludedAssessment(source, candidate.category, "unsupported_record", [
      { source: "kakao_category", code: "exploratory_accommodation_blocked", value: candidate.category },
    ]);
  }
  const text = `${candidate.name} ${candidate.kakaoCategoryText}`.normalize("NFKC");
  const exclusion = EXCLUSION_RULES.find(({ pattern }) => pattern.test(text));
  if (exclusion) {
    return excludedAssessment(source, candidate.category, exclusion.reason, [
      { source: "kakao_category", code: exclusion.evidenceCode, value: exclusion.reason },
    ]);
  }
  const role = roleFromText(text, candidate.category);
  evidence.push(
    { source: "region", code: "selected_region_match", value: request.scope.type },
    { source: "kakao_category", code: role.evidenceCode, value: role.role },
  );
  return {
    travelSuitable: true,
    travelRole: role.role,
    normalizedCategory: candidate.category,
    recommendationTier: "exploratory",
    exclusionReason: null,
    eligibilityReason: "bounded_kakao_exploratory_role",
    evidence,
    source,
    petVerificationState: "verification_required",
    scoringEligible: true,
  };
}

export function withTourPetVerification(
  assessment: TravelSuitabilityAssessment,
  verdict: "allowed" | "conditional" | "not_allowed" | "unknown",
): TravelSuitabilityAssessment {
  return {
    ...assessment,
    recommendationTier:
      verdict === "allowed"
        ? "verified"
        : verdict === "conditional"
          ? "conditional"
          : "excluded",
    petVerificationState:
      verdict === "allowed"
        ? "verified"
        : verdict === "conditional"
          ? "conditional"
          : verdict,
    scoringEligible:
      assessment.travelSuitable &&
      (verdict === "allowed" || verdict === "conditional"),
    evidence: [
      ...assessment.evidence,
      {
        source: "pet_evidence",
        code: `pet_${verdict}`,
        value: verdict,
      },
    ],
  };
}
