import "server-only";

export type TravelTimeTemporalBasis =
  | "current_traffic"
  | "future_departure"
  | "traffic_independent"
  | "unknown";

export interface TravelNode {
  id: string;
  kind: "departure" | "place";
  name: string;
  latitude: number;
  longitude: number;
}

export interface TravelMatrixInput {
  signal?: AbortSignal;
  /** Reuse the same object for shortlist replenishment; deadline is a monotonic timestamp. */
  providerCallBudget?: { remaining: number; deadline?: number };
  departure: TravelNode;
  candidates: TravelNode[];
  travelMode: "driving";
  priority: "TIME";
  avoid: string[];
  requestedDepartureAt: string | null;
  /** Directed edges with the highest chance of being needed by hard route constraints. */
  requiredDirectedEdges?: Array<{ fromId: string; toId: string }>;
}

export type TravelMatrixEdgeStatus =
  | "resolved"
  | "unresolved"
  | "provider_unavailable"
  | "outside_batch_radius"
  | "invalid_coordinate";

export type TravelMatrixEdgeSource =
  | "kakao_multi_destination_live"
  | "kakao_directions_live"
  | "persistent_cache"
  | "request_cache"
  | "haversine_lower_bound";

export interface TravelMatrixEdge {
  fromId: string;
  toId: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  lowerBoundMeters: number | null;
  status: TravelMatrixEdgeStatus;
  source: TravelMatrixEdgeSource;
  confidence: "validated" | "provider_summary" | "estimated_only";
  temporalBasis: TravelTimeTemporalBasis;
  distanceFetchedAt: string | null;
  durationFetchedAt: string | null;
  reasonCodes: string[];
}

export interface TravelMatrixDiagnostics {
  nodeCount: number;
  expectedDirectedEdges: number;
  resolvedEdges: number;
  unresolvedEdges: number;
  estimatedLowerBounds: number;
  multiDestinationRequests: number;
  directionsFallbackRequests: number;
  requestCacheHits: number;
  persistentCacheHits: number;
  providerCalls: number;
  retries: number;
  timeouts: number;
  providerFailures: number;
  budgetExceeded: boolean;
  deadlineExceeded: boolean;
  durationMs: number;
}

export interface TravelMatrixResult {
  version: "travel-matrix-v1";
  nodeIds: string[];
  edges: Record<string, Record<string, TravelMatrixEdge>>;
  complete: boolean;
  diagnostics: TravelMatrixDiagnostics;
}

export interface OrderedRouteValidationInput {
  signal?: AbortSignal;
  providerCallBudget?: { remaining: number };
  departure: TravelNode;
  orderedStops: TravelNode[];
  /** Return to departure after the final stop. Defaults to false. */
  roundTrip?: boolean;
  requestedDepartureAt: string | null;
  priority: "RECOMMEND" | "TIME" | "DISTANCE";
  avoid: string[];
  includeGeometry: boolean;
}

export interface OrderedRouteValidationResult {
  status:
    | "validated"
    | "provider_unavailable"
    | "invalid_route"
    | "partial_route"
    | "unsupported_future_request";
  temporalBasis: TravelTimeTemporalBasis;
  totalDistanceMeters: number | null;
  totalDurationSeconds: number | null;
  sections: Array<{
    fromId: string;
    toId: string;
    distanceMeters: number;
    durationSeconds: number;
  }>;
  geometry: Array<{ latitude: number; longitude: number }>;
  providerResultCode: number | null;
  reasonCodes: string[];
  diagnostics: {
    providerOperation: "waypoints" | "future_directions" | "none";
    cacheHit: boolean;
    providerCalls: number;
    durationMs: number;
  };
}

export interface TravelTimeProvider {
  buildMatrix(input: TravelMatrixInput): Promise<TravelMatrixResult>;
  validateOrderedRoute(
    input: OrderedRouteValidationInput,
  ): Promise<OrderedRouteValidationResult>;
}

export interface TravelEdgeCacheKey {
  origin: string;
  destination: string;
  priority: "TIME";
  avoid: string[];
  travelMode: "driving";
  providerContractVersion: string;
  trafficTimeBucket: string;
}

export interface CachedTravelEdge {
  distanceMeters: number | null;
  durationSeconds: number | null;
  temporalBasis: TravelTimeTemporalBasis;
  distanceFetchedAt: string | null;
  durationFetchedAt: string | null;
  negativeUntil: string | null;
  reasonCodes: string[];
}

export interface TravelTimeCache {
  getEdge(key: TravelEdgeCacheKey): Promise<CachedTravelEdge | null>;
  setEdge(key: TravelEdgeCacheKey, value: CachedTravelEdge): Promise<void>;
}
