import { describe, expect, it } from "vitest";
import { JEJU_PUBLIC_MAP_UI_FIXTURE } from "@/fixtures/jeju-public-map-ui";

describe("Jeju public map UI fixture", () => {
  it("matches the audited Phase 3 presentation totals", () => {
    expect(JEJU_PUBLIC_MAP_UI_FIXTURE).toHaveLength(54);
    expect(JEJU_PUBLIC_MAP_UI_FIXTURE.filter(({ district }) => district.code === "110")).toHaveLength(27);
    expect(JEJU_PUBLIC_MAP_UI_FIXTURE.filter(({ district }) => district.code === "130")).toHaveLength(27);
    expect(JEJU_PUBLIC_MAP_UI_FIXTURE.filter(({ imageUrl }) => imageUrl !== null)).toHaveLength(45);
    expect(JEJU_PUBLIC_MAP_UI_FIXTURE.filter(({ imageUrl }) => imageUrl === null)).toHaveLength(9);
    expect(JEJU_PUBLIC_MAP_UI_FIXTURE.filter(({ petAccessVerdict }) => petAccessVerdict === "conditional")).toHaveLength(49);
    expect(JEJU_PUBLIC_MAP_UI_FIXTURE.filter(({ petAccessVerdict }) => petAccessVerdict === "unknown")).toHaveLength(5);
  });

  it("contains only Jeju KTO tourism records and never invents a phone", () => {
    expect(JEJU_PUBLIC_MAP_UI_FIXTURE.every((place) =>
      place.provider === "tour" &&
      place.kind === "tourism_place" &&
      place.source === "kto_official" &&
      place.phone === null &&
      ["110", "130"].includes(place.district.code) &&
      place.placeUrl?.includes("region=jeju") === true,
    )).toBe(true);
    expect(JEJU_PUBLIC_MAP_UI_FIXTURE.some(({ category }) => category === "shopping")).toBe(false);
  });
});
