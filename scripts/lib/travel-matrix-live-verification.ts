import {
  sanitizeDiagnosticText,
  stringifySanitizedArtifact,
} from "@/scripts/lib/tour-contract-audit";

export const LIVE_TRAVEL_MATRIX_OPT_IN_ENV =
  "RUN_LIVE_TRAVEL_MATRIX_V1" as const;

export interface TravelMatrixLiveExecution {
  version: "travel-matrix-v1-live-verification";
  runAsOf: string;
  scope: "busan";
  stage2Selection: {
    candidateCount: number;
    contentIds: string[];
    categories: Record<string, number>;
    tourProviderCalls: number;
    tourMaxObservedConcurrency: number;
    tourRequestCap: number;
  };
  kakaoBounds: {
    requestCap: number;
    providerCalls: number;
    concurrency: number;
    maxObservedConcurrency: number;
    timeoutMs: number;
  };
  coldMatrix: {
    nodeCount: number;
    expectedDirectedEdges: number;
    resolvedEdges: number;
    unresolvedEdges: number;
    batchCalls: number;
    fallbackCalls: number;
    providerCalls: number;
    cacheHits: number;
    complete: boolean;
  };
  warmMatrix: {
    providerCalls: number;
    persistentCacheHits: number;
    unresolvedEdges: number;
    complete: boolean;
  };
  asymmetricReversePairObserved: boolean;
  currentRoute: {
    status: string;
    sectionCount: number;
    geometryPointCount: number;
    providerCalls: number;
  };
  futureRoute: {
    status: string;
    temporalBasis: string;
    sectionCount: number;
    geometryPointCount: number;
    providerCalls: number;
  };
  providerIssues: {
    matrixFailures: number;
    matrixTimeouts: number;
    authorizationOrQuotaIssue: boolean;
  };
  gateChecks: {
    naturalStage2CandidatesUsed: boolean;
    asymmetricMatrixObserved: boolean;
    coldMatrixComplete: boolean;
    warmReplayCompleteWithoutProviderCalls: boolean;
    currentRouteValidated: boolean;
    futureRouteValidated: boolean;
    geometryExtracted: boolean;
    requestCapRespected: boolean;
    concurrencyRespected: boolean;
    noAuthorizationOrQuotaIssue: boolean;
  };
}

export function assertTravelMatrixLiveVerificationAllowed(
  environment: Readonly<Record<string, string | undefined>>,
  localEnvironmentFileExists: boolean,
): void {
  if (Object.prototype.hasOwnProperty.call(environment, "CI")) {
    throw new Error("LIVE_TRAVEL_MATRIX_DISABLED_IN_CI");
  }
  if (environment[LIVE_TRAVEL_MATRIX_OPT_IN_ENV] !== "1") {
    throw new Error(
      `LIVE_TRAVEL_MATRIX_REQUIRES_${LIVE_TRAVEL_MATRIX_OPT_IN_ENV}=1`,
    );
  }
  if (!localEnvironmentFileExists) {
    throw new Error("LIVE_TRAVEL_MATRIX_REQUIRES_IGNORED_ENV_LOCAL");
  }
}

export function stringifyTravelMatrixLiveArtifact(
  report: TravelMatrixLiveExecution,
): string {
  return stringifySanitizedArtifact(report);
}

function cell(value: unknown): string {
  return (sanitizeDiagnosticText(value, 120) ?? "-").replace(/\|/gu, "\\|");
}

export function travelMatrixLiveMarkdown(
  report: TravelMatrixLiveExecution,
): string {
  return `${[
    "# Travel Matrix V1 bounded live verification",
    "",
    `- Run: ${cell(report.runAsOf)}`,
    `- Natural Stage 2 candidates: ${report.stage2Selection.candidateCount}`,
    `- Tour calls: ${report.stage2Selection.tourProviderCalls}/${report.stage2Selection.tourRequestCap}`,
    `- Kakao concurrency: ${report.kakaoBounds.maxObservedConcurrency}/${report.kakaoBounds.concurrency}`,
    `- Cold matrix: ${report.coldMatrix.resolvedEdges}/${report.coldMatrix.expectedDirectedEdges} resolved`,
    `- Warm provider calls/cache hits: ${report.warmMatrix.providerCalls}/${report.warmMatrix.persistentCacheHits}`,
    `- Current validation/geometry: ${cell(report.currentRoute.status)}/${report.currentRoute.geometryPointCount}`,
    `- Future validation/geometry: ${cell(report.futureRoute.status)}/${report.futureRoute.geometryPointCount}`,
    "",
    "## Gate checks",
    "",
    ...Object.entries(report.gateChecks).map(
      ([name, passed]) => `- ${cell(name)}: ${passed ? "pass" : "fail"}`,
    ),
    "",
    "No raw provider body, keyed URL, Authorization header, credential, place name, or coordinate is persisted.",
    "",
  ].join("\n")}\n`;
}
