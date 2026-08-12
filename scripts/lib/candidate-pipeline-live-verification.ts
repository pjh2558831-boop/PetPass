import {
  stringifySanitizedArtifact,
  sanitizeDiagnosticText,
} from "@/scripts/lib/tour-contract-audit";

export const LIVE_CANDIDATE_PIPELINE_OPT_IN_ENV =
  "RUN_LIVE_CANDIDATE_PIPELINE_V1" as const;
export const LIVE_CANDIDATE_PIPELINE_REPORT_VERSION =
  "candidate-pipeline-v1-live-verification-gate" as const;

export const STAGE1_LIVE_ELIGIBLE_CONTENT_IDS = [
  "2504464",
  "2672393",
  "3426656",
  "3112126",
  "2699563",
  "3350880",
  "3438936",
] as const;

export type LiveVerificationPhase = "cold" | "warm";
export type LiveScenarioId =
  | "relaxed_day_trip"
  | "balanced_day_trip"
  | "packed_day_trip"
  | "overnight";

export interface LiveOperationAccounting {
  physicalCalls: number;
  logicalOperations: number;
  cacheHits: number;
  failures: number;
}

export interface LiveProviderAccounting {
  physicalProviderCalls: number;
  logicalProviderOperations: number;
  cacheHits: number;
  retries: number;
  timeouts: number;
  providerFailures: number;
  duplicateDetailOperations: number;
  callsByOperation: Record<string, LiveOperationAccounting>;
}

export interface LiveKnownSampleProgress {
  contentId: string;
  presentInInitialCatalog: boolean;
  enteredStageA: boolean;
  enteredStageB: boolean;
  receivedDetailedEvaluation: boolean;
  passedAutomaticEligibility: boolean;
  finalEligiblePool: boolean;
  removalReason: string | null;
}

export interface LiveFinalCandidateVerification {
  contentId: string;
  category: string;
  sourceIsTourismService2: boolean;
  visibilityIsFreshExposed: boolean;
  coordinatesValidAndInScope: boolean;
  meaningfulPetEvidence: boolean;
  phase3Verdict: string;
  phase3EligibleState: boolean;
  mandatoryConditionsSatisfied: boolean;
  licensingExplicitlyClosed: boolean;
  confirmedScheduleConflict: boolean;
  categoryRequested: boolean;
  shoppingExplicitlySelected: boolean;
  kakaoOrDemoSource: boolean;
  utility: {
    version: string;
    total: number;
    componentsWithinRange: boolean;
  };
  popularity: {
    version: string;
    score: number;
    status: string;
    neutralColdStart: boolean;
  };
}

export interface LiveScenarioDiagnostics {
  initialCatalogCount: number;
  exposedCount: number;
  coordinateValidCount: number;
  categoryAcceptedCount: number;
  stageACount: number;
  stageBCount: number;
  detailedEvaluationCount: number;
  detailedBatchCount: number;
  eligibleCount: number;
  finalEligibleCount: number;
  categoryDistribution: Record<string, number>;
  excludedByReason: Record<string, number>;
  warningsByReason: Record<string, number>;
}

export interface LiveCandidateScenarioExecution {
  id: LiveScenarioId;
  label: string;
  phase: LiveVerificationPhase;
  status: string;
  durationMs: number;
  diagnostics: LiveScenarioDiagnostics;
  accounting: LiveProviderAccounting;
  eligibleContentIds: string[];
  knownSamples: LiveKnownSampleProgress[];
  finalCandidates: LiveFinalCandidateVerification[];
  canonicalResult: string;
}

export interface LiveCandidatePipelineExecution {
  runAsOf: string;
  bounds: {
    requestCap: number;
    concurrency: number;
    maxObservedConcurrency: number;
    timeoutMs: number;
    retryCount: number;
  };
  catalogAccounting: LiveProviderAccounting;
  coldScenarios: LiveCandidateScenarioExecution[];
  warmScenarios: LiveCandidateScenarioExecution[];
  totalPhysicalProviderCalls: number;
  totalDurationMs: number;
}

export interface CandidatePipelineLiveVerificationReport
  extends LiveCandidatePipelineExecution {
  version: typeof LIVE_CANDIDATE_PIPELINE_REPORT_VERSION;
  scope: "busan";
  expectedSampleIds: string[];
  naturallyRediscoveredSampleIds: string[];
  deterministicWarmReplay: boolean;
  coldPhysicalProviderCalls: number;
  warmPhysicalProviderCalls: number;
  requestReduction: number;
  gateChecks: {
    atLeastOneScenarioCompletedWithoutProviderFailure: boolean;
    atLeastThreeEligibleInOneScenario: boolean;
    enoughForRelaxedOrBalancedItinerary: boolean;
    atLeastTwoUsefulCategories: boolean;
    requestCapNotExceeded: boolean;
    concurrencyBoundRespected: boolean;
    noDuplicateDetailOperations: boolean;
    stageLimitsRespected: boolean;
    adaptiveBackfillObserved: boolean;
    noStrictBoundaryLeakage: boolean;
    popularityRemainedNeutral: boolean;
  };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function assertCandidatePipelineLiveVerificationAllowed(
  environment: Readonly<Record<string, string | undefined>>,
  localEnvironmentFileExists: boolean,
): void {
  if (Object.prototype.hasOwnProperty.call(environment, "CI")) {
    throw new Error("LIVE_CANDIDATE_PIPELINE_DISABLED_IN_CI");
  }
  if (environment[LIVE_CANDIDATE_PIPELINE_OPT_IN_ENV] !== "1") {
    throw new Error(
      `LIVE_CANDIDATE_PIPELINE_REQUIRES_${LIVE_CANDIDATE_PIPELINE_OPT_IN_ENV}=1`,
    );
  }
  if (!localEnvironmentFileExists) {
    throw new Error("LIVE_CANDIDATE_PIPELINE_REQUIRES_IGNORED_ENV_LOCAL");
  }
}

function boundaryPassed(candidate: LiveFinalCandidateVerification): boolean {
  return (
    candidate.sourceIsTourismService2 &&
    candidate.visibilityIsFreshExposed &&
    candidate.coordinatesValidAndInScope &&
    candidate.meaningfulPetEvidence &&
    candidate.phase3EligibleState &&
    candidate.mandatoryConditionsSatisfied &&
    !candidate.licensingExplicitlyClosed &&
    !candidate.confirmedScheduleConflict &&
    candidate.categoryRequested &&
    candidate.shoppingExplicitlySelected &&
    !candidate.kakaoOrDemoSource &&
    candidate.utility.version === "place-utility-v1" &&
    candidate.utility.total >= 0 &&
    candidate.utility.total <= 1_000 &&
    candidate.utility.componentsWithinRange
  );
}

export function createCandidatePipelineLiveVerificationReport(
  execution: LiveCandidatePipelineExecution,
  expectedSampleIds: readonly string[] = STAGE1_LIVE_ELIGIBLE_CONTENT_IDS,
): CandidatePipelineLiveVerificationReport {
  const cold = execution.coldScenarios;
  const warmById = new Map(execution.warmScenarios.map((value) => [value.id, value]));
  const expected = [...new Set(expectedSampleIds)].sort(compareText);
  const naturallyRediscoveredSampleIds = expected.filter((contentId) =>
    cold.some((scenario) =>
      scenario.knownSamples.some(
        (sample) => sample.contentId === contentId && sample.finalEligiblePool,
      ),
    ),
  );
  const coldPhysicalProviderCalls =
    execution.catalogAccounting.physicalProviderCalls +
    cold.reduce(
      (sum, scenario) => sum + scenario.accounting.physicalProviderCalls,
      0,
    );
  const warmPhysicalProviderCalls = execution.warmScenarios.reduce(
    (sum, scenario) => sum + scenario.accounting.physicalProviderCalls,
    0,
  );
  const deterministicWarmReplay = cold.every(
    (scenario) => warmById.get(scenario.id)?.canonicalResult === scenario.canonicalResult,
  );
  const allScenarios = [...cold, ...execution.warmScenarios];
  const allFinal = allScenarios.flatMap(({ finalCandidates }) => finalCandidates);
  const maxCategories = Math.max(
    0,
    ...cold.map(
      ({ diagnostics }) => Object.keys(diagnostics.categoryDistribution).length,
    ),
  );
  const requestReduction = coldPhysicalProviderCalls === 0
    ? 0
    : 1 - warmPhysicalProviderCalls / coldPhysicalProviderCalls;

  return {
    version: LIVE_CANDIDATE_PIPELINE_REPORT_VERSION,
    scope: "busan",
    expectedSampleIds: expected,
    naturallyRediscoveredSampleIds,
    deterministicWarmReplay,
    coldPhysicalProviderCalls,
    warmPhysicalProviderCalls,
    requestReduction,
    ...execution,
    gateChecks: {
      atLeastOneScenarioCompletedWithoutProviderFailure: cold.some(
        ({ status, accounting }) =>
          status !== "provider_unavailable" && accounting.providerFailures === 0,
      ),
      atLeastThreeEligibleInOneScenario: cold.some(
        ({ diagnostics }) => diagnostics.finalEligibleCount >= 3,
      ),
      enoughForRelaxedOrBalancedItinerary: cold.some(
        ({ id, status }) =>
          (id === "relaxed_day_trip" || id === "balanced_day_trip") &&
          status === "ready",
      ),
      atLeastTwoUsefulCategories: maxCategories >= 2,
      requestCapNotExceeded:
        execution.totalPhysicalProviderCalls <= execution.bounds.requestCap,
      concurrencyBoundRespected:
        execution.bounds.maxObservedConcurrency <= execution.bounds.concurrency,
      noDuplicateDetailOperations: allScenarios.every(
        ({ accounting }) => accounting.duplicateDetailOperations === 0,
      ),
      stageLimitsRespected: allScenarios.every(
        ({ diagnostics }) =>
          diagnostics.stageACount <= 25 &&
          diagnostics.stageBCount <= 20 &&
          diagnostics.detailedEvaluationCount <= 20 &&
          diagnostics.finalEligibleCount <= 15 &&
          diagnostics.detailedBatchCount <= 4,
      ),
      adaptiveBackfillObserved: cold.some(
        ({ diagnostics }) =>
          diagnostics.detailedEvaluationCount > 15 &&
          diagnostics.detailedBatchCount === 4,
      ),
      noStrictBoundaryLeakage: allFinal.every(boundaryPassed),
      popularityRemainedNeutral: allFinal.every(
        ({ popularity }) => popularity.neutralColdStart,
      ),
    },
  };
}

export function stringifyCandidatePipelineLiveArtifact(
  report: CandidatePipelineLiveVerificationReport,
): string {
  return stringifySanitizedArtifact(report);
}

function markdownCell(value: unknown): string {
  return (sanitizeDiagnosticText(value, 240) ?? "-").replace(/\|/gu, "\\|");
}

function scenarioRows(
  scenarios: readonly LiveCandidateScenarioExecution[],
): string[] {
  return scenarios.map(
    (scenario) =>
      `| ${markdownCell(scenario.phase)} | ${markdownCell(scenario.id)} | ${scenario.diagnostics.initialCatalogCount} | ${scenario.diagnostics.stageACount} | ${scenario.diagnostics.stageBCount} | ${scenario.diagnostics.detailedEvaluationCount} | ${scenario.diagnostics.finalEligibleCount} | ${scenario.accounting.physicalProviderCalls} | ${scenario.accounting.cacheHits} | ${scenario.durationMs} |`,
  );
}

export function candidatePipelineLiveMarkdown(
  report: CandidatePipelineLiveVerificationReport,
): string {
  const coldSamples = report.coldScenarios.flatMap((scenario) =>
    scenario.knownSamples.map((sample) => ({ scenario: scenario.id, ...sample })),
  );
  const lines = [
    "# Candidate pipeline V1 bounded live verification gate",
    "",
    `- Version: \`${report.version}\``,
    `- Scope: ${report.scope}`,
    `- Run snapshot: ${markdownCell(report.runAsOf)}`,
    `- Physical provider calls: ${report.totalPhysicalProviderCalls}/${report.bounds.requestCap}`,
    `- Maximum provider concurrency: ${report.bounds.maxObservedConcurrency}/${report.bounds.concurrency}`,
    `- Cold/warm physical calls: ${report.coldPhysicalProviderCalls}/${report.warmPhysicalProviderCalls}`,
    `- Deterministic warm replay: ${report.deterministicWarmReplay ? "yes" : "no"}`,
    `- Stage 1 samples naturally rediscovered: ${report.naturallyRediscoveredSampleIds.length}/${report.expectedSampleIds.length}`,
    "",
    "## Scenario summary",
    "",
    "| phase | scenario | initial | Stage A | Stage B | detailed | final eligible | physical calls | cache hits | duration ms |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...scenarioRows(report.coldScenarios),
    ...scenarioRows(report.warmScenarios),
    "",
    "## Stage 1 sample progress (cold scenarios)",
    "",
    "| scenario | content ID | initial | A | B | detail | eligible | final | removal reason |",
    "|---|---|---|---|---|---|---|---|---|",
    ...coldSamples.map(
      (sample) =>
        `| ${markdownCell(sample.scenario)} | ${markdownCell(sample.contentId)} | ${sample.presentInInitialCatalog ? "yes" : "no"} | ${sample.enteredStageA ? "yes" : "no"} | ${sample.enteredStageB ? "yes" : "no"} | ${sample.receivedDetailedEvaluation ? "yes" : "no"} | ${sample.passedAutomaticEligibility ? "yes" : "no"} | ${sample.finalEligiblePool ? "yes" : "no"} | ${markdownCell(sample.removalReason)} |`,
    ),
    "",
    "## Gate checks",
    "",
    ...Object.entries(report.gateChecks).map(
      ([name, passed]) => `- ${markdownCell(name)}: ${passed ? "pass" : "fail"}`,
    ),
    "",
    "No raw provider payload, keyed URL, Authorization header, credential, or provider prose is stored in this artifact.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}
