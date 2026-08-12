import { describe, expect, it } from "vitest";
import {
  CONTROLLED_CANDIDATE_FIXTURES,
  CONTROLLED_COMPARISON_SCENARIOS,
} from "@/fixtures/candidate-pipeline-v1-controlled";
import {
  canonicalComparisonJson,
  controlledComparisonMarkdown,
  createControlledComparisonReport,
  evaluateControlledLegacyFixedTwelve,
  type ControlledStage2Runner,
} from "@/scripts/lib/candidate-pipeline-comparison";
import { retrieveStageACandidatesV1 } from "@/lib/recommendation/retrieval/candidate-retriever";
import type { CandidatePipelineRequestContext } from "@/lib/recommendation/types";
import type { TourPlaceSummary } from "@/types/place";
import { runControlledCandidatePipelineV1 } from "@/scripts/lib/candidate-pipeline-controlled-adapter";

describe("candidate-pipeline-v1 controlled comparison", () => {
  it("uses a visibly synthetic fixture above every Stage 2 bound", () => {
    expect(CONTROLLED_CANDIDATE_FIXTURES.length).toBeGreaterThan(25);
    expect(
      new Set(CONTROLLED_CANDIDATE_FIXTURES.map(({ contentId }) => contentId))
        .size,
    ).toBeLessThan(CONTROLLED_CANDIDATE_FIXTURES.length);
    expect(
      CONTROLLED_CANDIDATE_FIXTURES.every(({ contentId, title }) =>
        contentId.startsWith("fixture-") && title.startsWith("Synthetic "),
      ),
    ).toBe(true);
  });

  it("models the historical fixed-12 detail ceiling after identity de-duplication", () => {
    const result = evaluateControlledLegacyFixedTwelve(
      CONTROLLED_COMPARISON_SCENARIOS[2],
    );
    expect(result.detailedEvaluationCount).toBe(12);
    expect(result.detailCallsByOperation).toEqual({
      detailCommon2: 12,
      detailIntro2: 12,
      detailPetTour2: 12,
    });
    expect(result.duplicatedDetailCalls).toBe(0);
    expect(result.initialCatalogCount).toBe(
      new Set(CONTROLLED_CANDIDATE_FIXTURES.map(({ contentId }) => contentId))
        .size,
    );
  });

  it("feeds the controlled fixture through the production Stage A implementation", () => {
    const scenario = CONTROLLED_COMPARISON_SCENARIOS[2];
    const retrievedAt = "2026-08-12T00:00:00.000Z";
    const catalog = CONTROLLED_CANDIDATE_FIXTURES.map(
      (value): TourPlaceSummary => ({
        contentId: value.contentId,
        contentTypeId: value.contentTypeId,
        providerContentTypeId: value.contentTypeId,
        category: value.category,
        title: value.title,
        address: "Synthetic Busan address",
        detailAddress: null,
        longitude: value.coordinates.longitude,
        latitude: value.coordinates.latitude,
        phone: "051-000-0000",
        thumbnailUrl: "https://example.invalid/synthetic.jpg",
        imageUrl: null,
        copyrightType: null,
        createdTime: null,
        modifiedTime: "20260812000000",
        legalRegionCode: "26",
        legalDistrictCode: "350",
        classificationCodes: {
          primary: null,
          secondary: null,
          tertiary: null,
          largeCategory: null,
          middleCategory: null,
          smallCategory: null,
        },
        providerVisibility: {
          status: value.providerVisibility,
          providerField: "showflag",
          providerValue:
            value.providerVisibility === "exposed"
              ? "1"
              : value.providerVisibility === "not_exposed"
                ? "0"
                : null,
          checkedAt: retrievedAt,
          reasonCodes: [],
        },
        source: {
          provider: "Korea Tourism Organization",
          operation: "areaBasedList2",
          contentId: value.contentId,
          retrievedAt,
        },
      }),
    );
    const context = {
      request: {
        scope: { type: "busan", regionCode: "26", regionName: "부산 전체" },
        start: { coordinates: scenario.start, label: "Synthetic origin" },
        travelDate: "2026-08-12",
        startTime: "10:00",
        planningMode: "stop_count",
        desiredDurationMinutes: null,
        desiredStopCount: scenario.maxStops,
        tripType: scenario.tripType,
        tripPace: scenario.tripPace,
        petSpecies: "DOG",
        petSize: "SMALL",
        acceptsOutdoorOnly: true,
        petEquipment: {
          hasCarrier: true,
          hasLeash: true,
          hasMuzzle: true,
        },
        indoorAccessPreference: "any",
        selectedCategories: scenario.selectedCategories,
        includeShopping: scenario.includeShopping,
        generationSeed: "controlled",
        recentRouteSignatures: [],
      },
      minStops: scenario.minStops,
      maxStops: scenario.maxStops,
      tripType: scenario.tripType,
      petProfile: {
        species: "DOG",
        size: "SMALL",
        hasCarrier: true,
        hasLeash: true,
        hasMuzzle: true,
        acceptsOutdoorOnly: true,
      },
      tripRequest: {
        scope: {
          regionCode: "26",
          districtCode: null,
          bounds: { west: 128.75, south: 34.95, east: 129.4, north: 35.5 },
        },
        selectedCategories: scenario.selectedCategories,
        includeShopping: scenario.includeShopping,
        indoorAccessPreference: "any",
      },
    } satisfies CandidatePipelineRequestContext;
    const popularityPrior = new Map(
      CONTROLLED_CANDIDATE_FIXTURES.map(({ contentId, popularityPrior }) => [
        contentId,
        popularityPrior,
      ]),
    );
    const stageA = retrieveStageACandidatesV1({
      catalog,
      context,
      asOf: retrievedAt,
      popularityPrior,
    });

    expect(stageA).toHaveLength(25);
    expect(new Set(stageA.map(({ contentId }) => contentId)).size).toBe(25);
    expect(stageA.some(({ category }) => category === "food")).toBe(true);
    expect(stageA.some(({ category }) => category === "accommodation")).toBe(
      true,
    );
    expect(stageA.every(({ providerVisibility }) => providerVisibility === "exposed")).toBe(true);
  });

  it("reports bounded adaptive results, comparison deltas and determinism", async () => {
    const report = await createControlledComparisonReport(
      runControlledCandidatePipelineV1,
    );
    expect(report.scenarioCount).toBe(CONTROLLED_COMPARISON_SCENARIOS.length);
    expect(
      report.scenarios.every(
        ({ stage2 }) =>
          stage2.stageACount <= 25 &&
          stage2.stageBCount <= 20 &&
          stage2.detailedEvaluationCount <= 20 &&
          stage2.detailedBatchCount <= 4 &&
          stage2.finalEligibleContentIds.length <= 15,
      ),
    ).toBe(true);
    expect(report.summary.stage2DuplicatedCalls).toBe(0);
    expect(report.summary.deterministicStage2Output).toBe(true);
    expect(report.summary.stage2EligibleDiscovered).toBeGreaterThan(
      report.summary.legacyEligibleDiscovered,
    );
    expect(report.summary.stage2CategoryCoverage).toBeGreaterThanOrEqual(
      report.summary.legacyCategoryCoverage,
    );
    expect(report.summary.stage2InsufficientRouteFrequency.count).toBeLessThanOrEqual(
      report.summary.legacyInsufficientRouteFrequency.count,
    );
    expect(controlledComparisonMarkdown(report)).toContain(
      "This comparison evaluates candidate discovery only",
    );
  });

  it("exercises the production pipeline through a fourth adaptive detail batch", async () => {
    const scenario = CONTROLLED_COMPARISON_SCENARIOS.find(
      ({ id }) => id === "packed_sparse_activity",
    );
    expect(scenario).toBeDefined();

    const report = await createControlledComparisonReport(
      runControlledCandidatePipelineV1,
      { scenarios: [scenario!] },
    );
    const result = report.scenarios[0].stage2;

    expect(result.detailedEvaluationCount).toBeGreaterThan(15);
    expect(result.detailedEvaluationCount).toBeLessThanOrEqual(20);
    expect(result.detailedBatchCount).toBe(4);
    expect(result.eligibleContentIds.length).toBeGreaterThan(
      report.scenarios[0].legacy.eligibleContentIds.length,
    );
    expect(result.insufficientEligiblePlaces).toBe(false);
  });

  it("canonicalizes object-key order without changing array order", () => {
    expect(canonicalComparisonJson({ b: 2, a: [{ d: 4, c: 3 }] })).toBe(
      canonicalComparisonJson({ a: [{ c: 3, d: 4 }], b: 2 }),
    );
    expect(canonicalComparisonJson(["b", "a"])).not.toBe(
      canonicalComparisonJson(["a", "b"]),
    );
  });

  it("rejects a nondeterministic Stage 2 adapter", async () => {
    let invocation = 0;
    const unstable: ControlledStage2Runner = (input) => {
      invocation += 1;
      return Promise.resolve(runControlledCandidatePipelineV1(input)).then(
        (value) => ({
          ...value,
          cacheHits: invocation,
        }),
      );
    };
    await expect(
      createControlledComparisonReport(unstable, {
        scenarios: [CONTROLLED_COMPARISON_SCENARIOS[0]],
      }),
    ).rejects.toThrow("CONTROLLED_STAGE2_OUTPUT_NOT_DETERMINISTIC");
  });
});
