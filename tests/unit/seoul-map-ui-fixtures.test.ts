import { describe, expect, it } from "vitest";

import { SEOUL_PUBLIC_MAP_UI_FIXTURE } from "../fixtures/seoul-public-map-ui";
import {
  SEOUL_SHOPPING_MAP_UI_FIXTURE,
  SEOUL_SHOPPING_MAP_UI_FIXTURE_TOTAL,
} from "../fixtures/seoul-shopping-map-ui";

describe("Seoul map dataset fixtures", () => {
  it("keeps the 76-record core distribution free of shopping", () => {
    expect(SEOUL_PUBLIC_MAP_UI_FIXTURE).toHaveLength(76);
    expect(SEOUL_PUBLIC_MAP_UI_FIXTURE.filter(({ category }) => category === "attraction"))
      .toHaveLength(56);
    expect(SEOUL_PUBLIC_MAP_UI_FIXTURE.filter(({ category }) => category === "accommodation"))
      .toHaveLength(14);
    expect(SEOUL_PUBLIC_MAP_UI_FIXTURE.filter(({ category }) => category === "food"))
      .toHaveLength(6);
    expect(SEOUL_PUBLIC_MAP_UI_FIXTURE.some(({ category }) => category === "shopping"))
      .toBe(false);
  });

  it("keeps shopping separate, complete, and explicitly unverified", () => {
    expect(SEOUL_SHOPPING_MAP_UI_FIXTURE).toHaveLength(
      SEOUL_SHOPPING_MAP_UI_FIXTURE_TOTAL,
    );
    expect(SEOUL_SHOPPING_MAP_UI_FIXTURE_TOTAL).toBeGreaterThan(3_000);
    expect(SEOUL_SHOPPING_MAP_UI_FIXTURE.every((place) =>
      place.category === "shopping" &&
      place.contentTypeId === "38" &&
      place.petAccessVerdict === "unknown" &&
      place.reviewStatus === "needs_review" &&
      place.publicLabel === "반려동물 동반 정보 확인 필요" &&
      place.placeUrl === null
    )).toBe(true);
  });
});
