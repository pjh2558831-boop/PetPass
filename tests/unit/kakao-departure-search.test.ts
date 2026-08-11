import { describe, expect, it, vi } from "vitest";
import { searchDepartureLocations } from "@/lib/kakao/departure";

describe("Kakao departure search", () => {
  it("merges place-name and address results with routing coordinates", async () => {
    const searchPlaces = vi.fn(async () => [
      {
        id: "place-1",
        name: "부산역",
        address: "부산 동구 초량동 1187-1",
        roadAddress: "부산 동구 중앙대로 206",
        coordinates: { latitude: 35.1151, longitude: 129.0414 },
      },
    ]);
    const geocode = vi.fn(async () => [
      {
        address: "부산 부산진구 부전동 573-1",
        addressType: "ROAD_ADDR",
        roadAddress: "부산 부산진구 서면로 1",
        coordinates: { latitude: 35.1577, longitude: 129.0592 },
      },
    ]);

    await expect(
      searchDepartureLocations("부산역", 5, { searchPlaces, geocode }),
    ).resolves.toEqual([
      {
        id: "place:place-1",
        kind: "place",
        label: "부산역",
        address: "부산 동구 중앙대로 206",
        coordinates: { latitude: 35.1151, longitude: 129.0414 },
      },
      expect.objectContaining({
        kind: "address",
        label: "부산 부산진구 서면로 1",
        coordinates: { latitude: 35.1577, longitude: 129.0592 },
      }),
    ]);
    expect(searchPlaces).toHaveBeenCalledWith({ query: "부산역", page: 1, size: 5 });
    expect(geocode).toHaveBeenCalledWith("부산역", 5);
  });

  it("keeps successful place results when address lookup is unavailable", async () => {
    const result = await searchDepartureLocations("광안리", 5, {
      searchPlaces: async () => [
        {
          id: "place-2",
          name: "광안리해수욕장",
          address: "부산 수영구 광안동",
          coordinates: { latitude: 35.1532, longitude: 129.1187 },
        },
      ],
      geocode: async () => {
        throw new Error("address unavailable");
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "place", label: "광안리해수욕장" });
  });

  it("deduplicates the same coordinate and preserves place labels first", async () => {
    const result = await searchDepartureLocations("부산역", 5, {
      searchPlaces: async () => [
        {
          id: "place-1",
          name: "부산역",
          address: "부산 동구",
          coordinates: { latitude: 35.1151, longitude: 129.0414 },
        },
      ],
      geocode: async () => [
        {
          address: "부산 동구 초량동",
          addressType: "REGION_ADDR",
          coordinates: { latitude: 35.1151, longitude: 129.0414 },
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("부산역");
  });
});
