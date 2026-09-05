import "server-only";

import { z } from "zod";
import { getKakaoRestApiKey } from "@/lib/kakao/server-config";
import { ProviderResponseError } from "@/lib/shared/errors";
import type {
  KakaoDirectionsRequest,
  KakaoDrivingRoute,
} from "@/types/kakao";

export const KAKAO_MOBILITY_PUBLIC_ORIGIN =
  "https://apis-navi.kakaomobility.com" as const;
export const KAKAO_MOBILITY_PUBLIC_PATHS = {
  directions: "/v1/directions",
  destinations: "/v1/destinations/directions",
  waypoints: "/v1/waypoints/directions",
  future: "/v1/future/directions",
} as const;

const PUBLIC_PATH_SET = new Set<string>(Object.values(KAKAO_MOBILITY_PUBLIC_PATHS));

export function assertPublicKakaoMobilityPath(path: string): void {
  if (
    !PUBLIC_PATH_SET.has(path) ||
    path.includes("/affiliate/") ||
    path.includes("directions100") ||
    path.includes("matrix/directions")
  ) {
    throw new KakaoMobilityProviderError(
      "INVALID_ENDPOINT",
      "Kakao Mobility endpoint is not public-allowlisted.",
    );
  }
}

const roadSchema = z.object({ vertexes: z.array(z.number().finite()) });
const sectionSchema = z.object({
  distance: z.number().finite().nonnegative(),
  duration: z.number().finite().nonnegative(),
  roads: z.array(roadSchema).default([]),
});
const detailedRouteSchema = z.object({
  result_code: z.number().int(),
  result_msg: z.string().optional(),
  summary: z
    .object({
      distance: z.number().finite().nonnegative(),
      duration: z.number().finite().nonnegative(),
      fare: z
        .object({
          taxi: z.number().finite().nonnegative().optional(),
          toll: z.number().finite().nonnegative().optional(),
        })
        .optional(),
    })
    .optional(),
  sections: z.array(sectionSchema).default([]),
});
const detailedResponseSchema = z.object({
  routes: z.array(detailedRouteSchema).min(1),
});
const destinationRouteSchema = z.object({
  result_code: z.number().int(),
  result_msg: z.string().optional(),
  key: z.string().min(1),
  summary: z
    .object({
      distance: z.number().finite().nonnegative(),
      duration: z.number().finite().nonnegative(),
    })
    .optional(),
});
const destinationsResponseSchema = z.object({
  routes: z.array(destinationRouteSchema),
});

export interface KakaoMobilityPoint {
  name?: string;
  longitude: number;
  latitude: number;
}

export interface KakaoMultiDestinationInput {
  signal?: AbortSignal;
  providerCallBudget?: { remaining: number };
  origin: KakaoMobilityPoint;
  destinations: Array<KakaoMobilityPoint & { key: string }>;
  radiusMeters: number;
  priority: "TIME" | "DISTANCE";
  avoid: string[];
}

export interface KakaoMultiDestinationEntry {
  key: string;
  resultCode: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
  reasonCodes: string[];
}

export interface KakaoDetailedRoute {
  resultCode: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  taxiFareWon?: number;
  tollFareWon?: number;
  coordinates: Array<{ latitude: number; longitude: number }>;
  sections: Array<{ distanceMeters: number; durationSeconds: number }>;
}

export interface KakaoMobilityObservation {
  operation: keyof typeof KAKAO_MOBILITY_PUBLIC_PATHS;
  attempt: number;
  outcome: "succeeded" | "failed" | "timeout";
}

export interface KakaoMobilityClientStats {
  providerCalls: number;
  retries: number;
  timeouts: number;
  providerFailures: number;
}

export interface KakaoMobilityClientOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryCount?: number;
  observe?: (event: KakaoMobilityObservation) => void;
}

export class KakaoMobilityProviderError extends Error {
  constructor(
    readonly code:
      | "BUDGET_EXCEEDED"
      | "UNSUPPORTED_FUTURE"
      | "INVALID_ENDPOINT"
      | "TIMEOUT"
      | "NETWORK"
      | "HTTP_ERROR"
      | "INVALID_RESPONSE",
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "KakaoMobilityProviderError";
  }
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error.name === "AbortError" || error.name === "TimeoutError"),
  );
}

function integer(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new KakaoMobilityProviderError(
      "INVALID_RESPONSE",
      "Kakao Mobility returned an invalid route summary.",
    );
  }
  return Math.round(value);
}

function pointQuery(point: KakaoMobilityPoint): string {
  const name = point.name?.trim();
  return name
    ? `${point.longitude},${point.latitude},name=${name}`
    : `${point.longitude},${point.latitude}`;
}

function geometry(route: z.infer<typeof detailedRouteSchema>) {
  return route.sections.flatMap((section) =>
    section.roads.flatMap((road) => {
      if (road.vertexes.length % 2 !== 0) {
        throw new KakaoMobilityProviderError(
          "INVALID_RESPONSE",
          "Kakao Mobility returned an odd-length vertex array.",
        );
      }
      const points: Array<{ latitude: number; longitude: number }> = [];
      for (let index = 0; index < road.vertexes.length; index += 2) {
        const longitude = road.vertexes[index];
        const latitude = road.vertexes[index + 1];
        if (
          longitude < -180 ||
          longitude > 180 ||
          latitude < -90 ||
          latitude > 90
        ) {
          throw new KakaoMobilityProviderError(
            "INVALID_RESPONSE",
            "Kakao Mobility returned an invalid geometry coordinate.",
          );
        }
        points.push({ latitude, longitude });
      }
      return points;
    }),
  );
}

function normalizeDetailedRoute(
  route: z.infer<typeof detailedRouteSchema>,
  requireGeometry: boolean,
): KakaoDetailedRoute {
  if (route.result_code !== 0 || !route.summary) {
    throw new KakaoMobilityProviderError(
      "INVALID_RESPONSE",
      `Kakao Mobility route result ${route.result_code}.`,
    );
  }
  const coordinates = requireGeometry ? geometry(route) : [];
  if (requireGeometry && coordinates.length < 2) {
    throw new KakaoMobilityProviderError(
      "INVALID_RESPONSE",
      "Kakao Mobility route geometry is missing.",
    );
  }
  return {
    resultCode: route.result_code,
    totalDistanceMeters: integer(route.summary.distance),
    totalDurationSeconds: integer(route.summary.duration),
    taxiFareWon: route.summary.fare?.taxi,
    tollFareWon: route.summary.fare?.toll,
    coordinates,
    sections: route.sections.map((section) => ({
      distanceMeters: integer(section.distance),
      durationSeconds: integer(section.duration),
    })),
  };
}

function futureDepartureTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new KakaoMobilityProviderError(
      "INVALID_RESPONSE",
      "Future departure time is invalid.",
    );
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const valueOf = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${valueOf("year")}${valueOf("month")}${valueOf("day")}${valueOf("hour")}${valueOf("minute")}`;
}

export class KakaoMobilityClient {
  private readonly key: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retryCount: number;
  private readonly observe?: (event: KakaoMobilityObservation) => void;
  private readonly counters: KakaoMobilityClientStats = {
    providerCalls: 0,
    retries: 0,
    timeouts: 0,
    providerFailures: 0,
  };

  constructor(options: KakaoMobilityClientOptions = {}) {
    this.key = options.apiKey ?? getKakaoRestApiKey();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.retryCount = options.retryCount ?? 1;
    this.observe = options.observe;
  }

  stats(): KakaoMobilityClientStats {
    return { ...this.counters };
  }

  private record(event: KakaoMobilityObservation): void {
    this.counters.providerCalls += 1;
    if (event.attempt > 1) this.counters.retries += 1;
    if (event.outcome === "timeout") this.counters.timeouts += 1;
    if (event.outcome !== "succeeded") this.counters.providerFailures += 1;
    this.observe?.(event);
  }

  private async requestJson(
    operation: keyof typeof KAKAO_MOBILITY_PUBLIC_PATHS,
    init: { method: "GET" | "POST"; query?: URLSearchParams; body?: unknown; signal?: AbortSignal; providerCallBudget?: { remaining: number } },
  ): Promise<unknown> {
    const path = KAKAO_MOBILITY_PUBLIC_PATHS[operation];
    assertPublicKakaoMobilityPath(path);
    const url = new URL(path, KAKAO_MOBILITY_PUBLIC_ORIGIN);
    if (init.query) url.search = init.query.toString();
    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      init.signal?.throwIfAborted();
      if (init.providerCallBudget) {
        if (init.providerCallBudget.remaining <= 0) throw new KakaoMobilityProviderError("BUDGET_EXCEEDED", "Route provider request budget exhausted.");
        init.providerCallBudget.remaining--;
      }
      try {
        const response = await this.fetchImpl(url, {
          method: init.method,
          headers: {
            Authorization: `KakaoAK ${this.key}`,
            ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs),
          cache: "no-store",
        });
        if (!response.ok) {
          this.record({ operation, attempt: attempt + 1, outcome: "failed" });
          if (response.status >= 500 && attempt < this.retryCount) continue;
          let unsupported = false;
          if (operation === "future" && (response.status === 400 || response.status === 422)) {
            const body = await response.json().catch(() => null) as { msg?: unknown; message?: unknown } | null;
            const message = String(body?.msg ?? body?.message ?? "");
            unsupported = /departure[_ ]?time|출발.*시간|예측/.test(message) && /invalid|unsupported|range|범위|지원|유효/i.test(message);
          }
          throw new KakaoMobilityProviderError(unsupported ? "UNSUPPORTED_FUTURE" : "HTTP_ERROR", "Kakao Mobility HTTP request failed.", response.status);
        }
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new KakaoMobilityProviderError(
            "INVALID_RESPONSE",
            "Kakao Mobility returned non-JSON data.",
          );
        }
        this.record({ operation, attempt: attempt + 1, outcome: "succeeded" });
        return payload;
      } catch (error) {
        init.signal?.throwIfAborted();
        if (error instanceof KakaoMobilityProviderError) throw error;
        const timeout = isAbortError(error);
        this.record({
          operation,
          attempt: attempt + 1,
          outcome: timeout ? "timeout" : "failed",
        });
        throw new KakaoMobilityProviderError(
          timeout ? "TIMEOUT" : "NETWORK",
          timeout
            ? "Kakao Mobility request timed out."
            : "Kakao Mobility request failed.",
        );
      }
    }
    throw new KakaoMobilityProviderError("NETWORK", "Kakao Mobility request failed.");
  }

  async multiDestination(
    input: KakaoMultiDestinationInput,
  ): Promise<KakaoMultiDestinationEntry[]> {
    const payload = await this.requestJson("destinations", {
      signal: input.signal, providerCallBudget: input.providerCallBudget,
      method: "POST",
      body: {
        origin: {
          x: input.origin.longitude,
          y: input.origin.latitude,
          ...(input.origin.name ? { name: input.origin.name } : {}),
        },
        destinations: input.destinations.map((destination) => ({
          x: destination.longitude,
          y: destination.latitude,
          key: destination.key,
          ...(destination.name ? { name: destination.name } : {}),
        })),
        radius: input.radiusMeters,
        priority: input.priority,
        avoid: [...new Set(input.avoid)].sort(),
      },
    });
    const parsed = destinationsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new KakaoMobilityProviderError(
        "INVALID_RESPONSE",
        "Kakao Mobility returned a malformed multi-destination response.",
      );
    }
    return parsed.data.routes.map((route) => ({
      key: route.key,
      resultCode: route.result_code,
      distanceMeters:
        route.result_code === 0 && route.summary
          ? integer(route.summary.distance)
          : null,
      durationSeconds:
        route.result_code === 0 && route.summary
          ? integer(route.summary.duration)
          : null,
      reasonCodes:
        route.result_code === 0 && route.summary
          ? []
          : [`kakao_result_${route.result_code}`],
    }));
  }

  async pairDirections(input: {
    signal?: AbortSignal;
    providerCallBudget?: { remaining: number };
    origin: KakaoMobilityPoint;
    destination: KakaoMobilityPoint;
    priority: "RECOMMEND" | "TIME" | "DISTANCE";
    avoid: string[];
  }): Promise<KakaoDetailedRoute> {
    const query = new URLSearchParams({
      origin: pointQuery(input.origin),
      destination: pointQuery(input.destination),
      priority: input.priority,
      alternatives: "false",
      road_details: "false",
      summary: "true",
    });
    if (input.avoid.length > 0) query.set("avoid", [...new Set(input.avoid)].sort().join("|"));
    const payload = await this.requestJson("directions", { method: "GET", query, signal: input.signal, providerCallBudget: input.providerCallBudget });
    const parsed = detailedResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new KakaoMobilityProviderError(
        "INVALID_RESPONSE",
        "Kakao Mobility returned a malformed directions response.",
      );
    }
    return normalizeDetailedRoute(parsed.data.routes[0], false);
  }

  async currentDirections(input: {
    signal?: AbortSignal;
    origin: KakaoMobilityPoint;
    destination: KakaoMobilityPoint;
    waypoints: KakaoMobilityPoint[];
    priority: "RECOMMEND" | "TIME" | "DISTANCE";
    avoid: string[];
    includeGeometry: boolean;
  }): Promise<KakaoDetailedRoute> {
    const query = new URLSearchParams({
      origin: pointQuery(input.origin),
      destination: pointQuery(input.destination),
      priority: input.priority,
      alternatives: "false",
      road_details: "false",
      summary: String(!input.includeGeometry),
    });
    if (input.waypoints.length > 0) {
      query.set("waypoints", input.waypoints.map(pointQuery).join("|"));
    }
    if (input.avoid.length > 0) {
      query.set("avoid", [...new Set(input.avoid)].sort().join("|"));
    }
    const payload = await this.requestJson("directions", { method: "GET", query });
    const parsed = detailedResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new KakaoMobilityProviderError(
        "INVALID_RESPONSE",
        "Kakao Mobility returned a malformed directions response.",
      );
    }
    return normalizeDetailedRoute(parsed.data.routes[0], input.includeGeometry);
  }

  async waypointDirections(input: {
    signal?: AbortSignal;
    providerCallBudget?: { remaining: number };
    origin: KakaoMobilityPoint;
    destination: KakaoMobilityPoint;
    waypoints: KakaoMobilityPoint[];
    priority: "RECOMMEND" | "TIME" | "DISTANCE";
    avoid: string[];
    includeGeometry: boolean;
  }): Promise<KakaoDetailedRoute> {
    const payload = await this.requestJson("waypoints", {
      signal: input.signal, providerCallBudget: input.providerCallBudget,
      method: "POST",
      body: {
        origin: { x: input.origin.longitude, y: input.origin.latitude, name: input.origin.name },
        destination: { x: input.destination.longitude, y: input.destination.latitude, name: input.destination.name },
        waypoints: input.waypoints.map((point) => ({
          x: point.longitude,
          y: point.latitude,
          name: point.name,
        })),
        priority: input.priority,
        avoid: [...new Set(input.avoid)].sort(),
        alternatives: false,
        road_details: false,
        summary: !input.includeGeometry,
      },
    });
    const parsed = detailedResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new KakaoMobilityProviderError(
        "INVALID_RESPONSE",
        "Kakao Mobility returned a malformed waypoint response.",
      );
    }
    return normalizeDetailedRoute(parsed.data.routes[0], input.includeGeometry);
  }

  async futureDirections(input: {
    signal?: AbortSignal;
    providerCallBudget?: { remaining: number };
    origin: KakaoMobilityPoint;
    destination: KakaoMobilityPoint;
    waypoints: KakaoMobilityPoint[];
    requestedDepartureAt: string;
    priority: "RECOMMEND" | "TIME" | "DISTANCE";
    avoid: string[];
    includeGeometry: boolean;
  }): Promise<KakaoDetailedRoute> {
    const query = new URLSearchParams({
      origin: pointQuery(input.origin),
      destination: pointQuery(input.destination),
      departure_time: futureDepartureTime(input.requestedDepartureAt),
      priority: input.priority,
      alternatives: "false",
      road_details: "false",
      summary: String(!input.includeGeometry),
    });
    if (input.waypoints.length > 0) {
      query.set("waypoints", input.waypoints.map(pointQuery).join("|"));
    }
    if (input.avoid.length > 0) query.set("avoid", [...new Set(input.avoid)].sort().join("|"));
    const payload = await this.requestJson("future", { method: "GET", query, signal: input.signal, providerCallBudget: input.providerCallBudget });
    const parsed = detailedResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new KakaoMobilityProviderError(
        "INVALID_RESPONSE",
        "Kakao Mobility returned a malformed future response.",
      );
    }
    return normalizeDetailedRoute(parsed.data.routes[0], input.includeGeometry);
  }
}

function serializeLegacyPoint(point: KakaoDirectionsRequest["origin"]): KakaoMobilityPoint {
  return { name: point.name, longitude: point.x, latitude: point.y };
}

export async function getDirections(
  request: KakaoDirectionsRequest,
  options: KakaoMobilityClientOptions = {},
): Promise<KakaoDrivingRoute> {
  try {
    const route = await new KakaoMobilityClient(options).currentDirections({
      origin: serializeLegacyPoint(request.origin),
      destination: serializeLegacyPoint(request.destination),
      waypoints: request.waypoints.map(serializeLegacyPoint),
      priority: "RECOMMEND",
      avoid: [],
      includeGeometry: true,
    });
    return {
      totalDistanceMeters: route.totalDistanceMeters,
      totalDurationSeconds: route.totalDurationSeconds,
      taxiFareWon: route.taxiFareWon,
      tollFareWon: route.tollFareWon,
      coordinates: route.coordinates,
      sections: route.sections,
    };
  } catch (error) {
    if (error instanceof KakaoMobilityProviderError) {
      if (error.code === "HTTP_ERROR") {
        const status = error.httpStatus ?? /HTTP (\d+)/.exec(error.message)?.[1] ?? "unknown";
        throw new ProviderResponseError(
          `Kakao Mobility가 HTTP ${status} 상태로 실패했습니다.`,
        );
      }
      if (error.code === "TIMEOUT") {
        throw new ProviderResponseError(
          "Kakao Mobility 요청 시간이 초과되었습니다.",
        );
      }
    }
    throw new ProviderResponseError(
      error instanceof Error ? error.message : "Kakao Mobility directions failed.",
    );
  }
}
