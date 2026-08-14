import type { KakaoBusanCollectionQuery } from "@/lib/kakao/collection/query-registry-v1";
import type { KakaoPlaceSearchResult } from "@/types/kakao";
import type {
  PetTravelCandidateCategory,
  PlaceCandidateKind,
} from "@/types/place-candidate";

export interface KakaoCandidateClassification {
  candidateKind: PlaceCandidateKind;
  normalizedCategory: PetTravelCandidateCategory | null;
}

const VETERINARY_EVIDENCE =
  /(?:동물|반려동물|애완동물)\s*(?:병원|의료\s*센터|메디컬\s*센터|클리닉|진료소)/u;
const PET_SHOP_EVIDENCE =
  /(?:펫\s*샵|애견\s*용품|반려동물\s*용품|애완동물\s*용품|펫\s*용품|애완\s*용품)/u;
const FACILITY_EXCLUSIONS =
  /(?:장례|장묘|화장|추모|보호소|유기동물|분양|브리더|번식|(?:동물|강아지|고양이|애견|애묘|반려(?:동물)?|애완(?:동물)?|펫)\s*(?:전문\s*)?판매|(?:동물|강아지|고양이|애견|애묘|반려(?:동물)?|애완(?:동물)?|펫)(?:\s*용품)?\s*(?:전문\s*)?(?:유통|도매))/u;

const TRAVEL_CATEGORY_BY_GROUP = {
  CE7: "cafe",
  FD6: "food",
  AD5: "accommodation",
  AT4: "attraction",
} as const satisfies Record<string, PetTravelCandidateCategory>;

function normalizedText(...values: Array<string | undefined>): string {
  return values
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
}

function inferTravelCategoryFromText(
  result: KakaoPlaceSearchResult,
): PetTravelCandidateCategory | null {
  const categoryText = normalizedText(result.categoryName);
  if (/(?:캠핑|야영|글램핑|카라반)/u.test(categoryText)) return "camping";
  if (/(?:공원|산책|둘레길|등산로|해수욕장|반려동물놀이터)/u.test(categoryText)) {
    return "park_walk";
  }
  if (/(?:레저|액티비티|스포츠|체험)/u.test(categoryText)) return "leisure";
  if (/(?:카페|커피)/u.test(categoryText)) return "cafe";
  if (/(?:음식점|식당|요리|한식|양식|일식|중식)/u.test(categoryText)) {
    return "food";
  }
  if (/(?:숙박|호텔|펜션|리조트|모텔)/u.test(categoryText)) {
    return "accommodation";
  }
  if (/(?:관광|명소|박물관|전시|문화)/u.test(categoryText)) {
    return "attraction";
  }
  return null;
}

function classifyTravelCategory(
  result: KakaoPlaceSearchResult,
  query: KakaoBusanCollectionQuery,
): PetTravelCandidateCategory {
  const groupCategory = result.categoryGroupCode
    ? TRAVEL_CATEGORY_BY_GROUP[
        result.categoryGroupCode as keyof typeof TRAVEL_CATEGORY_BY_GROUP
      ]
    : undefined;
  return (
    groupCategory ??
    inferTravelCategoryFromText(result) ??
    query.normalizedCategoryHint ??
    "other"
  );
}

export function classifyKakaoCollectionCandidate(
  result: KakaoPlaceSearchResult,
  query: KakaoBusanCollectionQuery,
): KakaoCandidateClassification | null {
  const evidenceText = normalizedText(result.name, result.categoryName);
  const isExcludedFacility = FACILITY_EXCLUSIONS.test(evidenceText);
  const hasVeterinaryEvidence = VETERINARY_EVIDENCE.test(evidenceText);
  const hasPetShopEvidence = PET_SHOP_EVIDENCE.test(evidenceText);

  if (query.candidateKind === "veterinary") {
    return hasVeterinaryEvidence && !isExcludedFacility
      ? { candidateKind: "veterinary", normalizedCategory: null }
      : null;
  }

  if (query.candidateKind === "pet_shop") {
    return !hasVeterinaryEvidence && hasPetShopEvidence && !isExcludedFacility
      ? { candidateKind: "pet_shop", normalizedCategory: null }
      : null;
  }

  if (
    hasVeterinaryEvidence ||
    hasPetShopEvidence ||
    isExcludedFacility
  ) {
    return null;
  }

  return {
    candidateKind: "pet_travel_candidate",
    normalizedCategory: classifyTravelCategory(result, query),
  };
}
