import { describe, expect, it } from "vitest";
import {
  addSelectedItineraryPlace,
  createSelectedItinerarySnapshot,
  getSelectedItineraryCategories,
  loadSelectedItinerary,
  removeSelectedItineraryPlace,
  requiresSelectionRegionClear,
  saveSelectedItinerary,
  setSelectedItineraryVerificationAcknowledged,
  selectedItineraryPlaceFromCatalog,
  type SelectedItineraryPlace,
} from "@/lib/storage/selected-itinerary-storage";
import type { StorageLike } from "@/lib/storage/versioned-storage";
import type { PublicCatalogPlace } from "@/types/public-catalog-place";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  seed(key: string, value: string) {
    this.values.set(key, value);
  }
}

function place(
  id: string,
  overrides: Partial<SelectedItineraryPlace> = {},
): SelectedItineraryPlace {
  return {
    id,
    regionId: "busan",
    providerPlaceId: id.split(":")[1]!,
    name: `장소 ${id}`,
    layer: id.startsWith("tour:") ? "tourism" : "kakao",
    category: "attraction",
    sourceLabel: id.startsWith("tour:") ? "한국관광공사" : "카카오 검색 후보",
    publicLabel: "동반 정보 확인 필요",
    petAccessVerdict: "unknown",
    imageUrl: null,
    ...overrides,
  };
}

describe("selected itinerary storage", () => {
  it("preserves the catalog image for the planner selected-place summary", () => {
    const catalogPlace = {
      ...place("tour:7001"),
      districtCode: "110",
      districtName: "수영구",
      address: "부산 수영구 광안해변로",
      coordinates: { latitude: 35.153, longitude: 129.118 },
      phone: null,
      imageUrl: "https://tong.visitkorea.or.kr/cms/resource/selected-place.jpg",
      approvedImageUrl: null,
      placeUrl: "/places/7001?region=busan",
      warning: null,
      tourPlace: null,
    } satisfies PublicCatalogPlace;

    expect(selectedItineraryPlaceFromCatalog(catalogPlace).imageUrl).toBe(
      "https://tong.visitkorea.or.kr/cms/resource/selected-place.jpg",
    );
  });

  it("adds, deselects, and persists canonical places independently of filters and pages", () => {
    const storage = new MemoryStorage();
    let snapshot = createSelectedItinerarySnapshot("busan");

    const selected = addSelectedItineraryPlace(snapshot, place("tour:7001"));
    expect(selected.status).toBe("selected");
    snapshot = selected.snapshot;
    expect(saveSelectedItinerary(snapshot, storage)).toBe(true);

    // Catalog filter, sort, page, and map-preview state are intentionally not
    // part of this stored selection contract.
    const unrelatedCatalogState = { page: 3, category: "cafe", sort: "popularity" };
    expect(unrelatedCatalogState.page).toBe(3);
    expect(loadSelectedItinerary(storage)?.places.map(({ id }) => id)).toEqual([
      "tour:7001",
    ]);

    const removed = removeSelectedItineraryPlace(snapshot, "tour:7001");
    expect(removed.places).toEqual([]);
  });

  it("enforces the five-place limit and blocks known-not-allowed or unsupported facilities", () => {
    let snapshot = createSelectedItinerarySnapshot("busan");
    for (let index = 1; index <= 5; index += 1) {
      snapshot = addSelectedItineraryPlace(snapshot, place(`tour:${7000 + index}`)).snapshot;
    }

    expect(addSelectedItineraryPlace(snapshot, place("tour:7999"))).toMatchObject({
      status: "limit_reached",
      snapshot,
    });
    expect(addSelectedItineraryPlace(
      createSelectedItinerarySnapshot("busan"),
      place("tour:7998", { petAccessVerdict: "not_allowed" }),
    ).status).toBe("blocked_not_allowed");
    expect(addSelectedItineraryPlace(
      createSelectedItinerarySnapshot("busan"),
      place("kakao:7997", { layer: "veterinary" }),
    ).status).toBe("blocked_unsupported");
  });

  it("requires an explicit clear before changing a selected itinerary to another region", () => {
    const selected = addSelectedItineraryPlace(
      createSelectedItinerarySnapshot("busan"),
      place("tour:7001"),
    ).snapshot;

    expect(requiresSelectionRegionClear(selected, "jeju")).toBe(true);
    expect(requiresSelectionRegionClear(selected, "busan")).toBe(false);
    expect(requiresSelectionRegionClear(createSelectedItinerarySnapshot("busan"), "jeju")).toBe(false);
  });

  it("derives only truthful recommendation categories from selected place metadata", () => {
    const snapshot = {
      ...createSelectedItinerarySnapshot("busan"),
      places: [
        place("tour:7001", { category: "attraction" }),
        place("kakao:9001", { category: "cafe" }),
        place("tour:7002", { category: "shopping" }),
      ],
    };

    expect(getSelectedItineraryCategories(snapshot.places)).toEqual([
      "attraction",
      "food",
      "shopping",
    ]);
  });

  it("persists an explicit acknowledgement only for selected verification-required places", () => {
    const unknown = place("kakao:9001");
    const verified = place("tour:7001", { petAccessVerdict: "allowed" });
    let snapshot = createSelectedItinerarySnapshot("busan");
    snapshot = addSelectedItineraryPlace(snapshot, unknown).snapshot;
    snapshot = addSelectedItineraryPlace(snapshot, verified).snapshot;

    snapshot = setSelectedItineraryVerificationAcknowledged(snapshot, "kakao:9001", true);
    snapshot = setSelectedItineraryVerificationAcknowledged(snapshot, "tour:7001", true);
    expect(snapshot.acknowledgedVerificationRequiredPlaceIds).toEqual(["kakao:9001"]);

    expect(removeSelectedItineraryPlace(snapshot, "kakao:9001"))
      .toMatchObject({ acknowledgedVerificationRequiredPlaceIds: [] });
  });

  it("migrates the existing selection snapshot with no implicit acknowledgement", () => {
    const storage = new MemoryStorage();
    storage.seed("weekendog:selected-itinerary", JSON.stringify({
      version: 1,
      data: {
        regionId: "busan",
        autoFill: true,
        places: [place("kakao:9001")],
      },
    }));

    expect(loadSelectedItinerary(storage)).toMatchObject({
      acknowledgedVerificationRequiredPlaceIds: [],
      places: [{ id: "kakao:9001" }],
    });
  });

  it("normalizes legacy verification-required candidate inclusion to false", () => {
    const storage = new MemoryStorage();
    const snapshot = {
      ...createSelectedItinerarySnapshot("busan"),
      includeVerificationRequired: true,
      places: [place("kakao:9001")],
    };

    expect(saveSelectedItinerary(snapshot, storage)).toBe(true);
    expect(loadSelectedItinerary(storage)?.includeVerificationRequired).toBe(false);
  });
});
