import { describe, expect, it } from "vitest";
import {
  assertRouteOptimizerLiveVerificationAllowed,
  routeOptimizerLiveMarkdown,
  stringifyRouteOptimizerLiveArtifact,
  type RouteOptimizerLiveReport,
} from "@/scripts/lib/route-optimizer-live-verification";

describe("route optimizer live verifier safety", () => {
  it("requires positive opt-in and an ignored env file and refuses CI", () => {
    expect(() => assertRouteOptimizerLiveVerificationAllowed({}, true)).toThrow(/RUN_LIVE_ROUTE_OPTIMIZER_V1/);
    expect(() => assertRouteOptimizerLiveVerificationAllowed({ RUN_LIVE_ROUTE_OPTIMIZER_V1: "1" }, false)).toThrow(/ENV_LOCAL/);
    expect(() => assertRouteOptimizerLiveVerificationAllowed({ RUN_LIVE_ROUTE_OPTIMIZER_V1: "1", CI: "" }, true)).toThrow(/DISABLED_IN_CI/);
    expect(() => assertRouteOptimizerLiveVerificationAllowed({ RUN_LIVE_ROUTE_OPTIMIZER_V1: "1" }, true)).not.toThrow();
  });

  it("sanitizes persisted report text", () => {
    const report = {
      version: "route-optimizer-v1-live-verification", runAsOf: "2026-08-12T00:00:00.000Z", scope: "busan",
      stage2: { candidateCount: 1, contentIds: ["id"], categories: { food: 1 }, providerCalls: 1 },
      matrix: { nodeCount: 2, resolvedEdges: 2, expectedEdges: 2, complete: true, providerCalls: 1 },
      solver: { status: "ready", stopIds: ["id"], score: 1, totalDrivingSeconds: 1, totalDistanceMeters: 1, selectedCategoryCount: 1, geometryPointCount: 2, matrixTemporalBasis: "current_traffic", finalValidationTemporalBasis: "current_traffic", validationAttempts: 1, validationFailures: 0, exactSearchCompleted: true, beamFallbackUsed: false, deterministicReplay: true },
      baselines: [], bounds: { tourCalls: 1, tourCap: 120, kakaoCalls: 1, kakaoCap: 84, maxObservedConcurrency: 1, concurrencyCap: 3, timeoutMs: 8_000 },
      gateChecks: { safe: true },
    } satisfies RouteOptimizerLiveReport;
    const serialized = stringifyRouteOptimizerLiveArtifact(report);
    expect(serialized).not.toContain("Authorization");
    expect(routeOptimizerLiveMarkdown(report)).toContain("No raw provider body");
  });
});
