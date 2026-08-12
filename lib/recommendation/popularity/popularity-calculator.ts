import "server-only";

import {
  POPULARITY_V1_CONFIG,
  type PopularityEventType,
} from "@/lib/recommendation/config/popularity-v1";

const DAY_MS = 24 * 60 * 60 * 1_000;
const QUALITY_EVENTS = new Set<PopularityEventType>(
  POPULARITY_V1_CONFIG.qualityEvents,
);
const TREND_EVENTS = new Set<PopularityEventType>(
  POPULARITY_V1_CONFIG.trendEvents,
);

export type PopularityTrafficClassification =
  | "human"
  | "automated"
  | "test"
  | "provider_refresh"
  | "abusive";

export interface PopularityEvent {
  /** Stable first-party event ID used to reject replayed duplicates. */
  eventId: string;
  type: PopularityEventType;
  occurredAt: string;
  trafficClassification: PopularityTrafficClassification;
}

export interface PopularityV1Input {
  events: readonly PopularityEvent[];
  /** Explicit snapshot time; the calculator never reads the wall clock. */
  asOf: string;
  categoryPrior?: number;
}

export interface PopularityResult {
  score: number;
  status: "sufficient_data" | "insufficient_data";
  qualityComponent: number;
  trendComponent: number;
  /** Sum of accepted event decay multipliers, not business event weights. */
  sampleWeight: number;
  version: "popularity-v1";
}

function normalized(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be normalized to [0, 1]`);
  }
  return value;
}

function roundToPrecision(value: number): number {
  return (
    Math.floor(value * POPULARITY_V1_CONFIG.precision + 0.5) /
    POPULARITY_V1_CONFIG.precision
  );
}

function canonicalEvents(events: readonly PopularityEvent[]): PopularityEvent[] {
  const groups = new Map<string, PopularityEvent[]>();
  for (const event of events) {
    const eventId = event.eventId.trim();
    if (!eventId) continue;
    const group = groups.get(eventId) ?? [];
    group.push({ ...event, eventId });
    groups.set(eventId, group);
  }

  const result: PopularityEvent[] = [];
  for (const eventId of [...groups.keys()].sort((left, right) =>
    left.localeCompare(right),
  )) {
    const group = groups.get(eventId) ?? [];
    const representations = new Set(
      group.map(
        (event) =>
          `${event.type}\u0000${event.occurredAt}\u0000${event.trafficClassification}`,
      ),
    );
    // Identical replay is counted once. A conflicting reused ID is discarded.
    if (representations.size === 1 && group[0]) result.push(group[0]);
  }
  return result;
}

function decay(ageDays: number, halfLifeDays: number): number {
  return 0.5 ** (ageDays / halfLifeDays);
}

function saturation(sum: number, scale: number): number {
  return 1 - Math.exp(-Math.max(0, sum) / scale);
}

export function calculatePopularityV1(input: PopularityV1Input): PopularityResult {
  const asOfMs = Date.parse(input.asOf);
  if (!Number.isFinite(asOfMs)) throw new RangeError("asOf must be a valid timestamp");
  const categoryPrior = normalized(
    input.categoryPrior ?? POPULARITY_V1_CONFIG.defaultCategoryPrior,
    "categoryPrior",
  );

  let qualitySum = 0;
  let trendSum = 0;
  let sampleWeight = 0;
  for (const event of canonicalEvents(input.events)) {
    if (event.trafficClassification !== "human") continue;
    const eventMs = Date.parse(event.occurredAt);
    if (!Number.isFinite(eventMs) || eventMs > asOfMs) continue;
    const ageDays = (asOfMs - eventMs) / DAY_MS;
    const weight = POPULARITY_V1_CONFIG.eventWeights[event.type];
    if (QUALITY_EVENTS.has(event.type)) {
      const multiplier = decay(
        ageDays,
        POPULARITY_V1_CONFIG.qualityHalfLifeDays,
      );
      qualitySum += weight * multiplier;
      sampleWeight += multiplier;
    } else if (TREND_EVENTS.has(event.type)) {
      const multiplier = decay(
        ageDays,
        POPULARITY_V1_CONFIG.trendHalfLifeDays,
      );
      trendSum += weight * multiplier;
      sampleWeight += multiplier;
    }
  }

  const qualityComponent = saturation(
    qualitySum,
    POPULARITY_V1_CONFIG.qualityScale,
  );
  const trendComponent = saturation(
    trendSum,
    POPULARITY_V1_CONFIG.trendScale,
  );
  const observedScore =
    POPULARITY_V1_CONFIG.qualityWeight * qualityComponent +
    POPULARITY_V1_CONFIG.trendWeight * trendComponent;
  const smoothed =
    (sampleWeight * observedScore +
      POPULARITY_V1_CONFIG.priorWeight * categoryPrior) /
    (sampleWeight + POPULARITY_V1_CONFIG.priorWeight);
  const sufficient =
    sampleWeight >= POPULARITY_V1_CONFIG.minimumEffectiveSampleWeight;

  return {
    score: sufficient ? roundToPrecision(smoothed) : 0.5,
    status: sufficient ? "sufficient_data" : "insufficient_data",
    qualityComponent: roundToPrecision(qualityComponent),
    trendComponent: roundToPrecision(trendComponent),
    sampleWeight: roundToPrecision(sampleWeight),
    version: POPULARITY_V1_CONFIG.version,
  };
}
