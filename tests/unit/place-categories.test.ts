import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLACE_CATEGORIES,
  OPTIONAL_PLACE_CATEGORIES,
  mapCatalogPlaceToCategory,
  mapTourSummaryToPlaceCategory,
} from "@/lib/map-places/place-categories";

describe("canonical place categories", () => {
  it("starts with exactly the four primary travel categories", () => {
    expect(DEFAULT_PLACE_CATEGORIES).toEqual(["attraction", "food", "cafe", "accommodation"]);
    expect(OPTIONAL_PLACE_CATEGORIES).toEqual(["shopping", "veterinary", "pet_shop"]);
  });

  it("maps Tourism content types without title inference", () => {
    expect(mapTourSummaryToPlaceCategory({ contentTypeId: "12", category: "attraction" })).toBe("attraction");
    expect(mapTourSummaryToPlaceCategory({ contentTypeId: "39", category: "food" })).toBe("food");
    expect(mapTourSummaryToPlaceCategory({ contentTypeId: "32", category: "accommodation" })).toBe("accommodation");
    expect(mapTourSummaryToPlaceCategory({ contentTypeId: "38", category: "shopping" })).toBe("shopping");
  });

  it("keeps ordinary shopping and facilities in separate categories", () => {
    expect(mapCatalogPlaceToCategory({ layer: "kakao", category: "other", categoryGroupCode: "CS2" })).toBe("shopping");
    expect(mapCatalogPlaceToCategory({ layer: "veterinary", category: "other", categoryGroupCode: null })).toBe("veterinary");
    expect(mapCatalogPlaceToCategory({ layer: "pet_shop", category: "other", categoryGroupCode: "CS2" })).toBe("pet_shop");
  });
});
