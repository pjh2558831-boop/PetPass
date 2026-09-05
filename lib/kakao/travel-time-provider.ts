import "server-only";

import {
  KakaoMobilityClient,
  KakaoMobilityProviderError,
  type KakaoDetailedRoute,
  type KakaoMobilityClientStats,
  type KakaoMobilityPoint,
  type KakaoMultiDestinationEntry,
  type KakaoMultiDestinationInput,
} from "@/lib/kakao/directions";
import { getDefaultTravelTimeCache } from "@/lib/travel/cache";
import {
  pairFallbackBudgetForMatrixV1,
  TRAVEL_MATRIX_V1_CONFIG,
} from "@/lib/travel/config/travel-matrix-v1";
import type {
  CachedTravelEdge,
  OrderedRouteValidationInput,
  OrderedRouteValidationResult,
  TravelEdgeCacheKey,
  TravelMatrixEdge,
  TravelMatrixInput,
  TravelMatrixResult,
  TravelNode,
  TravelTimeCache,
  TravelTimeProvider,
} from "@/lib/travel/types";

const KOREA_BOUNDS = {
  minLatitude: 33,
  maxLatitude: 39,
  minLongitude: 124,
  maxLongitude: 132,
} as const;

const ALLOWED_AVOID = new Set([
  "ferries",
  "motorway",
  "schoolzone",
  "toll",
  "uturn",
]);

export interface KakaoTravelTimeClient {
  multiDestination(input: KakaoMultiDestinationInput): Promise<KakaoMultiDestinationEntry[]>;
  pairDirections(input: {
    signal?: AbortSignal;
    providerCallBudget?: { remaining: number };
    origin: KakaoMobilityPoint;
    destination: KakaoMobilityPoint;
    priority: "RECOMMEND" | "TIME" | "DISTANCE";
    avoid: string[];
  }): Promise<KakaoDetailedRoute>;
  waypointDirections(input: {
    signal?: AbortSignal;
    providerCallBudget?: { remaining: number };
    origin: KakaoMobilityPoint;
    destination: KakaoMobilityPoint;
    waypoints: KakaoMobilityPoint[];
    priority: "RECOMMEND" | "TIME" | "DISTANCE";
    avoid: string[];
    includeGeometry: boolean;
  }): Promise<KakaoDetailedRoute>;
  futureDirections(input: {
    signal?: AbortSignal;
    providerCallBudget?: { remaining: number };
    origin: KakaoMobilityPoint;
    destination: KakaoMobilityPoint;
    waypoints: KakaoMobilityPoint[];
    requestedDepartureAt: string;
    priority: "RECOMMEND" | "TIME" | "DISTANCE";
    avoid: string[];
    includeGeometry: boolean;
  }): Promise<KakaoDetailedRoute>;
  stats?(): KakaoMobilityClientStats;
}

export interface KakaoTravelTimeProviderOptions {
  client?: KakaoTravelTimeClient;
  cache?: TravelTimeCache;
  now?: () => Date;
  monotonicNow?: () => number;
}

export class TravelMatrixInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TravelMatrixInputError";
  }
}

interface MutableDiagnostics {
  multiDestinationRequests: number;
  directionsFallbackRequests: number;
  requestCacheHits: number;
  persistentCacheHits: number;
  logicalProviderCalls: number;
  logicalProviderFailures: number;
  logicalTimeouts: number;
  budgetExceeded: boolean;
  deadlineExceeded: boolean;
}

interface PendingEdge {
  origin: TravelNode;
  destination: TravelNode;
  key: TravelEdgeCacheKey;
  lowerBoundMeters: number;
  cached: CachedTravelEdge | null;
  distanceFresh: boolean;
  durationFresh: boolean;
  outsideRadius: boolean;
}

interface FinalRouteCacheEntry {
  expiresAt: number;
  result: OrderedRouteValidationResult;
}

function providerAvailabilityReason(error: unknown): string {
  if (error instanceof KakaoMobilityProviderError) {
    if (error.httpStatus === 429) return "kakao_rate_limited";
    if ([401, 403].includes(error.httpStatus ?? 0)) return "kakao_authentication_failed";
  }
  return "route_provider_unavailable";
}

function validKoreanNode(node: TravelNode): boolean {
  return (
    node.id.trim().length > 0 &&
    node.name.trim().length > 0 &&
    Number.isFinite(node.latitude) &&
    Number.isFinite(node.longitude) &&
    node.latitude >= KOREA_BOUNDS.minLatitude &&
    node.latitude <= KOREA_BOUNDS.maxLatitude &&
    node.longitude >= KOREA_BOUNDS.minLongitude &&
    node.longitude <= KOREA_BOUNDS.maxLongitude
  );
}

function normalizedAvoid(values: string[]): string[] {
  const result = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
  if (result.some((value) => !ALLOWED_AVOID.has(value))) {
    throw new TravelMatrixInputError("Unsupported Kakao route avoidance option.");
  }
  return result;
}

function assertMatrixInput(input: TravelMatrixInput): void {
  const budget = input.providerCallBudget;
  if (budget && (!Number.isInteger(budget.remaining) || budget.remaining < 0 ||
    budget.remaining > TRAVEL_MATRIX_V1_CONFIG.maxProviderRequestsPerMatrix ||
    (budget.deadline !== undefined && !Number.isFinite(budget.deadline)))) {
    throw new TravelMatrixInputError("Travel matrix request budget is invalid.");
  }
  if (input.travelMode !== "driving" || input.priority !== "TIME") {
    throw new TravelMatrixInputError("Travel matrix mode and priority are server controlled.");
  }
  if (input.departure.kind !== "departure") {
    throw new TravelMatrixInputError("Exactly one departure node is required.");
  }
  if (input.candidates.length > TRAVEL_MATRIX_V1_CONFIG.maxCandidates) {
    throw new TravelMatrixInputError("Travel matrix candidate limit exceeded.");
  }
  const nodes = [input.departure, ...input.candidates];
  if (nodes.some((node) => !validKoreanNode(node))) {
    throw new TravelMatrixInputError("Travel matrix contains an invalid Korean coordinate or label.");
  }
  if (input.candidates.some((node) => node.kind !== "place")) {
    throw new TravelMatrixInputError("Candidate nodes must be places.");
  }
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) {
    throw new TravelMatrixInputError("Travel matrix node IDs must be unique.");
  }
  normalizedAvoid(input.avoid);
}

function assertOrderedRouteInput(input: OrderedRouteValidationInput): string[] {
  if (!validKoreanNode(input.departure) || input.departure.kind !== "departure") {
    throw new TravelMatrixInputError("Ordered route departure is invalid.");
  }
  if (
    input.orderedStops.length < 1 ||
    input.orderedStops.length > TRAVEL_MATRIX_V1_CONFIG.finalStopLimit ||
    input.orderedStops.some((node) => node.kind !== "place" || !validKoreanNode(node))
  ) {
    throw new TravelMatrixInputError("Ordered route must contain one to five valid place stops.");
  }
  const ids = [input.departure.id, ...input.orderedStops.map((node) => node.id)];
  if (new Set(ids).size !== ids.length) {
    throw new TravelMatrixInputError("Ordered route node IDs must be unique.");
  }
  return normalizedAvoid(input.avoid);
}

function toPoint(node: TravelNode): KakaoMobilityPoint {
  return {
    name: node.name,
    longitude: node.longitude,
    latitude: node.latitude,
  };
}

function haversineMeters(left: TravelNode, right: TravelNode): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_008.8;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const latitude1 = radians(left.latitude);
  const latitude2 = radians(right.latitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(value))));
}

function coordinateKey(node: TravelNode): string {
  const precision = TRAVEL_MATRIX_V1_CONFIG.coordinatePrecisionDigits;
  return `${node.longitude.toFixed(precision)},${node.latitude.toFixed(precision)}`;
}

function currentTrafficBucket(now: Date): string {
  const size = TRAVEL_MATRIX_V1_CONFIG.currentTrafficDurationTtlMs;
  return `current:${Math.floor(now.getTime() / size)}`;
}

function edgeCacheKey(
  origin: TravelNode,
  destination: TravelNode,
  avoid: string[],
  now: Date,
): TravelEdgeCacheKey {
  return {
    origin: coordinateKey(origin),
    destination: coordinateKey(destination),
    priority: "TIME",
    avoid,
    travelMode: "driving",
    providerContractVersion: TRAVEL_MATRIX_V1_CONFIG.providerContractVersion,
    trafficTimeBucket: currentTrafficBucket(now),
  };
}

function distanceCacheKey(key: TravelEdgeCacheKey): TravelEdgeCacheKey {
  return { ...key, trafficTimeBucket: "traffic-independent" };
}

function fresh(timestamp: string | null, ttlMs: number, nowMs: number): boolean {
  if (!timestamp) return false;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) && value <= nowMs && nowMs - value <= ttlMs;
}

function edgeFromCache(
  pending: PendingEdge,
  now: Date,
): TravelMatrixEdge | null {
  const cached = pending.cached;
  if (!cached) return null;
  if (cached.negativeUntil && Date.parse(cached.negativeUntil) > now.getTime()) {
    return {
      fromId: pending.origin.id,
      toId: pending.destination.id,
      distanceMeters: pending.distanceFresh ? cached.distanceMeters : null,
      durationSeconds: pending.durationFresh ? cached.durationSeconds : null,
      lowerBoundMeters: pending.lowerBoundMeters,
      status: "provider_unavailable",
      source: "persistent_cache",
      confidence: "estimated_only",
      temporalBasis: "current_traffic",
      distanceFetchedAt: pending.distanceFresh ? cached.distanceFetchedAt : null,
      durationFetchedAt: pending.durationFresh ? cached.durationFetchedAt : null,
      reasonCodes: [...cached.reasonCodes, "negative_cache_hit"],
    };
  }
  if (
    pending.distanceFresh &&
    pending.durationFresh &&
    cached.distanceMeters !== null &&
    cached.durationSeconds !== null
  ) {
    return {
      fromId: pending.origin.id,
      toId: pending.destination.id,
      distanceMeters: cached.distanceMeters,
      durationSeconds: cached.durationSeconds,
      lowerBoundMeters: pending.lowerBoundMeters,
      status: "resolved",
      source: "persistent_cache",
      confidence: "provider_summary",
      temporalBasis: cached.temporalBasis,
      distanceFetchedAt: cached.distanceFetchedAt,
      durationFetchedAt: cached.durationFetchedAt,
      reasonCodes: ["persistent_cache_hit"],
    };
  }
  return null;
}

function resolvedEdge(
  pending: PendingEdge,
  distanceMeters: number,
  durationSeconds: number,
  fetchedAt: string,
  source: "kakao_multi_destination_live" | "kakao_directions_live",
): TravelMatrixEdge {
  return {
    fromId: pending.origin.id,
    toId: pending.destination.id,
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: Math.round(durationSeconds),
    lowerBoundMeters: pending.lowerBoundMeters,
    status: "resolved",
    source,
    confidence: "provider_summary",
    temporalBasis: "current_traffic",
    distanceFetchedAt: fetchedAt,
    durationFetchedAt: fetchedAt,
    reasonCodes: [],
  };
}

function failedEdge(
  pending: PendingEdge,
  status: TravelMatrixEdge["status"],
  reasonCodes: string[],
): TravelMatrixEdge {
  return {
    fromId: pending.origin.id,
    toId: pending.destination.id,
    distanceMeters: pending.distanceFresh ? pending.cached?.distanceMeters ?? null : null,
    durationSeconds: pending.durationFresh ? pending.cached?.durationSeconds ?? null : null,
    lowerBoundMeters: pending.lowerBoundMeters,
    status,
    source:
      pending.distanceFresh || pending.durationFresh
        ? "persistent_cache"
        : "haversine_lower_bound",
    confidence: "estimated_only",
    temporalBasis: "current_traffic",
    distanceFetchedAt: pending.distanceFresh ? pending.cached?.distanceFetchedAt ?? null : null,
    durationFetchedAt: pending.durationFresh ? pending.cached?.durationFetchedAt ?? null : null,
    reasonCodes,
  };
}

export function createRequestPromiseMemo(onHit: () => void) {
  const values = new Map<string, Promise<unknown>>();
  return async <T>(key: string, factory: () => Promise<T>): Promise<T> => {
    const existing = values.get(key);
    if (existing) {
      onHit();
      return existing as Promise<T>;
    }
    const pending = factory();
    values.set(key, pending);
    try {
      return await pending;
    } catch (error) {
      values.delete(key);
      throw error;
    }
  };
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (next < values.length) {
        const value = values[next];
        next += 1;
        await worker(value);
      }
    }),
  );
}

function cacheValue(edge: TravelMatrixEdge): CachedTravelEdge {
  return {
    distanceMeters: edge.distanceMeters,
    durationSeconds: edge.durationSeconds,
    temporalBasis: edge.temporalBasis,
    distanceFetchedAt: edge.distanceFetchedAt,
    durationFetchedAt: edge.durationFetchedAt,
    negativeUntil: null,
    reasonCodes: edge.reasonCodes,
  };
}

function clientDelta(
  before: KakaoMobilityClientStats | null,
  after: KakaoMobilityClientStats | null,
) {
  if (!before || !after) return null;
  return {
    providerCalls: after.providerCalls - before.providerCalls,
    retries: after.retries - before.retries,
    timeouts: after.timeouts - before.timeouts,
    providerFailures: after.providerFailures - before.providerFailures,
  };
}

function cloneValidation(result: OrderedRouteValidationResult): OrderedRouteValidationResult {
  return structuredClone(result);
}

export class KakaoTravelTimeProvider implements TravelTimeProvider {
  private readonly client: KakaoTravelTimeClient;
  private readonly cache: TravelTimeCache;
  private readonly now: () => Date;
  private readonly monotonicNow: () => number;
  private readonly finalRouteCache = new Map<string, FinalRouteCacheEntry>();
  private readonly inFlightProviderRequests = new Map<string, Promise<unknown>>();

  constructor(options: KakaoTravelTimeProviderOptions = {}) {
    this.client = options.client ?? new KakaoMobilityClient({
      timeoutMs: TRAVEL_MATRIX_V1_CONFIG.providerRequestTimeoutMs,
      retryCount: 1,
    });
    this.cache = options.cache ?? getDefaultTravelTimeCache();
    this.now = options.now ?? (() => new Date());
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
  }

  private async mergeInFlight<T>(
    key: string,
    onHit: () => void,
    factory: () => Promise<T>,
  ): Promise<T> {
    const existing = this.inFlightProviderRequests.get(key);
    if (existing) {
      onHit();
      return existing as Promise<T>;
    }
    const pending = factory();
    this.inFlightProviderRequests.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.inFlightProviderRequests.get(key) === pending) {
        this.inFlightProviderRequests.delete(key);
      }
    }
  }

  async buildMatrix(input: TravelMatrixInput): Promise<TravelMatrixResult> {
    input.signal?.throwIfAborted();
    assertMatrixInput(input);
    const startedAt = this.monotonicNow();
    const providerCallBudget: NonNullable<TravelMatrixInput["providerCallBudget"]> = input.providerCallBudget ?? { remaining: TRAVEL_MATRIX_V1_CONFIG.maxProviderRequestsPerMatrix };
    providerCallBudget.deadline ??= startedAt + TRAVEL_MATRIX_V1_CONFIG.matrixDeadlineMs;
    const deadlineAt = providerCallBudget.deadline;
    const capturedNow = this.now();
    const fetchedAt = capturedNow.toISOString();
    const avoid = normalizedAvoid(input.avoid);
    const nodes = [
      input.departure,
      ...[...input.candidates].sort((left, right) => left.id.localeCompare(right.id)),
    ];
    const edges: Record<string, Record<string, TravelMatrixEdge>> = Object.fromEntries(
      nodes.map((node) => [node.id, {}]),
    );
    const diagnostics: MutableDiagnostics = {
      multiDestinationRequests: 0,
      directionsFallbackRequests: 0,
      requestCacheHits: 0,
      persistentCacheHits: 0,
      logicalProviderCalls: 0,
      logicalProviderFailures: 0,
      logicalTimeouts: 0,
      budgetExceeded: false,
      deadlineExceeded: false,
    };
    const beforeStats = this.client.stats?.() ?? null;
    // A canceled generation must not cancel another request sharing its road cache.
    const memo = <T>(key: string, factory: () => Promise<T>) => {
      const bounded = () => {
        if (providerCallBudget.remaining <= 0) throw new KakaoMobilityProviderError("BUDGET_EXCEEDED", "Travel matrix request budget exhausted.");
        const before = providerCallBudget.remaining;
        const pending = factory();
        // The real client reserves before fetch; injected one-call clients may leave accounting here.
        if (providerCallBudget.remaining === before) providerCallBudget.remaining -= 1;
        return pending;
      };
      return input.signal ? bounded() : this.mergeInFlight(key, () => {
        diagnostics.requestCacheHits += 1;
      }, bounded);
    };
    const requiredEdgeKeys = new Set(
      (input.requiredDirectedEdges ?? []).map(({ fromId, toId }) => `${fromId}>${toId}`),
    );
    const fallbackPending: PendingEdge[] = [];
    let terminalProviderFailure: string | null = null;

    for (const node of nodes) {
      edges[node.id][node.id] = {
        fromId: node.id,
        toId: node.id,
        distanceMeters: 0,
        durationSeconds: 0,
        lowerBoundMeters: 0,
        status: "resolved",
        source: "request_cache",
        confidence: "validated",
        temporalBasis: "traffic_independent",
        distanceFetchedAt: null,
        durationFetchedAt: null,
        reasonCodes: ["diagonal_zero"],
      };
    }

    const deadlineReached = () => {
      const reached = this.monotonicNow() >= deadlineAt;
      if (reached) diagnostics.deadlineExceeded = true;
      return reached;
    };

    await mapWithConcurrency(
      nodes,
      TRAVEL_MATRIX_V1_CONFIG.providerConcurrency,
      async (origin) => {
        input.signal?.throwIfAborted();
        const pending: PendingEdge[] = [];
        for (const destination of nodes) {
          input.signal?.throwIfAborted();
          if (destination.id === origin.id) continue;
          const lowerBoundMeters = haversineMeters(origin, destination);
          const key = edgeCacheKey(origin, destination, avoid, capturedNow);
          let cached: CachedTravelEdge | null = null;
          try {
            cached = await this.cache.getEdge(key);
            const distanceOnly = await this.cache.getEdge(distanceCacheKey(key));
            if (
              distanceOnly &&
              fresh(
                distanceOnly.distanceFetchedAt,
                TRAVEL_MATRIX_V1_CONFIG.roadDistanceTtlMs,
                capturedNow.getTime(),
              ) &&
              (!cached ||
                !fresh(
                  cached.distanceFetchedAt,
                  TRAVEL_MATRIX_V1_CONFIG.roadDistanceTtlMs,
                  capturedNow.getTime(),
                ))
            ) {
              cached = {
                ...(cached ?? {
                  durationSeconds: null,
                  durationFetchedAt: null,
                  negativeUntil: null,
                  temporalBasis: "current_traffic" as const,
                  reasonCodes: [],
                }),
                distanceMeters: distanceOnly.distanceMeters,
                distanceFetchedAt: distanceOnly.distanceFetchedAt,
              };
            }
          } catch {
            cached = null;
          }
          const distanceFresh = Boolean(
            cached?.distanceMeters !== null &&
              cached?.distanceMeters !== undefined &&
              fresh(
                cached.distanceFetchedAt,
                TRAVEL_MATRIX_V1_CONFIG.roadDistanceTtlMs,
                capturedNow.getTime(),
              ),
          );
          const durationFresh = Boolean(
            cached?.durationSeconds !== null &&
              cached?.durationSeconds !== undefined &&
              fresh(
                cached.durationFetchedAt,
                TRAVEL_MATRIX_V1_CONFIG.currentTrafficDurationTtlMs,
                capturedNow.getTime(),
              ),
          );
          const item: PendingEdge = {
            origin,
            destination,
            key,
            lowerBoundMeters,
            cached,
            distanceFresh,
            durationFresh,
            outsideRadius:
              lowerBoundMeters > TRAVEL_MATRIX_V1_CONFIG.multiDestinationRadiusMeters,
          };
          const cacheHit = edgeFromCache(item, capturedNow);
          if (cacheHit) {
            edges[origin.id][destination.id] = cacheHit;
            diagnostics.persistentCacheHits += 1;
          } else {
            pending.push(item);
          }
        }

        const inside = pending.filter((edge) => !edge.outsideRadius);
        for (
          let index = 0;
          index < inside.length;
          index += TRAVEL_MATRIX_V1_CONFIG.maxDestinationsPerBatch
        ) {
          input.signal?.throwIfAborted();
          const batch = inside.slice(
            index,
            index + TRAVEL_MATRIX_V1_CONFIG.maxDestinationsPerBatch,
          );
          if (batch.length === 0 || deadlineReached()) break;
          if (terminalProviderFailure) {
            for (const item of batch) edges[origin.id][item.destination.id] = failedEdge(item, "provider_unavailable", [terminalProviderFailure]);
            continue;
          }
          if (providerCallBudget.remaining <= 0) {
            diagnostics.budgetExceeded = true;
            break;
          }
          if (
            diagnostics.multiDestinationRequests >=
            TRAVEL_MATRIX_V1_CONFIG.maxBatchRequestsPerMatrix
          ) {
            diagnostics.budgetExceeded = true;
            break;
          }
          const destinations = batch.map((edge) => ({
            id: edge.destination.id,
            coordinates: coordinateKey(edge.destination),
          })).sort((left, right) =>
            left.id.localeCompare(right.id) ||
            left.coordinates.localeCompare(right.coordinates));
          const requestKey = JSON.stringify({
            operation: "destinations",
            origin: coordinateKey(origin),
            destinations,
            avoid,
            radius: TRAVEL_MATRIX_V1_CONFIG.multiDestinationRadiusMeters,
          });
          try {
            const response = await memo(requestKey, async () => {
              diagnostics.multiDestinationRequests += 1;
              diagnostics.logicalProviderCalls += 1;
              return this.client.multiDestination({
                signal: input.signal, providerCallBudget,
                origin: toPoint(origin),
                destinations: batch.map((edge) => ({
                  ...toPoint(edge.destination),
                  key: edge.destination.id,
                })),
                radiusMeters: TRAVEL_MATRIX_V1_CONFIG.multiDestinationRadiusMeters,
                priority: "TIME",
                avoid,
              });
            });
            const byKey = new Map(response.map((entry) => [entry.key, entry]));
            for (const item of batch) {
              const entry = byKey.get(item.destination.id);
              if (
                !entry ||
                entry.resultCode !== 0 ||
                entry.distanceMeters === null ||
                entry.durationSeconds === null
              ) {
                continue;
              }
              const edge = resolvedEdge(
                item,
                entry.distanceMeters,
                entry.durationSeconds,
                fetchedAt,
                "kakao_multi_destination_live",
              );
              edges[origin.id][item.destination.id] = edge;
              try {
                await this.cache.setEdge(item.key, cacheValue(edge));
                await this.cache.setEdge(distanceCacheKey(item.key), {
                  ...cacheValue(edge),
                  durationSeconds: null,
                  durationFetchedAt: null,
                  temporalBasis: "traffic_independent",
                });
              } catch {
                // Cache availability never changes provider truth.
              }
            }
          } catch (error) {
            input.signal?.throwIfAborted();
            diagnostics.logicalProviderFailures += 1;
            if (error instanceof KakaoMobilityProviderError && error.code === "TIMEOUT") {
              diagnostics.logicalTimeouts += 1;
            }
            if (providerCallBudget.remaining <= 0) diagnostics.budgetExceeded = true;
            const reason = providerAvailabilityReason(error);
            if (reason !== "route_provider_unavailable") {
              terminalProviderFailure = reason;
              for (const item of batch) edges[origin.id][item.destination.id] = failedEdge(item, "provider_unavailable", [reason]);
            }
          }
        }

        fallbackPending.push(
          ...pending.filter((item) => !edges[origin.id][item.destination.id]),
        );
      },
    );

    const pairFallbackBudget = pairFallbackBudgetForMatrixV1(
      nodes.length,
      diagnostics.multiDestinationRequests,
    );
    fallbackPending.sort((left, right) =>
      Number(requiredEdgeKeys.has(`${right.origin.id}>${right.destination.id}`)) -
        Number(requiredEdgeKeys.has(`${left.origin.id}>${left.destination.id}`)) ||
      left.lowerBoundMeters - right.lowerBoundMeters ||
      left.origin.id.localeCompare(right.origin.id) ||
      left.destination.id.localeCompare(right.destination.id));
    const scheduledFallback = fallbackPending.slice(0, pairFallbackBudget);
    const skippedFallback = fallbackPending.slice(pairFallbackBudget);
    if (skippedFallback.length > 0) diagnostics.budgetExceeded = true;
    await mapWithConcurrency(
      scheduledFallback,
      TRAVEL_MATRIX_V1_CONFIG.providerConcurrency,
      async (item) => {
        input.signal?.throwIfAborted();
        if (terminalProviderFailure) {
          edges[item.origin.id][item.destination.id] = failedEdge(item, "provider_unavailable", [terminalProviderFailure]);
          return;
        }
        if (providerCallBudget.remaining <= 0) {
          diagnostics.budgetExceeded = true;
          edges[item.origin.id][item.destination.id] = failedEdge(item, "unresolved", ["provider_budget_exhausted"]);
          return;
        }
        if (deadlineReached()) {
          edges[item.origin.id][item.destination.id] = failedEdge(item, "unresolved", [
            "matrix_deadline_exceeded",
          ]);
          return;
        }
        const requestKey = JSON.stringify({
          operation: "directions",
          origin: coordinateKey(item.origin),
          destination: coordinateKey(item.destination),
          avoid,
        });
        try {
          const route = await memo(requestKey, async () => {
            diagnostics.directionsFallbackRequests += 1;
            diagnostics.logicalProviderCalls += 1;
            return this.client.pairDirections({
              signal: input.signal, providerCallBudget,
              origin: toPoint(item.origin),
              destination: toPoint(item.destination),
              priority: "TIME",
              avoid,
            });
          });
          const edge = resolvedEdge(
            item,
            route.totalDistanceMeters,
            route.totalDurationSeconds,
            fetchedAt,
            "kakao_directions_live",
          );
          edges[item.origin.id][item.destination.id] = edge;
          try {
            await this.cache.setEdge(item.key, cacheValue(edge));
            await this.cache.setEdge(distanceCacheKey(item.key), {
              ...cacheValue(edge),
              durationSeconds: null,
              durationFetchedAt: null,
              temporalBasis: "traffic_independent",
            });
          } catch {
            // Cache availability never changes provider truth.
          }
        } catch (error) {
          input.signal?.throwIfAborted();
          diagnostics.logicalProviderFailures += 1;
          if (error instanceof KakaoMobilityProviderError && error.code === "TIMEOUT") {
            diagnostics.logicalTimeouts += 1;
          }
          const reason = error instanceof KakaoMobilityProviderError
            ? `provider_${error.code.toLowerCase()}`
            : "provider_unavailable";
          const availabilityReason = providerAvailabilityReason(error);
          if (availabilityReason !== "route_provider_unavailable") terminalProviderFailure = availabilityReason;
          if (providerCallBudget.remaining <= 0) diagnostics.budgetExceeded = true;
          const failed = failedEdge(item, "provider_unavailable", [reason, availabilityReason]);
          edges[item.origin.id][item.destination.id] = failed;
          try {
            await this.cache.setEdge(item.key, {
              ...cacheValue(failed),
              negativeUntil: new Date(
                capturedNow.getTime() + TRAVEL_MATRIX_V1_CONFIG.negativeCacheTtlMs,
              ).toISOString(),
            });
          } catch {
            // Cache availability never changes provider truth.
          }
        }
      },
    );
    input.signal?.throwIfAborted();
    for (const item of skippedFallback) {
      edges[item.origin.id][item.destination.id] = failedEdge(
        item,
        item.outsideRadius ? "outside_batch_radius" : "unresolved",
        ["pair_fallback_budget_exhausted"],
      );
    }

    for (const origin of nodes) {
      for (const destination of nodes) {
        if (origin.id === destination.id || edges[origin.id][destination.id]) continue;
        const item: PendingEdge = {
          origin,
          destination,
          key: edgeCacheKey(origin, destination, avoid, capturedNow),
          lowerBoundMeters: haversineMeters(origin, destination),
          cached: null,
          distanceFresh: false,
          durationFresh: false,
          outsideRadius:
            haversineMeters(origin, destination) >
            TRAVEL_MATRIX_V1_CONFIG.multiDestinationRadiusMeters,
        };
        edges[origin.id][destination.id] = failedEdge(item, "unresolved", [
          diagnostics.deadlineExceeded
            ? "matrix_deadline_exceeded"
            : "provider_budget_exhausted",
        ]);
      }
    }

    const nonDiagonal = nodes.flatMap((origin) =>
      nodes
        .filter((destination) => destination.id !== origin.id)
        .map((destination) => edges[origin.id][destination.id]),
    );
    const resolvedEdges = nonDiagonal.filter(
      (edge) =>
        edge.status === "resolved" &&
        edge.distanceMeters !== null &&
        edge.durationSeconds !== null,
    ).length;
    const afterStats = this.client.stats?.() ?? null;
    const provider = clientDelta(beforeStats, afterStats);
    const durationMs = Math.max(0, Math.round(this.monotonicNow() - startedAt));

    return {
      version: TRAVEL_MATRIX_V1_CONFIG.version,
      nodeIds: nodes.map((node) => node.id),
      edges,
      complete: resolvedEdges === nodes.length * (nodes.length - 1),
      diagnostics: {
        nodeCount: nodes.length,
        expectedDirectedEdges: nodes.length * (nodes.length - 1),
        resolvedEdges,
        unresolvedEdges: nonDiagonal.length - resolvedEdges,
        estimatedLowerBounds: nonDiagonal.filter(
          (edge) => edge.lowerBoundMeters !== null && edge.status !== "resolved",
        ).length,
        multiDestinationRequests: diagnostics.multiDestinationRequests,
        directionsFallbackRequests: diagnostics.directionsFallbackRequests,
        requestCacheHits: diagnostics.requestCacheHits,
        persistentCacheHits: diagnostics.persistentCacheHits,
        providerCalls: provider?.providerCalls ?? diagnostics.logicalProviderCalls,
        retries: provider?.retries ?? 0,
        timeouts: Math.max(provider?.timeouts ?? 0, diagnostics.logicalTimeouts),
        providerFailures: Math.max(
          provider?.providerFailures ?? 0,
          diagnostics.logicalProviderFailures,
        ),
        budgetExceeded: diagnostics.budgetExceeded,
        deadlineExceeded: diagnostics.deadlineExceeded,
        durationMs,
      },
    };
  }

  async validateOrderedRoute(
    input: OrderedRouteValidationInput,
  ): Promise<OrderedRouteValidationResult> {
    const startedAt = this.monotonicNow();
    let avoid: string[];
    try {
      avoid = assertOrderedRouteInput(input);
    } catch (error) {
      return {
        status: "invalid_route",
        temporalBasis: "unknown",
        totalDistanceMeters: null,
        totalDurationSeconds: null,
        sections: [],
        geometry: [],
        providerResultCode: null,
        reasonCodes: [
          error instanceof Error ? "invalid_ordered_route" : "invalid_route",
        ],
        diagnostics: {
          providerOperation: "none",
          cacheHit: false,
          providerCalls: 0,
          durationMs: Math.max(0, Math.round(this.monotonicNow() - startedAt)),
        },
      };
    }

    input.signal?.throwIfAborted();
    const capturedNow = this.now();
    let requestedTime: Date | null = null;
    const reasonCodes: string[] = [];
    if (input.requestedDepartureAt !== null) {
      requestedTime = new Date(input.requestedDepartureAt);
      if (!Number.isFinite(requestedTime.getTime())) {
        return {
          status: "invalid_route",
          temporalBasis: "unknown",
          totalDistanceMeters: null,
          totalDurationSeconds: null,
          sections: [],
          geometry: [],
          providerResultCode: null,
          reasonCodes: ["invalid_requested_departure_time"],
          diagnostics: {
            providerOperation: "none",
            cacheHit: false,
            providerCalls: 0,
            durationMs: Math.max(0, Math.round(this.monotonicNow() - startedAt)),
          },
        };
      }
      if (requestedTime.getTime() <= capturedNow.getTime()) {
        requestedTime = null;
        reasonCodes.push("requested_departure_not_future_current_used");
      }
    }

    const future = requestedTime !== null;
    const roundTrip = input.roundTrip === true;
    const intermediateStops = roundTrip
      ? input.orderedStops
      : input.orderedStops.slice(0, -1);
    if (
      future &&
      intermediateStops.length > TRAVEL_MATRIX_V1_CONFIG.futureWaypointLimit
    ) {
      return {
        status: "unsupported_future_request",
        temporalBasis: "future_departure",
        totalDistanceMeters: null,
        totalDurationSeconds: null,
        sections: [],
        geometry: [],
        providerResultCode: null,
        reasonCodes: ["future_waypoint_limit_exceeded"],
        diagnostics: {
          providerOperation: "none",
          cacheHit: false,
          providerCalls: 0,
          durationMs: Math.max(0, Math.round(this.monotonicNow() - startedAt)),
        },
      };
    }

    const routeKey = JSON.stringify({
      version: TRAVEL_MATRIX_V1_CONFIG.providerContractVersion,
      nodes: [input.departure, ...input.orderedStops].map(coordinateKey),
      requestedDepartureAt: future ? requestedTime!.toISOString() : null,
      priority: input.priority,
      avoid,
      includeGeometry: input.includeGeometry,
      roundTrip,
    });
    const cached = this.finalRouteCache.get(routeKey);
    if (cached && cached.expiresAt > capturedNow.getTime()) {
      const result = cloneValidation(cached.result);
      result.diagnostics = {
        ...result.diagnostics,
        cacheHit: true,
        providerCalls: 0,
        durationMs: Math.max(0, Math.round(this.monotonicNow() - startedAt)),
      };
      return result;
    }

    const budgetBefore = input.providerCallBudget?.remaining;
    if (budgetBefore !== undefined && budgetBefore <= 0) return { status: "provider_unavailable", temporalBasis: "unknown", totalDistanceMeters: null, totalDurationSeconds: null, sections: [], geometry: [], providerResultCode: null, reasonCodes: ["final_provider_budget_exhausted"], diagnostics: { providerOperation: "none", cacheHit: false, providerCalls: 0, durationMs: 0 } };
    const beforeStats = this.client.stats?.() ?? null;
    const destination = roundTrip
      ? input.departure
      : input.orderedStops[input.orderedStops.length - 1];
    const providerOperation = future ? "future_directions" : "waypoints";
    try {
      const route = future
        ? await this.client.futureDirections({
            signal: input.signal, providerCallBudget: input.providerCallBudget,
            origin: toPoint(input.departure),
            destination: toPoint(destination),
            waypoints: intermediateStops.map(toPoint),
            requestedDepartureAt: requestedTime!.toISOString(),
            priority: input.priority,
            avoid,
            includeGeometry: input.includeGeometry,
          })
        : await this.client.waypointDirections({
            signal: input.signal, providerCallBudget: input.providerCallBudget,
            origin: toPoint(input.departure),
            destination: toPoint(destination),
            waypoints: intermediateStops.map(toPoint),
            priority: input.priority,
            avoid,
            includeGeometry: input.includeGeometry,
          });
      const afterStats = this.client.stats?.() ?? null;
      const providerCalls = clientDelta(beforeStats, afterStats)?.providerCalls ?? 1;
      if (input.providerCallBudget && input.providerCallBudget.remaining === budgetBefore) input.providerCallBudget.remaining -= providerCalls;
      const expectedSectionCount = input.orderedStops.length + (roundTrip ? 1 : 0);
      if (route.sections.length !== expectedSectionCount) {
        return {
          status: "partial_route",
          temporalBasis: future ? "future_departure" : "current_traffic",
          totalDistanceMeters: null,
          totalDurationSeconds: null,
          sections: [],
          geometry: [],
          providerResultCode: route.resultCode,
          reasonCodes: [...reasonCodes, "provider_section_count_mismatch"],
          diagnostics: {
            providerOperation,
            cacheHit: false,
            providerCalls,
            durationMs: Math.max(0, Math.round(this.monotonicNow() - startedAt)),
          },
        };
      }
      const chain = [
        input.departure,
        ...input.orderedStops,
        ...(roundTrip ? [input.departure] : []),
      ];
      const result: OrderedRouteValidationResult = {
        status: "validated",
        temporalBasis: future ? "future_departure" : "current_traffic",
        totalDistanceMeters: route.totalDistanceMeters,
        totalDurationSeconds: route.totalDurationSeconds,
        sections: route.sections.map((section, index) => ({
          fromId: chain[index].id,
          toId: chain[index + 1].id,
          distanceMeters: section.distanceMeters,
          durationSeconds: section.durationSeconds,
        })),
        geometry: route.coordinates,
        providerResultCode: route.resultCode,
        reasonCodes,
        diagnostics: {
          providerOperation,
          cacheHit: false,
          providerCalls,
          durationMs: Math.max(0, Math.round(this.monotonicNow() - startedAt)),
        },
      };
      this.finalRouteCache.set(routeKey, {
        expiresAt:
          capturedNow.getTime() +
          (future
            ? TRAVEL_MATRIX_V1_CONFIG.futureDurationTtlMs
            : TRAVEL_MATRIX_V1_CONFIG.currentTrafficDurationTtlMs),
        result: cloneValidation(result),
      });
      return result;
    } catch (error) {
      input.signal?.throwIfAborted();
      const afterStats = this.client.stats?.() ?? null;
      const providerCalls = clientDelta(beforeStats, afterStats)?.providerCalls ?? 1;
      if (input.providerCallBudget && input.providerCallBudget.remaining === budgetBefore) input.providerCallBudget.remaining -= providerCalls;
      if (future && error instanceof KakaoMobilityProviderError && error.code === "UNSUPPORTED_FUTURE" && (!input.providerCallBudget || input.providerCallBudget.remaining > 0)) {
        const fallback = await this.validateOrderedRoute({ ...input, requestedDepartureAt: null });
        return { ...fallback, reasonCodes: [...fallback.reasonCodes, "future_prediction_unsupported_current_road_estimate_used"], diagnostics: { ...fallback.diagnostics, providerCalls: providerCalls + fallback.diagnostics.providerCalls } };
      }
      const malformed =
        error instanceof KakaoMobilityProviderError && error.code === "INVALID_RESPONSE";
      return {
        status: malformed ? "partial_route" : "provider_unavailable",
        temporalBasis: future ? "future_departure" : "current_traffic",
        totalDistanceMeters: null,
        totalDurationSeconds: null,
        sections: [],
        geometry: [],
        providerResultCode: null,
        reasonCodes: [
          ...reasonCodes,
          malformed ? "malformed_provider_route" : providerAvailabilityReason(error),
        ],
        diagnostics: {
          providerOperation,
          cacheHit: false,
          providerCalls,
          durationMs: Math.max(0, Math.round(this.monotonicNow() - startedAt)),
        },
      };
    }
  }
}
