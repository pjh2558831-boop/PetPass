import { describe, expect, it } from "vitest";
import {
  mergeHomepageEnrichment,
  mergeHomepageOptionalInitial,
  projectHomepageInitialSnapshot,
  shouldApplyHomepageResponse,
} from "@/lib/homepage/homepage-progressive";
import type { HomepageEnrichmentSnapshot } from "@/types/homepage-enrichment";
import type { HomepageInitialPlacesSnapshot } from "@/types/homepage-initial";
import {
  homepageOptionalDataHash,
  type HomepageOptionalSnapshot,
} from "@/types/homepage-optional";

const initial: HomepageInitialPlacesSnapshot = {
  contractVersion: 1,
  region: "busan",
  scope: "default",
  providers: "default",
  generatedAt: "2026-08-24T03:00:00.000Z",
  dataVersion: "v1-0123456789abcdef",
  generationId: "g1-0123456789abcdef",
  totalCount: 3,
  markerCount: 3,
  freshness: { status: "fresh" },
  layers: {
    tourism: { state: "ready", count: 2, markerCount: 2 },
    kakao: { state: "ready", count: 1, markerCount: 1 },
    veterinary: { state: "deferred", count: null, markerCount: null },
    pet_shop: { state: "deferred", count: null, markerCount: null },
  },
  categoryCounts: [
    ["tourism", "attraction", 2],
    ["kakao", "cafe", 1],
  ],
  markers: [
    ["tour:1", "공식 허용 장소", "tourism", "attraction", "중구", 35.1, 129.1, "allowed", "동반 가능"],
    ["tour:2", "공식 확인 장소", "tourism", "attraction", "중구", 35.2, 129.2, "unknown", "동반 조건 확인 필요"],
    ["kakao:3", "카카오 후보", "kakao", "cafe", "수영구", 35.3, 129.3, "unknown", "방문 전 확인 필요"],
  ],
  cardDetails: [],
  continuations: [
    { datasetId: "default-tour", layer: "tourism", provider: "tour", kind: "tourism_place", loadedItemCount: 2, expectedTotalCount: 2, nextCursor: 2, complete: true, generationId: "g1-0123456789abcdef" },
    { datasetId: "default-kakao", layer: "kakao", provider: "kakao", kind: "pet_travel_candidate", loadedItemCount: 1, expectedTotalCount: 1, nextCursor: 3, complete: true, generationId: "g1-0123456789abcdef" },
  ],
};

describe("homepage progressive client projection", () => {
  it("renders truthful base markers and useful cards without image or phone readiness", () => {
    const projected = projectHomepageInitialSnapshot(initial);

    expect(projected.markers).toHaveLength(3);
    expect(projected.markers.find(({ id }) => id === "tour:1")).toMatchObject({
      layer: "official",
      isAllowed: true,
      sourceLabel: "한국관광공사",
      imageUrl: null,
    });
    expect(projected.markers.find(({ id }) => id === "kakao:3")).toMatchObject({
      layer: "kakao_candidate",
      isAllowed: false,
      sourceLabel: "카카오 검색 후보",
    });
    expect(projected.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "tour:1", phone: null, imageUrl: null, isAllowed: true }),
      expect.objectContaining({ id: "kakao:3", phone: null, imageUrl: null, isAllowed: false }),
    ]));
    expect(projected.cards.some(({ id }) => id === "tour:2")).toBe(false);
  });

  it("merges optional markers without replacing the active base region", () => {
    const optional: HomepageOptionalSnapshot = {
      ...initial,
      scope: "optional",
      providers: "kakao",
      dataset: "optional-veterinary",
      status: "complete",
      retrievedAt: "2026-08-24T03:00:00.000Z",
      dataVersion: "v1-fedcba9876543210",
      generationId: "g1-fedcba9876543210",
      totalCount: 2,
      markerCount: 2,
      layers: {
        tourism: { state: "deferred", count: null, markerCount: null },
        kakao: { state: "deferred", count: null, markerCount: null },
        veterinary: { state: "ready", count: 1, markerCount: 1 },
        pet_shop: { state: "ready", count: 1, markerCount: 1 },
      },
      categoryCounts: [
        ["veterinary", "veterinary", 1],
        ["pet_shop", "pet_shop", 1],
      ],
      markers: [
        ["kakao:4", "동물병원", "veterinary", "veterinary", "해운대구", 35.4, 129.4, "unknown", "진료 시간 확인 필요"],
        ["kakao:5", "펫샵", "pet_shop", "pet_shop", "해운대구", 35.5, 129.5, "unknown", "운영 정보 확인 필요"],
      ],
      cardDetails: [
        ["kakao:4", "부산광역시 해운대구 병원로 1", "051-123-4567", null],
        ["kakao:5", "부산광역시 해운대구 상점로 2", null, null],
      ],
      integrity: {
        dataHash: "",
        expectedItemCount: 2,
        returnedItemCount: 2,
        providerTotalCount: 2,
        visibilityTotalCount: null,
        pageCount: 1,
        visibilityPageCount: null,
        pageSize: 200,
        nextCursor: 5,
        traversalComplete: true,
      },
      continuations: [
        { datasetId: "optional-veterinary", layer: "veterinary", provider: "kakao", kind: "veterinary", loadedItemCount: 1, expectedTotalCount: 1, nextCursor: 4, complete: true, generationId: "g1-fedcba9876543210" },
        { datasetId: "optional-pet-shop", layer: "pet_shop", provider: "kakao", kind: "pet_shop", loadedItemCount: 1, expectedTotalCount: 1, nextCursor: 5, complete: true, generationId: "g1-fedcba9876543210" },
      ],
    };
    optional.integrity.dataHash = homepageOptionalDataHash(optional);
    const merged = mergeHomepageOptionalInitial(
      projectHomepageInitialSnapshot(initial),
      optional,
      "busan",
    );
    expect(merged.markers.map(({ id }) => id)).toEqual(["tour:1", "tour:2", "kakao:3", "kakao:4", "kakao:5"]);
    expect(merged.layers.veterinary).toMatchObject({ state: "ready", count: 1 });
    expect(merged.cards.find(({ id }) => id === "kakao:4")).toMatchObject({
      address: "부산광역시 해운대구 병원로 1",
      phone: "051-123-4567",
    });
    expect(() => mergeHomepageOptionalInitial(merged, { ...optional, region: "jeju" }, "busan"))
      .toThrow(/region|지역/iu);
  });

  it("merges verified KTO cards but preserves the usable base when enrichment is absent", () => {
    const base = projectHomepageInitialSnapshot(initial);
    const enrichment: HomepageEnrichmentSnapshot = {
      contractVersion: 1,
      region: "busan",
      scope: "featured",
      generatedAt: "2026-08-24T03:01:00.000Z",
      dataVersion: "v1-1111111111111111",
      freshness: { status: "fresh" },
      featuredState: "ready",
      cards: [{
        ...base.cards.find(({ id }) => id === "tour:1")!,
        phone: "051-000-0000",
        imageUrl: "https://example.com/enriched.jpg",
      }],
    };
    const merged = mergeHomepageEnrichment(base, enrichment, "busan");
    expect(merged.cards.find(({ id }) => id === "tour:1")).toMatchObject({
      phone: "051-000-0000",
      imageUrl: "https://example.com/enriched.jpg",
    });
    expect(merged.cards.some(({ id }) => id === "kakao:3")).toBe(true);
    expect(mergeHomepageEnrichment(base, { ...enrichment, cards: [], featuredState: "unavailable" }, "busan").cards)
      .toEqual(base.cards);
  });

  it("rejects late enrichment for a superseded region or base request", () => {
    expect(shouldApplyHomepageResponse("busan:v1-current", "busan:v1-current")).toBe(true);
    expect(shouldApplyHomepageResponse("jeju:v1-next", "busan:v1-current")).toBe(false);
    expect(shouldApplyHomepageResponse("busan:v1-next", "busan:v1-current")).toBe(false);
    expect(shouldApplyHomepageResponse(null, "busan:v1-current")).toBe(false);
  });
});
