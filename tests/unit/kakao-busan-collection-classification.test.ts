import { describe, expect, it } from "vitest";
import { classifyKakaoCollectionCandidate } from "@/lib/kakao/collection/classification";
import {
  KAKAO_BUSAN_COLLECTION_QUERIES,
  type KakaoBusanQueryFamily,
} from "@/lib/kakao/collection/query-registry-v1";
import type { KakaoPlaceSearchResult } from "@/types/kakao";

function query(family: KakaoBusanQueryFamily, templateIndex = 0) {
  const value = KAKAO_BUSAN_COLLECTION_QUERIES.find(
    (candidate) =>
      candidate.districtCode === "500" &&
      candidate.family === family &&
      candidate.templateIndex === templateIndex,
  );
  if (!value) throw new Error("test query missing");
  return value;
}

function place(
  overrides: Partial<KakaoPlaceSearchResult> = {},
): KakaoPlaceSearchResult {
  return {
    id: "kakao-1",
    name: "광안 반려 장소",
    address: "부산광역시 수영구 광안동 1",
    roadAddress: "부산광역시 수영구 광안해변로 1",
    categoryName: "여행 > 관광,명소",
    categoryGroupCode: "AT4",
    coordinates: { latitude: 35.1456, longitude: 129.1131 },
    ...overrides,
  };
}

describe("Kakao Busan deterministic candidate classification", () => {
  it.each([
    ["CE7", "음식점 > 카페", "cafe"],
    ["FD6", "음식점 > 한식", "food"],
    ["AD5", "여행 > 숙박 > 호텔", "accommodation"],
    ["AT4", "여행 > 관광,명소", "attraction"],
    [undefined, "여행 > 캠핑장", "camping"],
    [undefined, "여행 > 공원 > 산책로", "park_walk"],
    [undefined, "스포츠 > 수상레저", "leisure"],
    [undefined, "서비스 > 기타", "other"],
  ])("normalizes a general result %s to %s", (categoryGroupCode, categoryName, expected) => {
    expect(
      classifyKakaoCollectionCandidate(
        place({ categoryGroupCode, categoryName }),
        query("general"),
      ),
    ).toEqual({
      candidateKind: "pet_travel_candidate",
      normalizedCategory: expected,
    });
  });

  it("uses registry provenance for camping and outdoor subcategories", () => {
    expect(
      classifyKakaoCollectionCandidate(
        place({ categoryGroupCode: undefined, categoryName: "여행 > 야영장" }),
        query("accommodation", 4),
      ),
    ).toMatchObject({ normalizedCategory: "camping" });
    expect(
      classifyKakaoCollectionCandidate(
        place({ categoryGroupCode: undefined, categoryName: "여행 > 공원" }),
        query("outdoor_leisure", 1),
      ),
    ).toMatchObject({ normalizedCategory: "park_walk" });
  });

  it("requires animal-medical evidence and never treats HP8 alone as proof", () => {
    expect(
      classifyKakaoCollectionCandidate(
        place({
          name: "광안 24시 동물병원",
          categoryName: "의료,건강 > 동물병원",
          categoryGroupCode: "HP8",
        }),
        query("veterinary"),
      ),
    ).toEqual({ candidateKind: "veterinary", normalizedCategory: null });
    expect(
      classifyKakaoCollectionCandidate(
        place({
          name: "광안 정형외과",
          categoryName: "의료,건강 > 병원 > 정형외과",
          categoryGroupCode: "HP8",
        }),
        query("veterinary"),
      ),
    ).toBeNull();
  });

  it("requires retail evidence and excludes grooming-only and prohibited facility records", () => {
    expect(
      classifyKakaoCollectionCandidate(
        place({ name: "광안 펫샵", categoryName: "가정,생활 > 반려동물용품" }),
        query("pet_shop"),
      ),
    ).toEqual({ candidateKind: "pet_shop", normalizedCategory: null });
    for (const [name, categoryName] of [
      ["광안 애견미용", "서비스 > 애견미용"],
      ["광안 펫 장례", "서비스 > 반려동물 장례"],
      ["광안 펫 장묘", "서비스 > 반려동물 장묘"],
      ["광안 동물보호소", "공공기관 > 동물보호소"],
      ["광안 강아지 분양", "서비스 > 반려동물 분양"],
      ["광안 강아지 판매 펫샵", "서비스 > 반려동물 판매"],
      ["광안 동물 전문판매 펫샵", "서비스 > 동물 판매"],
      ["광안 반려동물용품 유통 펫샵", "도매 > 반려동물용품"],
    ]) {
      expect(
        classifyKakaoCollectionCandidate(
          place({ name, categoryName }),
          query("pet_shop"),
        ),
      ).toBeNull();
    }

    expect(
      classifyKakaoCollectionCandidate(
        place({
          name: "광안 애견용품 판매 애견미용",
          categoryName: "가정,생활 > 반려동물용품 > 애견미용",
        }),
        query("pet_shop"),
      ),
    ).toEqual({ candidateKind: "pet_shop", normalizedCategory: null });
  });

  it("applies prohibited-business exclusions to veterinary evidence", () => {
    for (const name of [
      "광안 동물병원 장례식장",
      "광안 동물보호소 부설 동물병원",
      "광안 강아지 분양 동물병원",
      "광안 애견 브리더 동물병원",
      "광안 고양이 판매 동물병원",
      "광안 반려동물용품 유통 동물병원",
    ]) {
      expect(
        classifyKakaoCollectionCandidate(
          place({ name, categoryName: "의료,건강 > 동물병원" }),
          query("veterinary"),
        ),
      ).toBeNull();
    }
  });

  it("keeps veterinary evidence ahead of pet-shop evidence", () => {
    const mixed = place({
      name: "광안 동물병원 펫용품",
      categoryName: "의료,건강 > 동물병원",
    });
    expect(
      classifyKakaoCollectionCandidate(mixed, query("veterinary")),
    ).toEqual({ candidateKind: "veterinary", normalizedCategory: null });
    expect(
      classifyKakaoCollectionCandidate(mixed, query("pet_shop")),
    ).toBeNull();
  });

  it("does not leak veterinary or pet-shop results into travel candidates", () => {
    expect(
      classifyKakaoCollectionCandidate(
        place({ name: "광안 동물병원", categoryName: "의료 > 동물병원" }),
        query("general"),
      ),
    ).toBeNull();
    expect(
      classifyKakaoCollectionCandidate(
        place({ name: "광안 펫샵", categoryName: "쇼핑 > 애견용품" }),
        query("general"),
      ),
    ).toBeNull();
  });

  it("uses group code, then category text, then the query hint for every travel query", () => {
    expect(
      classifyKakaoCollectionCandidate(
        place({ categoryGroupCode: "FD6", categoryName: "음식점 > 카페" }),
        query("cafe"),
      ),
    ).toMatchObject({ normalizedCategory: "food" });
    expect(
      classifyKakaoCollectionCandidate(
        place({ categoryGroupCode: undefined, categoryName: "여행 > 호텔" }),
        query("cafe"),
      ),
    ).toMatchObject({ normalizedCategory: "accommodation" });
    expect(
      classifyKakaoCollectionCandidate(
        place({ categoryGroupCode: undefined, categoryName: "서비스 > 기타" }),
        query("cafe"),
      ),
    ).toMatchObject({ normalizedCategory: "cafe" });
  });

  it("does not treat a bare distribution-area name as a pet-business exclusion", () => {
    expect(
      classifyKakaoCollectionCandidate(
        place({
          name: "유통단지 애견동반 카페",
          categoryName: "음식점 > 카페",
          categoryGroupCode: "CE7",
        }),
        query("cafe"),
      ),
    ).toEqual({
      candidateKind: "pet_travel_candidate",
      normalizedCategory: "cafe",
    });
  });
});
