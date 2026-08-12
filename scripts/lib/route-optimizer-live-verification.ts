import { sanitizeDiagnosticText, stringifySanitizedArtifact } from "@/scripts/lib/tour-contract-audit";

export const LIVE_ROUTE_OPTIMIZER_OPT_IN_ENV = "RUN_LIVE_ROUTE_OPTIMIZER_V1" as const;

export interface RouteOptimizerLiveReport {
  version: "route-optimizer-v1-live-verification";
  runAsOf: string;
  scope: "busan";
  stage2: { candidateCount: number; contentIds: string[]; categories: Record<string, number>; providerCalls: number };
  matrix: { nodeCount: number; resolvedEdges: number; expectedEdges: number; complete: boolean; providerCalls: number };
  solver: {
    status: string;
    stopIds: string[];
    score: number | null;
    totalDrivingSeconds: number | null;
    totalDistanceMeters: number | null;
    selectedCategoryCount: number;
    geometryPointCount: number;
    matrixTemporalBasis: string;
    finalValidationTemporalBasis: string;
    validationAttempts: number;
    validationFailures: number;
    exactSearchCompleted: boolean;
    beamFallbackUsed: boolean;
    deterministicReplay: boolean;
  };
  baselines: Array<{ name: string; score: number | null; stopIds: string[]; totalDrivingSeconds: number | null }>;
  bounds: { tourCalls: number; tourCap: number; kakaoCalls: number; kakaoCap: number; maxObservedConcurrency: number; concurrencyCap: number; timeoutMs: number };
  gateChecks: Record<string, boolean>;
}

export function assertRouteOptimizerLiveVerificationAllowed(
  environment: Readonly<Record<string, string | undefined>>,
  localEnvironmentFileExists: boolean,
): void {
  if (Object.prototype.hasOwnProperty.call(environment, "CI")) {
    throw new Error("LIVE_ROUTE_OPTIMIZER_DISABLED_IN_CI");
  }
  if (environment[LIVE_ROUTE_OPTIMIZER_OPT_IN_ENV] !== "1") {
    throw new Error(`LIVE_ROUTE_OPTIMIZER_REQUIRES_${LIVE_ROUTE_OPTIMIZER_OPT_IN_ENV}=1`);
  }
  if (!localEnvironmentFileExists) throw new Error("LIVE_ROUTE_OPTIMIZER_REQUIRES_IGNORED_ENV_LOCAL");
}

export function stringifyRouteOptimizerLiveArtifact(report: RouteOptimizerLiveReport): string {
  return stringifySanitizedArtifact(report);
}

function cell(value: unknown): string {
  return (sanitizeDiagnosticText(value, 120) ?? "-").replace(/\|/gu, "\\|");
}

export function routeOptimizerLiveMarkdown(report: RouteOptimizerLiveReport): string {
  return `${[
    "# Route optimizer V1 bounded live verification",
    "",
    `- Run: ${cell(report.runAsOf)}`,
    `- Natural Stage 2 candidates: ${report.stage2.candidateCount}`,
    `- Matrix: ${report.matrix.resolvedEdges}/${report.matrix.expectedEdges}`,
    `- Solver: ${cell(report.solver.status)}`,
    `- Stops: ${report.solver.stopIds.map(cell).join(", ") || "-"}`,
    `- Distance/duration: ${report.solver.totalDistanceMeters ?? "-"} m / ${report.solver.totalDrivingSeconds ?? "-"} s`,
    `- Provider calls (Tour/Kakao): ${report.bounds.tourCalls}/${report.bounds.kakaoCalls}`,
    "",
    "## Baselines",
    "",
    "| Baseline | Score | Stops | Driving seconds |",
    "|---|---:|---:|---:|",
    ...report.baselines.map((item) => `| ${cell(item.name)} | ${item.score ?? "-"} | ${item.stopIds.length} | ${item.totalDrivingSeconds ?? "-"} |`),
    "",
    "## Gate checks",
    "",
    ...Object.entries(report.gateChecks).map(([name, passed]) => `- ${cell(name)}: ${passed ? "pass" : "fail"}`),
    "",
    "No raw provider body, keyed URL, Authorization header, credential, place name, coordinate, or pet-policy prose is persisted.",
    "",
  ].join("\n")}\n`;
}
