import { describe, expect, it } from "vitest";
import {
  assertTravelMatrixLiveVerificationAllowed,
  stringifyTravelMatrixLiveArtifact,
  travelMatrixLiveMarkdown,
  type TravelMatrixLiveExecution,
} from "@/scripts/lib/travel-matrix-live-verification";

function report(): TravelMatrixLiveExecution {
  return {
    version: "travel-matrix-v1-live-verification",
    runAsOf: "2026-08-12T03:00:00.000Z",
    scope: "busan",
    stage2Selection: {
      candidateCount: 3,
      contentIds: ["1", "2", "3"],
      categories: { attraction: 2, food: 1 },
      tourProviderCalls: 20,
      tourMaxObservedConcurrency: 3,
      tourRequestCap: 120,
    },
    kakaoBounds: { requestCap: 84, providerCalls: 6, concurrency: 3, maxObservedConcurrency: 3, timeoutMs: 8_000 },
    coldMatrix: {
      nodeCount: 4,
      expectedDirectedEdges: 12,
      resolvedEdges: 12,
      unresolvedEdges: 0,
      batchCalls: 4,
      fallbackCalls: 0,
      providerCalls: 4,
      cacheHits: 0,
      complete: true,
    },
    warmMatrix: { providerCalls: 0, persistentCacheHits: 12, unresolvedEdges: 0, complete: true },
    asymmetricReversePairObserved: true,
    currentRoute: { status: "validated", sectionCount: 3, geometryPointCount: 20, providerCalls: 1 },
    futureRoute: { status: "validated", temporalBasis: "future_departure", sectionCount: 3, geometryPointCount: 20, providerCalls: 1 },
    providerIssues: { matrixFailures: 0, matrixTimeouts: 0, authorizationOrQuotaIssue: false },
    gateChecks: {
      naturalStage2CandidatesUsed: true,
      asymmetricMatrixObserved: true,
      coldMatrixComplete: true,
      warmReplayCompleteWithoutProviderCalls: true,
      currentRouteValidated: true,
      futureRouteValidated: true,
      geometryExtracted: true,
      requestCapRespected: true,
      concurrencyRespected: true,
      noAuthorizationOrQuotaIssue: true,
    },
  };
}

describe("travel matrix live verification safety", () => {
  it("requires exact opt-in, refuses CI, and requires ignored local env", () => {
    expect(() => assertTravelMatrixLiveVerificationAllowed({}, true)).toThrow(
      "RUN_LIVE_TRAVEL_MATRIX_V1=1",
    );
    expect(() =>
      assertTravelMatrixLiveVerificationAllowed(
        { RUN_LIVE_TRAVEL_MATRIX_V1: "1", CI: "" },
        true,
      ),
    ).toThrow("DISABLED_IN_CI");
    expect(() =>
      assertTravelMatrixLiveVerificationAllowed(
        { RUN_LIVE_TRAVEL_MATRIX_V1: "1" },
        false,
      ),
    ).toThrow("REQUIRES_IGNORED_ENV_LOCAL");
    expect(() =>
      assertTravelMatrixLiveVerificationAllowed(
        { RUN_LIVE_TRAVEL_MATRIX_V1: "1" },
        true,
      ),
    ).not.toThrow();
  });

  it("persists only bounded aggregate evidence", () => {
    const value = report() as TravelMatrixLiveExecution & {
      Authorization?: string;
      rawPayload?: string;
    };
    value.Authorization = "KakaoAK secret-value";
    value.rawPayload = "private provider body";
    const artifact = stringifyTravelMatrixLiveArtifact(value);
    expect(artifact).not.toContain("secret-value");
    expect(artifact).not.toContain("private provider body");
    expect(travelMatrixLiveMarkdown(report())).toContain("No raw provider body");
  });
});
