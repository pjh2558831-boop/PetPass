import { describe, expect, it, vi } from "vitest";
import { createMapPlacesHandler } from "@/app/api/map/places/route";
import {
  deduplicateKakaoMapPlaces,
  normalizeKakaoMapPlace,
} from "@/lib/map-places/kakao-ingest";
import type { KakaoDiscoveryCandidate } from "@/types/kakao";
import { mapPlaceSchema, type MapPlace } from "@/types/map-place";

const mapPlace: MapPlace = {
  id: 1,
  provider: "kakao",
  provider_place_id: "123",
  name: "광안 반려 카페",
  category_group: "food",
  category_code: "음식점 > 카페",
  content_type_id: null,
  road_address: "부산광역시 수영구 광안해변로 10",
  lot_address: "부산광역시 수영구 광안동 1",
  district_name: "수영구",
  latitude: 35.1456,
  longitude: 129.1131,
  phone: null,
  image_url: null,
  source_url: "https://place.map.kakao.com/123",
  pet_evidence_status: "search_candidate",
  pet_evidence: { verification_required: true },
  pet_notes: "카카오 검색 후보 · 방문 전 동반 가능 여부 확인",
  fetched_at: "2026-08-11T00:00:00.000Z",
};

describe("stored map place route", () => {
  it("accepts the UTC offset timestamp format returned by PostgREST", () => {
    const fetchedAt = "2026-08-11T12:26:34.681+00:00";

    expect(
      mapPlaceSchema.parse({ ...mapPlace, fetched_at: fetchedAt }).fetched_at,
    ).toBe(fetchedAt);
  });

  it("queries a bounded Busan viewport and excludes shopping by default", async () => {
    const query = vi.fn(async () => [mapPlace]);
    const response = await createMapPlacesHandler({ query })(
      new Request(
        "http://localhost/api/map/places?south=35.1&west=129&north=35.2&east=129.2&providers=tour,kakao",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    expect(body.data).toMatchObject({ count: 1, places: [mapPlace] });
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: ["tour", "kakao"],
        categories: expect.not.arrayContaining(["shopping"]),
      }),
    );
  });

  it.each([
    "south=35.2&west=129&north=35.1&east=129.2",
    "south=34&west=129&north=35.1&east=129.2",
    "south=35.1&west=129&north=35.2&east=129.2&providers=other",
    "south=35.1&west=129&north=35.2&east=129.2&query=카페",
    "south=35.1&west=129&north=35.2&east=129.2&limit=1001",
  ])("rejects invalid map query %s", async (parameters) => {
    const query = vi.fn(async () => [mapPlace]);
    const response = await createMapPlacesHandler({ query })(
      new Request(`http://localhost/api/map/places?${parameters}`),
    );
    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("never accepts a client Authorization header", async () => {
    const query = vi.fn(async () => [mapPlace]);
    const response = await createMapPlacesHandler({ query })(
      new Request(
        "http://localhost/api/map/places?south=35.1&west=129&north=35.2&east=129.2",
        { headers: { Authorization: "Bearer client-value" } },
      ),
    );
    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("Kakao map place ingestion", () => {
  const candidate: KakaoDiscoveryCandidate = {
    id: "123",
    name: "광안 반려 카페",
    category: "food",
    kakaoCategoryText: "음식점 > 카페",
    address: "부산광역시 수영구 광안동 1",
    coordinates: { latitude: 35.1456, longitude: 129.1131 },
    placeUrl: "https://place.map.kakao.com/123",
    source: "KAKAO",
    candidateStatus: "discovery_candidate",
    verificationStatus: "verification_required",
    petAccessVerdict: "unknown",
    recommendationEligible: false,
  };

  it("forces the Kakao candidate evidence state and preserves provider identity", () => {
    expect(
      normalizeKakaoMapPlace(
        candidate,
        "food",
        "2026-08-11T00:00:00.000Z",
      ),
    ).toMatchObject({
      provider: "kakao",
      provider_place_id: "123",
      category_group: "food",
      district_name: "수영구",
      location: "POINT(129.1131 35.1456)",
      pet_evidence_status: "search_candidate",
      is_active: true,
    });
  });

  it("deduplicates only by provider and provider place ID", () => {
    const row = normalizeKakaoMapPlace(
      candidate,
      "food",
      "2026-08-11T00:00:00.000Z",
    );
    expect(deduplicateKakaoMapPlaces([row, { ...row, name: "중복" }])).toEqual([
      row,
    ]);
  });
});
