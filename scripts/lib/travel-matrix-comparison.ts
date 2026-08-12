import "server-only";

import {
  CONTROLLED_TRAVEL_MATRIX_AS_OF,
  CONTROLLED_TRAVEL_MATRIX_SCENARIOS,
} from "@/fixtures/travel-matrix-v1-controlled";
import type {
  KakaoDetailedRoute,
  KakaoMultiDestinationInput,
} from "@/lib/kakao/directions";
import {
  KakaoTravelTimeProvider,
  type KakaoTravelTimeClient,
} from "@/lib/kakao/travel-time-provider";
import { MemoryTravelTimeCache } from "@/lib/travel/cache";

interface ComparisonScenarioResult {
  id: string;
  nodeCount: number;
  expectedDirectedEdges: number;
  naivePairwiseCalls: number;
  cold: {
    resolvedEdges: number;
    batchCalls: number;
    fallbackCalls: number;
    providerCalls: number;
    requestCacheHits: number;
    persistentCacheHits: number;
    unresolvedEdges: number;
    complete: boolean;
    durationMs: number;
  };
  warm: {
    providerCalls: number;
    persistentCacheHits: number;
    unresolvedEdges: number;
    complete: boolean;
    durationMs: number;
  };
}

export interface TravelMatrixComparisonReport {
  version: "travel-matrix-v1-controlled-comparison";
  asOf: string;
  deterministic: boolean;
  allColdStrategiesBeatNaivePairwise: boolean;
  allWarmReplaysReduceProviderCalls: boolean;
  scenarios: ComparisonScenarioResult[];
}

function roadValue(origin: number, destination: number): number {
  return Math.max(
    1,
    Math.round(1_000 + (origin - 129) * 100_000 + (destination - 129) * 10_000),
  );
}

class ControlledClient implements KakaoTravelTimeClient {
  constructor(private readonly missing: Set<string>) {}

  async multiDestination(input: KakaoMultiDestinationInput) {
    return input.destinations
      .filter((destination) => !this.missing.has(destination.key))
      .map((destination) => {
        const distance = roadValue(input.origin.longitude, destination.longitude);
        return {
          key: destination.key,
          resultCode: 0,
          distanceMeters: distance,
          durationSeconds: distance + 300,
          reasonCodes: [],
        };
      });
  }

  async pairDirections(input: {
    origin: { longitude: number };
    destination: { longitude: number };
  }): Promise<KakaoDetailedRoute> {
    const distance = roadValue(input.origin.longitude, input.destination.longitude);
    return {
      resultCode: 0,
      totalDistanceMeters: distance,
      totalDurationSeconds: distance + 300,
      coordinates: [],
      sections: [{ distanceMeters: distance, durationSeconds: distance + 300 }],
    };
  }

  async waypointDirections(): Promise<KakaoDetailedRoute> {
    throw new Error("Controlled matrix comparison does not validate ordered routes.");
  }

  async futureDirections(): Promise<KakaoDetailedRoute> {
    throw new Error("Controlled matrix comparison does not validate ordered routes.");
  }
}

function stableClock() {
  let tick = 0;
  return () => tick++;
}

async function runOnce(): Promise<ComparisonScenarioResult[]> {
  const asOf = new Date(CONTROLLED_TRAVEL_MATRIX_AS_OF);
  const results: ComparisonScenarioResult[] = [];
  for (const scenario of CONTROLLED_TRAVEL_MATRIX_SCENARIOS) {
    const cache = new MemoryTravelTimeCache();
    const missing = new Set(scenario.missingMultiDestinationIds);
    const cold = await new KakaoTravelTimeProvider({
      client: new ControlledClient(missing),
      cache,
      now: () => asOf,
      monotonicNow: stableClock(),
    }).buildMatrix(scenario.input);
    const warm = await new KakaoTravelTimeProvider({
      client: new ControlledClient(missing),
      cache,
      now: () => asOf,
      monotonicNow: stableClock(),
    }).buildMatrix(scenario.input);
    results.push({
      id: scenario.id,
      nodeCount: cold.diagnostics.nodeCount,
      expectedDirectedEdges: cold.diagnostics.expectedDirectedEdges,
      naivePairwiseCalls: cold.diagnostics.expectedDirectedEdges,
      cold: {
        resolvedEdges: cold.diagnostics.resolvedEdges,
        batchCalls: cold.diagnostics.multiDestinationRequests,
        fallbackCalls: cold.diagnostics.directionsFallbackRequests,
        providerCalls: cold.diagnostics.providerCalls,
        requestCacheHits: cold.diagnostics.requestCacheHits,
        persistentCacheHits: cold.diagnostics.persistentCacheHits,
        unresolvedEdges: cold.diagnostics.unresolvedEdges,
        complete: cold.complete,
        durationMs: cold.diagnostics.durationMs,
      },
      warm: {
        providerCalls: warm.diagnostics.providerCalls,
        persistentCacheHits: warm.diagnostics.persistentCacheHits,
        unresolvedEdges: warm.diagnostics.unresolvedEdges,
        complete: warm.complete,
        durationMs: warm.diagnostics.durationMs,
      },
    });
  }
  return results;
}

export async function runControlledTravelMatrixComparison(): Promise<TravelMatrixComparisonReport> {
  const first = await runOnce();
  const second = await runOnce();
  return {
    version: "travel-matrix-v1-controlled-comparison",
    asOf: CONTROLLED_TRAVEL_MATRIX_AS_OF,
    deterministic: JSON.stringify(first) === JSON.stringify(second),
    allColdStrategiesBeatNaivePairwise: first.every(
      (scenario) => scenario.cold.providerCalls < scenario.naivePairwiseCalls,
    ),
    allWarmReplaysReduceProviderCalls: first.every(
      (scenario) => scenario.warm.providerCalls < scenario.cold.providerCalls,
    ),
    scenarios: first,
  };
}

export function renderTravelMatrixComparisonMarkdown(
  report: TravelMatrixComparisonReport,
): string {
  const rows = report.scenarios.map(
    (scenario) =>
      `| ${scenario.id} | ${scenario.nodeCount} | ${scenario.expectedDirectedEdges} | ${scenario.naivePairwiseCalls} | ${scenario.cold.batchCalls} | ${scenario.cold.fallbackCalls} | ${scenario.cold.providerCalls} | ${scenario.warm.providerCalls} | ${scenario.warm.persistentCacheHits} | ${scenario.cold.unresolvedEdges} | ${scenario.cold.complete} | ${scenario.cold.durationMs} |`,
  );
  return [
    "# Travel Matrix V1 Controlled Comparison",
    "",
    `- Version: ${report.version}`,
    `- As of: ${report.asOf}`,
    `- Deterministic: ${report.deterministic}`,
    `- Every cold batch strategy beats naive pairwise: ${report.allColdStrategiesBeatNaivePairwise}`,
    `- Every warm replay reduces provider calls: ${report.allWarmReplaysReduceProviderCalls}`,
    "",
    "| Scenario | Nodes | Directed edges | Naive calls | Batch calls | Fallback calls | Cold calls | Warm calls | Warm cache hits | Unresolved | Complete | Duration ms |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |",
    ...rows,
    "",
    "Synthetic fixture only. No route ordering or live provider call is performed.",
    "",
  ].join("\n");
}

