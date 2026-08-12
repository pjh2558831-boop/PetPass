import { describe, expect, it } from "vitest";
import {
  renderTravelMatrixComparisonMarkdown,
  runControlledTravelMatrixComparison,
} from "@/scripts/lib/travel-matrix-comparison";

describe("controlled travel matrix comparison", () => {
  it("covers every required scenario and proves batching and warm-cache reduction", async () => {
    const report = await runControlledTravelMatrixComparison();
    expect(report.scenarios.map((scenario) => scenario.id)).toEqual([
      "three_candidates",
      "five_candidates",
      "six_candidates",
      "fifteen_candidates",
      "mixed_radius",
      "partial_multi_destination",
    ]);
    expect(report).toMatchObject({
      deterministic: true,
      allColdStrategiesBeatNaivePairwise: true,
      allWarmReplaysReduceProviderCalls: true,
    });
    expect(report.scenarios.every((scenario) => scenario.cold.complete)).toBe(true);
    expect(report.scenarios.every((scenario) => scenario.warm.complete)).toBe(true);
    expect(report.scenarios.every((scenario) => scenario.warm.providerCalls === 0)).toBe(true);
    expect(
      report.scenarios.find((scenario) => scenario.id === "mixed_radius")?.cold
        .fallbackCalls,
    ).toBeGreaterThan(0);
    expect(
      report.scenarios.find((scenario) => scenario.id === "partial_multi_destination")
        ?.cold.fallbackCalls,
    ).toBeGreaterThan(0);
  });

  it("emits only deterministic aggregate fields without provider payloads", async () => {
    const markdown = renderTravelMatrixComparisonMarkdown(
      await runControlledTravelMatrixComparison(),
    );
    expect(markdown).toContain("Synthetic fixture only");
    expect(markdown).not.toMatch(/Authorization|KakaoAK|serviceKey|raw payload/i);
  });
});

