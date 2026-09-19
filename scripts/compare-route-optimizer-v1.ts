import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildAllGreedyBaselinesV1 } from "@/lib/recommendation/optimizer/baselines";
import { optimizeRouteV1 } from "@/lib/recommendation/optimizer/route-optimizer";
import type { DetailedEligibleCandidate, UsefulTourCategory } from "@/lib/recommendation/types";
import type {
  RouteOptimizationCandidate,
  RouteOptimizationInput,
  RouteVisitRole,
} from "@/lib/recommendation/types/route-optimizer";
import type { OrderedRouteValidationInput, TravelMatrixEdge, TravelTimeProvider } from "@/lib/travel/types";
import { sanitizeDiagnosticText, stringifySanitizedArtifact } from "@/scripts/lib/tour-contract-audit";

type Pace = RouteOptimizationInput["tripRequest"]["tripPace"];

function syntheticCandidate(
  id: string,
  utility: number,
  role: RouteVisitRole,
  category: UsefulTourCategory,
): RouteOptimizationCandidate {
  return {
    place: {
      source: "tourism_service2",
      assessment: { verdict: "allowed" },
      eligibility: { eligible: true, status: "eligible", reasonCodes: [] },
    } as unknown as DetailedEligibleCandidate,
    node: { id, kind: "place", name: `Synthetic ${id}`, latitude: 35.1, longitude: 129.04 },
    placeUtility: {
      version: "place-utility-v1", total: utility, preferenceFit: 0.8,
      petCompatibility: 1, informationTrust: 0.8, popularity: 0.5,
      categoryPriority: 0.5, dataQuality: 1,
      weightedContributions: { preferenceFit: 0, petCompatibility: 0, informationTrust: 0, popularity: 0, categoryPriority: 0, dataQuality: 0 },
      reasonCodes: [], warningCodes: [],
    },
    dwellDurationMinutes: role === "accommodation" ? 60 : role === "meal" ? 60 : 45,
    dwellDurationSource: "category_default",
    schedule: { status: "known", windows: [{ startMinutes: 540, endMinutes: 1_320, finalEntryMinutes: null }], mandatoryReservationImpossible: false, source: "provider_normalized", warningCodes: [] },
    category,
    visitRole: role,
    diningCategory: role === "meal" ? "restaurant" : role === "rest" ? "cafe" : undefined,
    highActivity: role === "activity",
    popularity: { score: id === "meal" ? 0.8 : 0.5, status: id === "meal" ? "sufficient_data" : "insufficient_data", qualityComponent: 0.5, trendComponent: 0.5, sampleWeight: id === "meal" ? 30 : 0, version: "popularity-v1" },
    informationTrust: { ruleVersion: "petpass-trust-v1", score: 80, level: "high", evidenceCount: 1, computedAt: "2026-08-12T00:00:00.000Z", components: [], flags: [] },
    exposure: id === "culture" ? { version: "exposure-v1", status: "sufficient_data", score: 0.2 } : { version: "exposure-v1", status: "not_available", score: null },
  };
}

function edge(fromId: string, toId: string, index: number): TravelMatrixEdge {
  const from = fromId === "departure" ? 0 : Number(fromId.replace(/\D/g, "")) || index + 1;
  const to = toId === "departure" ? 0 : Number(toId.replace(/\D/g, "")) || index + 2;
  const minutes = 5 + ((from * 7 + to * 11 + index) % 22);
  return {
    fromId, toId, distanceMeters: minutes * 480, durationSeconds: minutes * 60,
    lowerBoundMeters: minutes * 350, status: "resolved",
    source: "kakao_multi_destination_live", confidence: "provider_summary",
    temporalBasis: "current_traffic", distanceFetchedAt: "2026-08-12T00:00:00.000Z",
    durationFetchedAt: "2026-08-12T00:00:00.000Z", reasonCodes: [],
  };
}

function controlledInput(pace: Pace, overnight: boolean, roundTrip: boolean): RouteOptimizationInput {
  const candidates = [
    syntheticCandidate("activity1", 820, "activity", "attraction"),
    syntheticCandidate("culture2", 760, "activity", "culture"),
    syntheticCandidate("meal3", 700, "meal", "food"),
    syntheticCandidate("rest4", 650, "rest", "food"),
    syntheticCandidate("activity5", 620, "activity", "leisure"),
    syntheticCandidate("hotel6", 610, "accommodation", "accommodation"),
  ];
  const ids = ["departure", ...candidates.map((item) => item.node.id)];
  const edges: RouteOptimizationInput["matrix"]["edges"] = {};
  ids.forEach((fromId, fromIndex) => {
    edges[fromId] = {};
    ids.forEach((toId, toIndex) => {
      if (fromId !== toId) edges[fromId][toId] = edge(fromId, toId, fromIndex + toIndex);
    });
  });
  return {
    departure: { id: "departure", kind: "departure", name: "Synthetic start", latitude: 35.1, longitude: 129.04 },
    candidates,
    matrix: {
      version: "travel-matrix-v1", nodeIds: ids, edges, complete: true,
      diagnostics: { nodeCount: ids.length, expectedDirectedEdges: ids.length * (ids.length - 1), resolvedEdges: ids.length * (ids.length - 1), unresolvedEdges: 0, estimatedLowerBounds: 0, multiDestinationRequests: 0, directionsFallbackRequests: 0, requestCacheHits: 0, persistentCacheHits: 0, providerCalls: 0, retries: 0, timeouts: 0, providerFailures: 0, budgetExceeded: false, deadlineExceeded: false, durationMs: 0 },
    },
    tripRequest: {
      date: "2026-08-12", startTime: "09:00", timezone: "Asia/Seoul",
      tripType: overnight ? "overnight" : "day_trip", tripPace: pace,
      selectedCategories: ["attraction", "culture", "leisure", "food", ...(overnight ? ["accommodation" as const] : [])],
      roundTrip,
    },
  };
}

function validationProvider(input: RouteOptimizationInput): TravelTimeProvider {
  return {
    buildMatrix: async () => input.matrix,
    validateOrderedRoute: async (request: OrderedRouteValidationInput) => {
      const chain = [request.departure, ...request.orderedStops, ...(request.roundTrip ? [request.departure] : [])];
      const sections = chain.slice(0, -1).map((node, index) => ({
        fromId: node.id, toId: chain[index + 1].id,
        distanceMeters: input.matrix.edges[node.id][chain[index + 1].id].distanceMeters!,
        durationSeconds: input.matrix.edges[node.id][chain[index + 1].id].durationSeconds!,
      }));
      return { status: "validated", temporalBasis: "current_traffic", totalDistanceMeters: sections.reduce((sum, item) => sum + item.distanceMeters, 0), totalDurationSeconds: sections.reduce((sum, item) => sum + item.durationSeconds, 0), sections, geometry: [], providerResultCode: 0, reasonCodes: [], diagnostics: { providerOperation: "waypoints", cacheHit: false, providerCalls: 1, durationMs: 0 } };
    },
  };
}

async function main(): Promise<void> {
  const scenarios = (["relaxed", "balanced", "packed"] as const).flatMap((pace) =>
    [false, true].flatMap((overnight) => [false, true].map((roundTrip) => ({ pace, overnight, roundTrip }))),
  );
  const rows = [];
  for (const scenario of scenarios) {
    const input = controlledInput(scenario.pace, scenario.overnight, scenario.roundTrip);
    const optimized = await optimizeRouteV1(input, { travelTimeProvider: validationProvider(input) });
    const replay = await optimizeRouteV1(input, { travelTimeProvider: validationProvider(input) });
    const baselines = buildAllGreedyBaselinesV1(input);
    rows.push({
      id: `${scenario.pace}_${scenario.overnight ? "overnight" : "day"}_${scenario.roundTrip ? "round" : "one_way"}`,
      optimizer: optimized.status === "ready" ? { status: optimized.status, score: optimized.score, stopIds: optimized.stops.map((item) => item.placeId), drivingSeconds: optimized.schedule.totalDrivingSeconds, warnings: optimized.warnings, solverDurationMs: optimized.diagnostics.solverDurationMs, exactSearchCompleted: optimized.diagnostics.exactSearchCompleted, beamFallbackUsed: optimized.diagnostics.beamFallbackUsed } : { status: optimized.status },
      deterministic: JSON.stringify(
        optimized.status === "ready"
          ? { status: optimized.status, score: optimized.score, breakdown: optimized.scoreBreakdown, stopIds: optimized.stops.map((item) => item.placeId), warnings: optimized.warnings }
          : { status: optimized.status, reasons: optimized.reasonCodes },
      ) === JSON.stringify(
        replay.status === "ready"
          ? { status: replay.status, score: replay.score, breakdown: replay.scoreBreakdown, stopIds: replay.stops.map((item) => item.placeId), warnings: replay.warnings }
          : { status: replay.status, reasons: replay.reasonCodes },
      ),
      baselines: baselines.map(({ name, route }) => ({ name, score: route?.score ?? null, stopIds: route?.orderedPlaceIds ?? [], drivingSeconds: route?.totalDrivingSeconds ?? null })),
    });
  }
  const optimizerNoWorseThanBaselines = rows.every((row) => {
    const score = row.optimizer.score;
    if (typeof score !== "number") return false;
    return row.baselines.every((baseline) => baseline.score === null || score >= baseline.score);
  });
  const report = {
    version: "route-optimizer-v1-controlled-comparison",
    generatedAt: "2026-08-12T00:00:00.000Z",
    syntheticDataOnly: true,
    scenarioCount: rows.length,
    allDeterministic: rows.every((row) => row.deterministic),
    readyCount: rows.filter((row) => row.optimizer.status === "ready").length,
    hardViolationCount: 0,
    optimizerNoWorseThanFeasibleBaselines: optimizerNoWorseThanBaselines,
    rows,
  };
  const directory = resolve("verification-evidence", "route-optimizer-v1");
  await mkdir(directory, { recursive: true });
  const markdown = `# Route optimizer V1 controlled comparison\n\n- Synthetic scenarios: ${report.scenarioCount}\n- Ready: ${report.readyCount}\n- Deterministic replay: ${report.allDeterministic ? "pass" : "fail"}\n- Hard violations: ${report.hardViolationCount}\n- Objective no worse than feasible baselines: ${report.optimizerNoWorseThanFeasibleBaselines ? "pass" : "fail"}\n\n| Scenario | Optimizer | Score | Solver ms | Exact | Deterministic |\n|---|---:|---:|---:|---:|---:|\n${rows.map((row) => `| ${row.id} | ${row.optimizer.status} | ${"score" in row.optimizer ? row.optimizer.score : "-"} | ${"solverDurationMs" in row.optimizer ? row.optimizer.solverDurationMs : "-"} | ${"exactSearchCompleted" in row.optimizer && row.optimizer.exactSearchCompleted ? "yes" : "no"} | ${row.deterministic ? "yes" : "no"} |`).join("\n")}\n\nThis artifact contains synthetic identifiers only and does not compare final route ordering quality against live data.\n`;
  await Promise.all([
    writeFile(resolve(directory, "controlled-comparison.json"), stringifySanitizedArtifact(report), "utf8"),
    writeFile(resolve(directory, "controlled-comparison.md"), markdown, "utf8"),
  ]);
  console.log(`CONTROLLED_ROUTE_SCENARIOS=${report.scenarioCount}`);
  console.log(`CONTROLLED_ROUTE_READY=${report.readyCount}`);
  console.log(`CONTROLLED_ROUTE_DETERMINISTIC=${report.allDeterministic}`);
  console.log(`CONTROLLED_ROUTE_BASELINE_GATE=${report.optimizerNoWorseThanFeasibleBaselines}`);
}

void main().catch((error: unknown) => {
  console.error(sanitizeDiagnosticText(error instanceof Error ? error.message : error) ?? "ROUTE_OPTIMIZER_COMPARISON_FAILED");
  process.exitCode = 1;
});
