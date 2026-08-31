import {
  CONTROLLED_CANDIDATE_FIXTURES,
  CONTROLLED_COMPARISON_SCENARIOS,
  CONTROLLED_FIXTURE_VERSION,
  type ControlledCandidateFixture,
  type ControlledCategory,
  type ControlledComparisonScenario,
} from "@/fixtures/candidate-pipeline-v1-controlled";
import { haversineKm } from "@/lib/itinerary/optimizer";
import { CANDIDATE_PIPELINE_V1_CONFIG } from "@/lib/recommendation/config/candidate-pipeline-v1";

export const CONTROLLED_COMPARISON_VERSION =
  "candidate-pipeline-controlled-comparison-v1" as const;

export interface ControlledDetailOperationCounts {
  detailCommon2: number;
  detailIntro2: number;
  detailPetTour2: number;
}

export interface ControlledComparisonArmResult {
  implementation:
    | "pre_stage2_fixed_12_role_aware"
    | "candidate_pipeline_v1";
  initialCatalogCount: number;
  lightweightAcceptedCount: number;
  stageACount: number;
  stageBCount: number;
  detailedEvaluationCount: number;
  detailedBatchCount: number;
  eligibleContentIds: string[];
  finalEligibleContentIds: string[];
  representedCategories: ControlledCategory[];
  providerCalls: number;
  cacheHits: number;
  detailCallsByOperation: ControlledDetailOperationCounts;
  duplicatedDetailCalls: number;
  excludedByReason: Record<string, number>;
  insufficientEligiblePlaces: boolean;
  requiredMinimum: number;
}

export interface ControlledStage2RunnerInput {
  scenario: ControlledComparisonScenario;
  candidates: readonly ControlledCandidateFixture[];
}

export type ControlledStage2Runner = (
  input: ControlledStage2RunnerInput,
) =>
  | ControlledComparisonArmResult
  | Promise<ControlledComparisonArmResult>;

export interface ControlledScenarioComparison {
  scenario: ControlledComparisonScenario;
  legacy: ControlledComparisonArmResult;
  stage2: ControlledComparisonArmResult;
  eligibleDiscoveryDelta: number;
  categoryCoverageDelta: number;
  providerCallDelta: number;
  detailCallDelta: number;
  deterministicStage2Output: boolean;
}

export interface ControlledComparisonReport {
  version: typeof CONTROLLED_COMPARISON_VERSION;
  fixtureVersion: typeof CONTROLLED_FIXTURE_VERSION;
  scenarioCount: number;
  scenarios: ControlledScenarioComparison[];
  summary: {
    legacyEligibleDiscovered: number;
    stage2EligibleDiscovered: number;
    eligibleDiscoveryDelta: number;
    legacyCategoryCoverage: number;
    stage2CategoryCoverage: number;
    categoryCoverageDelta: number;
    legacyProviderCalls: number;
    stage2ProviderCalls: number;
    providerCallDelta: number;
    legacyDetailCalls: number;
    stage2DetailCalls: number;
    detailCallDelta: number;
    legacyDuplicatedCalls: number;
    stage2DuplicatedCalls: number;
    legacyInsufficientRouteFrequency: {
      count: number;
      total: number;
      ratio: number;
    };
    stage2InsufficientRouteFrequency: {
      count: number;
      total: number;
      ratio: number;
    };
    deterministicStage2Output: boolean;
  };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function uniqueCandidates(
  values: readonly ControlledCandidateFixture[],
): ControlledCandidateFixture[] {
  const unique = new Map<string, ControlledCandidateFixture>();
  for (const value of values) {
    if (!unique.has(value.contentId)) unique.set(value.contentId, value);
  }
  return [...unique.values()];
}

function acceptedByScenario(
  value: ControlledCandidateFixture,
  scenario: ControlledComparisonScenario,
): boolean {
  return (
    value.providerVisibility === "exposed" &&
    Number.isFinite(value.coordinates.latitude) &&
    Number.isFinite(value.coordinates.longitude) &&
    scenario.selectedCategories.includes(value.category) &&
    (value.category !== "shopping" || scenario.includeShopping)
  );
}

function incrementReasonCounts(
  target: Record<string, number>,
  reasons: readonly string[],
): void {
  for (const reason of reasons) target[reason] = (target[reason] ?? 0) + 1;
}

function detailCallTotal(value: ControlledComparisonArmResult): number {
  return Object.values(value.detailCallsByOperation).reduce(
    (total, count) => total + count,
    0,
  );
}

function sortedCategories(
  values: readonly ControlledCandidateFixture[],
): ControlledCategory[] {
  return [...new Set(values.map(({ category }) => category))].sort(compareText);
}

/**
 * Models the actual pre-Stage-2 fixed-12 role/category-aware truncation for a
 * controlled comparison. Older audit prose called this nearest-12 because
 * proximity ordered candidates inside each role group. The report uses the
 * precise current baseline name instead of repeating that shorthand.
 */
export function evaluateControlledLegacyFixedTwelve(
  scenario: ControlledComparisonScenario,
  candidates: readonly ControlledCandidateFixture[] =
    CONTROLLED_CANDIDATE_FIXTURES,
): ControlledComparisonArmResult {
  const unique = uniqueCandidates(candidates);
  const accepted = unique.filter((value) => acceptedByScenario(value, scenario));
  const groups = new Map<ControlledCategory, ControlledCandidateFixture[]>();
  for (const value of accepted) {
    const group = groups.get(value.category) ?? [];
    group.push(value);
    groups.set(value.category, group);
  }
  for (const group of groups.values()) {
    group.sort(
      (left, right) =>
        haversineKm(scenario.start, left.coordinates) -
          haversineKm(scenario.start, right.coordinates) ||
        compareText(left.contentId, right.contentId),
    );
  }
  const groupKeys = [...groups.keys()].sort(compareText);
  const shortlist: ControlledCandidateFixture[] = [];
  let round = 0;
  while (shortlist.length < 12) {
    let added = false;
    for (const key of groupKeys) {
      const value = groups.get(key)?.[round];
      if (!value) continue;
      shortlist.push(value);
      added = true;
      if (shortlist.length >= 12) break;
    }
    if (!added) break;
    round += 1;
  }
  const excludedByReason: Record<string, number> = {};
  const eligible = shortlist.filter((value) => {
    if (value.detailFailure) {
      incrementReasonCounts(excludedByReason, ["detail_provider_unavailable"]);
      return false;
    }
    if (value.scheduleCompatibility === "conflict") {
      incrementReasonCounts(excludedByReason, ["operating_time_conflict"]);
      return false;
    }
    if (!value.strictEligible) {
      incrementReasonCounts(excludedByReason, value.eligibilityReasonCodes);
      return false;
    }
    return true;
  });
  const selectedCategories = new Set(shortlist.map(({ category }) => category));
  const catalogOperationCalls = selectedCategories.size * 2;
  const details = shortlist.length;

  return {
    implementation: "pre_stage2_fixed_12_role_aware",
    initialCatalogCount: unique.length,
    lightweightAcceptedCount: accepted.length,
    stageACount: shortlist.length,
    stageBCount: shortlist.length,
    detailedEvaluationCount: details,
    detailedBatchCount: details > 0 ? 1 : 0,
    eligibleContentIds: eligible.map(({ contentId }) => contentId),
    finalEligibleContentIds: eligible
      .slice()
      .sort(
        (left, right) =>
          right.utilityScore - left.utilityScore ||
          compareText(left.contentId, right.contentId),
      )
      .map(({ contentId }) => contentId),
    representedCategories: sortedCategories(eligible),
    providerCalls: catalogOperationCalls + details * 3,
    // The composite detail path reuses each category's already-loaded exposed
    // visibility page. This is a modeled cache hit, not a live measurement.
    cacheHits: details,
    detailCallsByOperation: {
      detailCommon2: details,
      detailIntro2: details,
      detailPetTour2: details,
    },
    duplicatedDetailCalls: 0,
    excludedByReason,
    insufficientEligiblePlaces: eligible.length < scenario.minStops,
    requiredMinimum: scenario.minStops,
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

export function canonicalComparisonJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label.toUpperCase()}_MUST_BE_A_NON_NEGATIVE_INTEGER`);
  }
}

export function assertStage2ControlledResult(
  result: ControlledComparisonArmResult,
): void {
  if (result.implementation !== "candidate_pipeline_v1") {
    throw new Error("CONTROLLED_STAGE2_IMPLEMENTATION_VERSION_MISMATCH");
  }
  const counts: Array<[string, number]> = [
    ["initial_catalog_count", result.initialCatalogCount],
    ["lightweight_accepted_count", result.lightweightAcceptedCount],
    ["stage_a_count", result.stageACount],
    ["stage_b_count", result.stageBCount],
    ["detailed_evaluation_count", result.detailedEvaluationCount],
    ["detailed_batch_count", result.detailedBatchCount],
    ["provider_calls", result.providerCalls],
    ["cache_hits", result.cacheHits],
    ["duplicated_detail_calls", result.duplicatedDetailCalls],
  ];
  for (const [label, value] of counts) assertNonNegativeInteger(value, label);
  if (result.stageACount > CANDIDATE_PIPELINE_V1_CONFIG.stageALimit) throw new Error("CONTROLLED_STAGE_A_LIMIT_EXCEEDED");
  if (result.stageBCount > CANDIDATE_PIPELINE_V1_CONFIG.stageBLimit) throw new Error("CONTROLLED_STAGE_B_LIMIT_EXCEEDED");
  if (result.detailedEvaluationCount > CANDIDATE_PIPELINE_V1_CONFIG.maxDetailedEvaluations) {
    throw new Error("CONTROLLED_DETAIL_LIMIT_EXCEEDED");
  }
  if (result.finalEligibleContentIds.length > CANDIDATE_PIPELINE_V1_CONFIG.finalEligibleLimit) {
    throw new Error("CONTROLLED_FINAL_ELIGIBLE_LIMIT_EXCEEDED");
  }
  if (new Set(result.eligibleContentIds).size !== result.eligibleContentIds.length) {
    throw new Error("CONTROLLED_ELIGIBLE_IDS_NOT_UNIQUE");
  }
  if (
    new Set(result.finalEligibleContentIds).size !==
    result.finalEligibleContentIds.length
  ) {
    throw new Error("CONTROLLED_FINAL_ELIGIBLE_IDS_NOT_UNIQUE");
  }
  for (const count of Object.values(result.detailCallsByOperation)) {
    assertNonNegativeInteger(count, "detail_operation_count");
  }
}

function frequency(count: number, total: number) {
  return {
    count,
    total,
    ratio: total === 0 ? 0 : Math.round((count / total) * 1_000) / 1_000,
  };
}

export async function createControlledComparisonReport(
  runStage2: ControlledStage2Runner,
  options: {
    scenarios?: readonly ControlledComparisonScenario[];
    candidates?: readonly ControlledCandidateFixture[];
  } = {},
): Promise<ControlledComparisonReport> {
  const scenarios = options.scenarios ?? CONTROLLED_COMPARISON_SCENARIOS;
  const candidates = options.candidates ?? CONTROLLED_CANDIDATE_FIXTURES;
  const rows: ControlledScenarioComparison[] = [];

  for (const scenario of scenarios) {
    const legacy = evaluateControlledLegacyFixedTwelve(scenario, candidates);
    const stage2 = await runStage2({ scenario, candidates });
    const repeated = await runStage2({ scenario, candidates });
    assertStage2ControlledResult(stage2);
    assertStage2ControlledResult(repeated);
    const deterministicStage2Output =
      canonicalComparisonJson(stage2) === canonicalComparisonJson(repeated);
    if (!deterministicStage2Output) {
      throw new Error("CONTROLLED_STAGE2_OUTPUT_NOT_DETERMINISTIC");
    }
    rows.push({
      scenario,
      legacy,
      stage2,
      eligibleDiscoveryDelta:
        stage2.eligibleContentIds.length - legacy.eligibleContentIds.length,
      categoryCoverageDelta:
        stage2.representedCategories.length - legacy.representedCategories.length,
      providerCallDelta: stage2.providerCalls - legacy.providerCalls,
      detailCallDelta: detailCallTotal(stage2) - detailCallTotal(legacy),
      deterministicStage2Output,
    });
  }

  const sum = (
    selector: (row: ControlledScenarioComparison) => number,
  ): number => rows.reduce((total, row) => total + selector(row), 0);
  const legacyInsufficient = rows.filter(
    ({ legacy }) => legacy.insufficientEligiblePlaces,
  ).length;
  const stage2Insufficient = rows.filter(
    ({ stage2 }) => stage2.insufficientEligiblePlaces,
  ).length;
  const legacyEligibleDiscovered = sum(
    ({ legacy }) => legacy.eligibleContentIds.length,
  );
  const stage2EligibleDiscovered = sum(
    ({ stage2 }) => stage2.eligibleContentIds.length,
  );
  const legacyCategoryCoverage = sum(
    ({ legacy }) => legacy.representedCategories.length,
  );
  const stage2CategoryCoverage = sum(
    ({ stage2 }) => stage2.representedCategories.length,
  );
  const legacyProviderCalls = sum(({ legacy }) => legacy.providerCalls);
  const stage2ProviderCalls = sum(({ stage2 }) => stage2.providerCalls);
  const legacyDetailCalls = sum(({ legacy }) => detailCallTotal(legacy));
  const stage2DetailCalls = sum(({ stage2 }) => detailCallTotal(stage2));

  return {
    version: CONTROLLED_COMPARISON_VERSION,
    fixtureVersion: CONTROLLED_FIXTURE_VERSION,
    scenarioCount: rows.length,
    scenarios: rows,
    summary: {
      legacyEligibleDiscovered,
      stage2EligibleDiscovered,
      eligibleDiscoveryDelta:
        stage2EligibleDiscovered - legacyEligibleDiscovered,
      legacyCategoryCoverage,
      stage2CategoryCoverage,
      categoryCoverageDelta: stage2CategoryCoverage - legacyCategoryCoverage,
      legacyProviderCalls,
      stage2ProviderCalls,
      providerCallDelta: stage2ProviderCalls - legacyProviderCalls,
      legacyDetailCalls,
      stage2DetailCalls,
      detailCallDelta: stage2DetailCalls - legacyDetailCalls,
      legacyDuplicatedCalls: sum(
        ({ legacy }) => legacy.duplicatedDetailCalls,
      ),
      stage2DuplicatedCalls: sum(
        ({ stage2 }) => stage2.duplicatedDetailCalls,
      ),
      legacyInsufficientRouteFrequency: frequency(
        legacyInsufficient,
        rows.length,
      ),
      stage2InsufficientRouteFrequency: frequency(
        stage2Insufficient,
        rows.length,
      ),
      deterministicStage2Output: rows.every(
        ({ deterministicStage2Output }) => deterministicStage2Output,
      ),
    },
  };
}

function markdownCell(value: unknown): string {
  return String(value).replace(/\|/gu, "\\|").replace(/[\r\n]+/gu, " ");
}

export function controlledComparisonMarkdown(
  report: ControlledComparisonReport,
): string {
  const lines = [
    "# Candidate pipeline V1 controlled comparison",
    "",
    `- Comparison version: \`${report.version}\``,
    `- Fixture version: \`${report.fixtureVersion}\``,
    `- Scenarios: ${report.scenarioCount}`,
    "- Provider counts are deterministic fixture-model counts, not live API measurements.",
    "- This comparison evaluates candidate discovery only; it does not compare route ordering or route quality.",
    "",
    "| scenario | arm | Stage A | Stage B | detailed | batches | eligible | categories | provider calls | detail calls | duplicates | insufficient |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ];
  for (const row of report.scenarios) {
    for (const arm of [row.legacy, row.stage2]) {
      lines.push(
        `| ${markdownCell(row.scenario.id)} | ${markdownCell(arm.implementation)} | ${arm.stageACount} | ${arm.stageBCount} | ${arm.detailedEvaluationCount} | ${arm.detailedBatchCount} | ${arm.eligibleContentIds.length} | ${arm.representedCategories.length} | ${arm.providerCalls} | ${detailCallTotal(arm)} | ${arm.duplicatedDetailCalls} | ${arm.insufficientEligiblePlaces ? "yes" : "no"} |`,
      );
    }
  }
  lines.push(
    "",
    "## Summary",
    "",
    `- Eligible discoveries: ${report.summary.legacyEligibleDiscovered} -> ${report.summary.stage2EligibleDiscovered} (${report.summary.eligibleDiscoveryDelta >= 0 ? "+" : ""}${report.summary.eligibleDiscoveryDelta})`,
    `- Category coverage: ${report.summary.legacyCategoryCoverage} -> ${report.summary.stage2CategoryCoverage} (${report.summary.categoryCoverageDelta >= 0 ? "+" : ""}${report.summary.categoryCoverageDelta})`,
    `- Provider calls: ${report.summary.legacyProviderCalls} -> ${report.summary.stage2ProviderCalls} (${report.summary.providerCallDelta >= 0 ? "+" : ""}${report.summary.providerCallDelta})`,
    `- Detail calls: ${report.summary.legacyDetailCalls} -> ${report.summary.stage2DetailCalls} (${report.summary.detailCallDelta >= 0 ? "+" : ""}${report.summary.detailCallDelta})`,
    `- Duplicated detail calls: ${report.summary.legacyDuplicatedCalls} -> ${report.summary.stage2DuplicatedCalls}`,
    `- Insufficient-route frequency: ${report.summary.legacyInsufficientRouteFrequency.count}/${report.summary.legacyInsufficientRouteFrequency.total} -> ${report.summary.stage2InsufficientRouteFrequency.count}/${report.summary.stage2InsufficientRouteFrequency.total}`,
    `- Deterministic Stage 2 output: ${report.summary.deterministicStage2Output ? "yes" : "no"}`,
    "",
  );
  return `${lines.join("\n")}\n`;
}
