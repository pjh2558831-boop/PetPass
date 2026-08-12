import { describe, expect, it } from "vitest";
import {
  DWELL_DURATION_V1_CONFIG,
  resolveDwellDurationV1,
} from "@/lib/recommendation/config/dwell-duration-v1";

describe("dwell-duration-v1", () => {
  it("defines every required default without inventing provider hours", () => {
    expect(DWELL_DURATION_V1_CONFIG.defaultsMinutes).toEqual({
      "12": 90,
      "14": 90,
      "15": 120,
      "28": 120,
      "32": 30,
      "38": 60,
      "39": 75,
      cafe_rest: 60,
    });
    expect(resolveDwellDurationV1({ category: "28" })).toEqual({
      version: "dwell-duration-v1",
      minutes: 120,
      source: "default",
      defaultUsed: true,
      category: "28",
    });
  });

  it("uses only an explicitly reliable positive integer provider duration", () => {
    expect(
      resolveDwellDurationV1({
        category: "12",
        providerDurationMinutes: 45,
        providerDurationReliable: true,
      }),
    ).toMatchObject({ minutes: 45, source: "provider", defaultUsed: false });
    for (const providerDurationMinutes of [45.5, 0, -1, Number.NaN]) {
      expect(
        resolveDwellDurationV1({
          category: "12",
          providerDurationMinutes,
          providerDurationReliable: true,
        }),
      ).toMatchObject({ minutes: 90, source: "default", defaultUsed: true });
    }
    expect(
      resolveDwellDurationV1({
        category: "12",
        providerDurationMinutes: 45,
        providerDurationReliable: false,
      }),
    ).toMatchObject({ minutes: 90, source: "default", defaultUsed: true });
  });
});
