import { describe, expect, it } from "vitest";
import { createKakaoBusanCollectorAdapter } from "@/lib/kakao/collection/collector-adapter";
import { KAKAO_BUSAN_COLLECTION_QUERIES } from "@/lib/kakao/collection/query-registry-v1";
import type { KakaoPlaceSearchResult } from "@/types/kakao";

const SOURCE_QUERY = KAKAO_BUSAN_COLLECTION_QUERIES.find(
  (query) => query.districtCode === "500" && query.family === "general",
);
if (!SOURCE_QUERY) throw new Error("test query missing");

function place(id: string): KakaoPlaceSearchResult {
  return {
    id,
    name: "광안 반려 장소",
    address: "부산광역시 수영구 광안동 1",
    roadAddress: "부산광역시 수영구 광안해변로 1",
    categoryName: "여행 > 관광명소",
    categoryGroupCode: "AT4",
    coordinates: { latitude: 35.1456, longitude: 129.1131 },
  };
}

describe("Kakao Busan collector adapter", () => {
  it("builds a canonical Kakao place URL when the provider omits it", () => {
    const adapter = createKakaoBusanCollectorAdapter([SOURCE_QUERY]);
    expect(
      adapter.classification.classify(place("123456"), adapter.queries[0]),
    ).toMatchObject({
      providerPlaceId: "123456",
      placeUrl: "https://place.map.kakao.com/123456",
    });
  });

  it("rejects a non-numeric provider ID instead of persisting a nullable URL", () => {
    const adapter = createKakaoBusanCollectorAdapter([SOURCE_QUERY]);
    expect(
      adapter.classification.classify(place("not-numeric"), adapter.queries[0]),
    ).toBeNull();
  });

  it("rejects a valid Kakao URL when it identifies a different place", () => {
    const adapter = createKakaoBusanCollectorAdapter([SOURCE_QUERY]);
    expect(
      adapter.classification.classify(
        { ...place("123456"), placeUrl: "https://place.map.kakao.com/999999" },
        adapter.queries[0],
      ),
    ).toBeNull();
  });

  it("normalizes provider text before returning a candidate", () => {
    const adapter = createKakaoBusanCollectorAdapter([SOURCE_QUERY]);
    expect(
      adapter.classification.classify(
        {
          ...place("123456"),
          name: "  광안   반려 장소  ",
          categoryName: "  여행  >  관광명소 ",
          phone: " 051-000-0000 ",
        },
        adapter.queries[0],
      ),
    ).toMatchObject({
      name: "광안 반려 장소",
      categoryName: "여행 > 관광명소",
      phone: "051-000-0000",
    });
  });
});
