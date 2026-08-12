import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIVE_CANDIDATE_PIPELINE_BOUNDS } from "@/scripts/lib/candidate-pipeline-live-adapter";
import {
  assertCandidatePipelineLiveVerificationAllowed,
  candidatePipelineLiveMarkdown,
  createCandidatePipelineLiveVerificationReport,
  LIVE_CANDIDATE_PIPELINE_OPT_IN_ENV,
  STAGE1_LIVE_ELIGIBLE_CONTENT_IDS,
  stringifyCandidatePipelineLiveArtifact,
  type LiveCandidatePipelineExecution,
  type LiveCandidateScenarioExecution,
  type LiveProviderAccounting,
} from "@/scripts/lib/candidate-pipeline-live-verification";

function descendantFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? descendantFiles(path) : [path];
  });
}

function accounting(overrides: Partial<LiveProviderAccounting> = {}): LiveProviderAccounting {
  return {
    physicalProviderCalls: 0,
    logicalProviderOperations: 0,
    cacheHits: 0,
    retries: 0,
    timeouts: 0,
    providerFailures: 0,
    duplicateDetailOperations: 0,
    callsByOperation: {},
    ...overrides,
  };
}

function scenario(
  phase: "cold" | "warm",
  canonicalResult = "same",
): LiveCandidateScenarioExecution {
  return {
    id: "relaxed_day_trip",
    label: "Relaxed",
    phase,
    status: "ready",
    durationMs: phase === "cold" ? 100 : 10,
    diagnostics: {
      initialCatalogCount: 40,
      exposedCount: 40,
      coordinateValidCount: 40,
      categoryAcceptedCount: 30,
      stageACount: 25,
      stageBCount: 20,
      detailedEvaluationCount: 20,
      detailedBatchCount: 4,
      eligibleCount: 3,
      finalEligibleCount: 3,
      categoryDistribution: { attraction: 2, food: 1 },
      excludedByReason: { pet_access_unknown: 1 },
      warningsByReason: { operating_hours_unknown: 1 },
    },
    accounting: accounting({
      physicalProviderCalls: phase === "cold" ? 10 : 0,
      logicalProviderOperations: 10,
      cacheHits: phase === "cold" ? 0 : 10,
    }),
    eligibleContentIds: [STAGE1_LIVE_ELIGIBLE_CONTENT_IDS[0], "safe-2", "safe-3"],
    knownSamples: STAGE1_LIVE_ELIGIBLE_CONTENT_IDS.map((contentId, index) => ({
      contentId,
      presentInInitialCatalog: true,
      enteredStageA: index === 0,
      enteredStageB: index === 0,
      receivedDetailedEvaluation: index === 0,
      passedAutomaticEligibility: index === 0,
      finalEligiblePool: index === 0,
      removalReason: index === 0 ? null : "stage_a_not_selected",
    })),
    finalCandidates: ["safe-1", "safe-2", "safe-3"].map((contentId, index) => ({
      contentId: index === 0 ? STAGE1_LIVE_ELIGIBLE_CONTENT_IDS[0] : contentId,
      category: index === 2 ? "food" : "attraction",
      sourceIsTourismService2: true,
      visibilityIsFreshExposed: true,
      coordinatesValidAndInScope: true,
      meaningfulPetEvidence: true,
      phase3Verdict: "allowed",
      phase3EligibleState: true,
      mandatoryConditionsSatisfied: true,
      licensingExplicitlyClosed: false,
      confirmedScheduleConflict: false,
      categoryRequested: true,
      shoppingExplicitlySelected: true,
      kakaoOrDemoSource: false,
      utility: {
        version: "place-utility-v1",
        total: 750,
        componentsWithinRange: true,
      },
      popularity: {
        version: "popularity-v1",
        score: 0.5,
        status: "insufficient_data",
        neutralColdStart: true,
      },
    })),
    canonicalResult,
  };
}

function execution(): LiveCandidatePipelineExecution {
  return {
    runAsOf: "2026-08-12T00:00:00.000Z",
    bounds: {
      requestCap: 240,
      concurrency: 3,
      maxObservedConcurrency: 3,
      timeoutMs: 8_000,
      retryCount: 1,
    },
    catalogAccounting: accounting({ physicalProviderCalls: 4 }),
    coldScenarios: [scenario("cold")],
    warmScenarios: [scenario("warm")],
    totalPhysicalProviderCalls: 14,
    totalDurationMs: 150,
  };
}

describe("candidate-pipeline-v1 live verification safety", () => {
  it("pins the optional live adapter's request, concurrency, timeout, and retry bounds", () => {
    expect(LIVE_CANDIDATE_PIPELINE_BOUNDS).toEqual({
      requestCap: 240,
      concurrency: 3,
      timeoutMs: 8_000,
      retryCount: 1,
    });
  });

  it("keeps the exact Stage 1 verification IDs outside product recommendation sources", () => {
    const expectedStage1Ids = [
      "2504464",
      "2672393",
      "3426656",
      "3112126",
      "2699563",
      "3350880",
      "3438936",
    ];
    expect(STAGE1_LIVE_ELIGIBLE_CONTENT_IDS).toEqual(expectedStage1Ids);

    const recommendationRoot = join(process.cwd(), "lib", "recommendation");
    const productSource = descendantFiles(recommendationRoot)
      .sort()
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    for (const contentId of expectedStage1Ids) {
      expect(productSource, `product source contains Stage 1 ID ${contentId}`).not.toContain(
        contentId,
      );
    }
  });

  it("requires the exact opt-in, denies CI, and requires ignored local env", () => {
    expect(() =>
      assertCandidatePipelineLiveVerificationAllowed({}, true),
    ).toThrow(
      `LIVE_CANDIDATE_PIPELINE_REQUIRES_${LIVE_CANDIDATE_PIPELINE_OPT_IN_ENV}=1`,
    );
    expect(() =>
      assertCandidatePipelineLiveVerificationAllowed(
        { [LIVE_CANDIDATE_PIPELINE_OPT_IN_ENV]: "1", CI: "" },
        true,
      ),
    ).toThrow("LIVE_CANDIDATE_PIPELINE_DISABLED_IN_CI");
    expect(() =>
      assertCandidatePipelineLiveVerificationAllowed(
        { [LIVE_CANDIDATE_PIPELINE_OPT_IN_ENV]: "1" },
        false,
      ),
    ).toThrow("LIVE_CANDIDATE_PIPELINE_REQUIRES_IGNORED_ENV_LOCAL");
    expect(() =>
      assertCandidatePipelineLiveVerificationAllowed(
        { [LIVE_CANDIDATE_PIPELINE_OPT_IN_ENV]: "1" },
        true,
      ),
    ).not.toThrow();
  });

  it("reports bounded stages, natural rediscovery, strict boundaries, and warm reduction", () => {
    const report = createCandidatePipelineLiveVerificationReport(execution());

    expect(report).toMatchObject({
      naturallyRediscoveredSampleIds: [STAGE1_LIVE_ELIGIBLE_CONTENT_IDS[0]],
      deterministicWarmReplay: true,
      coldPhysicalProviderCalls: 14,
      warmPhysicalProviderCalls: 0,
      requestReduction: 1,
    });
    expect(Object.values(report.gateChecks)).not.toContain(false);
  });

  it("fails deterministic and boundary checks when warm output or evidence changes", () => {
    const value = execution();
    value.warmScenarios[0] = scenario("warm", "different");
    value.coldScenarios[0].finalCandidates[0].visibilityIsFreshExposed = false;
    const report = createCandidatePipelineLiveVerificationReport(value);

    expect(report.deterministicWarmReplay).toBe(false);
    expect(report.gateChecks.noStrictBoundaryLeakage).toBe(false);
  });

  it("sanitizes credentials, URLs, raw fields, and markdown cells", () => {
    const report = createCandidatePipelineLiveVerificationReport(execution());
    report.coldScenarios[0].knownSamples[0].removalReason =
      "serviceKey=super-secret https://apis.data.go.kr/path?serviceKey=super-secret";
    const json = stringifyCandidatePipelineLiveArtifact({
      ...report,
      rawPayload: "secret raw body",
      requestUrl: "https://example.com/?serviceKey=secret",
    } as typeof report);
    const markdown = candidatePipelineLiveMarkdown(report);

    expect(json).not.toContain("super-secret");
    expect(json).not.toContain("apis.data.go.kr");
    expect(json).not.toContain("secret raw body");
    expect(json).toContain('"rawPayload": "[omitted]"');
    expect(markdown).not.toContain("super-secret");
    expect(markdown).toContain("No raw provider payload");
  });
});
