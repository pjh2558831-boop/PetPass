import { describe, expect, it, vi } from "vitest";
import {
  assertPublicKakaoMobilityPath,
  KakaoMobilityClient,
  KakaoMobilityProviderError,
  KAKAO_MOBILITY_PUBLIC_ORIGIN,
  KAKAO_MOBILITY_PUBLIC_PATHS,
  type KakaoDetailedRoute,
  type KakaoMultiDestinationInput,
} from "@/lib/kakao/directions";
import {
  KakaoTravelTimeProvider,
  createRequestPromiseMemo,
  type KakaoTravelTimeClient,
} from "@/lib/kakao/travel-time-provider";
import {
  MemoryTravelTimeCache,
  serializeTravelEdgeCacheKey,
} from "@/lib/travel/cache";
import { TRAVEL_MATRIX_V1_CONFIG } from "@/lib/travel/config/travel-matrix-v1";
import type {
  OrderedRouteValidationInput,
  TravelEdgeCacheKey,
  TravelMatrixInput,
  TravelNode,
} from "@/lib/travel/types";

const NOW = new Date("2026-08-12T03:00:00.000Z");

function departure(overrides: Partial<TravelNode> = {}): TravelNode {
  return {
    id: "origin",
    kind: "departure",
    name: "Busan origin",
    latitude: 35.1796,
    longitude: 129.0756,
    ...overrides,
  };
}

function place(index: number, overrides: Partial<TravelNode> = {}): TravelNode {
  return {
    id: `place-${String(index).padStart(2, "0")}`,
    kind: "place",
    name: `Place ${index}`,
    latitude: 35.1796 + index * 0.002,
    longitude: 129.0756 + index * 0.002,
    ...overrides,
  };
}

function input(count: number, overrides: Partial<TravelMatrixInput> = {}): TravelMatrixInput {
  return {
    departure: departure(),
    candidates: Array.from({ length: count }, (_, index) => place(index + 1)),
    travelMode: "driving",
    priority: "TIME",
    avoid: [],
    requestedDepartureAt: null,
    ...overrides,
  };
}

function value(originLongitude: number, destinationLongitude: number): number {
  return Math.round(
    1_000 +
      (originLongitude - 129) * 100_000 +
      (destinationLongitude - 129) * 10_000,
  );
}

function detailed(distance: number, sections = 1): KakaoDetailedRoute {
  return {
    resultCode: 0,
    totalDistanceMeters: distance,
    totalDurationSeconds: distance + 100,
    coordinates: [
      { latitude: 35.17, longitude: 129.07 },
      { latitude: 35.18, longitude: 129.08 },
    ],
    sections: Array.from({ length: sections }, (_, index) => ({
      distanceMeters: distance + index,
      durationSeconds: distance + index + 100,
    })),
  };
}

class FakeClient implements KakaoTravelTimeClient {
  readonly multiCalls: KakaoMultiDestinationInput[] = [];
  readonly pairCalls: Array<{ origin: { longitude: number }; destination: { longitude: number } }> = [];
  readonly waypointCalls: Array<{ waypoints: unknown[]; destination: unknown }> = [];
  readonly futureCalls: Array<{ waypoints: unknown[]; requestedDepartureAt: string }> = [];
  missingKeys = new Set<string>();
  failedKeys = new Set<string>();
  failMulti = false;
  failPairs = false;
  routeSections = 1;

  async multiDestination(request: KakaoMultiDestinationInput) {
    this.multiCalls.push(structuredClone(request));
    if (this.failMulti) throw new KakaoMobilityProviderError("TIMEOUT", "timeout");
    return request.destinations
      .filter((destination) => !this.missingKeys.has(destination.key))
      .map((destination) => {
        const failed = this.failedKeys.has(destination.key);
        const distance = value(request.origin.longitude, destination.longitude);
        return {
          key: destination.key,
          resultCode: failed ? 104 : 0,
          distanceMeters: failed ? null : distance,
          durationSeconds: failed ? null : distance + 100,
          reasonCodes: failed ? ["kakao_result_104"] : [],
        };
      });
  }

  async pairDirections(request: {
    origin: { longitude: number };
    destination: { longitude: number };
  }) {
    this.pairCalls.push(structuredClone(request));
    if (this.failPairs) throw new KakaoMobilityProviderError("TIMEOUT", "timeout");
    return detailed(value(request.origin.longitude, request.destination.longitude));
  }

  async waypointDirections(request: {
    waypoints: unknown[];
    destination: unknown;
  }) {
    this.waypointCalls.push(structuredClone(request));
    return detailed(2_000, this.routeSections);
  }

  async futureDirections(request: {
    waypoints: unknown[];
    requestedDepartureAt: string;
  }) {
    this.futureCalls.push(structuredClone(request));
    return detailed(2_500, this.routeSections);
  }
}

function provider(
  client: FakeClient,
  cache = new MemoryTravelTimeCache(),
  now = () => NOW,
) {
  let tick = 0;
  return new KakaoTravelTimeProvider({
    client,
    cache,
    now,
    monotonicNow: () => tick++,
  });
}

function validationInput(stops = 3): OrderedRouteValidationInput {
  return {
    departure: departure(),
    orderedStops: Array.from({ length: stops }, (_, index) => place(index + 1)),
    requestedDepartureAt: null,
    priority: "TIME",
    avoid: [],
    includeGeometry: true,
  };
}

describe("Kakao public Mobility contract", () => {
  it("keeps every configured provider path on the public v1 contract", () => {
    expect(KAKAO_MOBILITY_PUBLIC_ORIGIN).toBe("https://apis-navi.kakaomobility.com");
    expect(KAKAO_MOBILITY_PUBLIC_PATHS).toEqual({
      directions: "/v1/directions",
      destinations: "/v1/destinations/directions",
      waypoints: "/v1/waypoints/directions",
      future: "/v1/future/directions",
    });
    expect(Object.values(KAKAO_MOBILITY_PUBLIC_PATHS)).not.toContain(
      expect.stringContaining("affiliate"),
    );
    expect(Object.values(KAKAO_MOBILITY_PUBLIC_PATHS)).not.toContain(
      expect.stringContaining("directions100"),
    );
  });

  it.each([
    "/affiliate/v1/destinations/directions100",
    "/v1/directions100",
    "/v1/matrix/directions",
    "https://attacker.example/v1/directions",
  ])("rejects non-public or injectable endpoint %s", (path) => {
    expect(() => assertPublicKakaoMobilityPath(path)).toThrowError(
      expect.objectContaining({ code: "INVALID_ENDPOINT" }),
    );
  });

  it("posts longitude as x and latitude as y without placing the key in the URL", async () => {
    const fetchImpl = vi.fn(async (request: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(request));
      expect(url.pathname).toBe("/v1/destinations/directions");
      expect(url.search).toBe("");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        Authorization: "KakaoAK server-key",
        "Content-Type": "application/json",
      });
      const body = JSON.parse(String(init?.body));
      expect(body.origin).toMatchObject({ x: 129.0756, y: 35.1796 });
      expect(body.destinations[0]).toMatchObject({ x: 129.08, y: 35.18, key: "p1" });
      expect(body.radius).toBe(10_000);
      return Response.json({
        routes: [
          { key: "p1", result_code: 0, summary: { distance: 100, duration: 20 } },
        ],
      });
    }) as unknown as typeof fetch;
    const client = new KakaoMobilityClient({ apiKey: "server-key", fetchImpl });
    await expect(
      client.multiDestination({
        origin: { longitude: 129.0756, latitude: 35.1796 },
        destinations: [{ key: "p1", longitude: 129.08, latitude: 35.18 }],
        radiusMeters: 10_000,
        priority: "TIME",
        avoid: [],
      }),
    ).resolves.toMatchObject([{ key: "p1", distanceMeters: 100 }]);
  });

  it("uses public waypoint POST and future GET operations", async () => {
    const calls: Array<{ path: string; method: string | undefined; body: unknown }> = [];
    const fetchImpl = vi.fn(async (request: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(request));
      calls.push({ path: `${url.pathname}${url.search}`, method: init?.method, body: init?.body });
      return Response.json({
        routes: [
          {
            result_code: 0,
            summary: { distance: 100, duration: 20 },
            sections: [{ distance: 100, duration: 20, roads: [{ vertexes: [129, 35, 129.1, 35.1] }] }],
          },
        ],
      });
    }) as unknown as typeof fetch;
    const client = new KakaoMobilityClient({ apiKey: "server-key", fetchImpl });
    const common = {
      origin: { longitude: 129, latitude: 35 },
      destination: { longitude: 129.1, latitude: 35.1 },
      waypoints: [],
      priority: "TIME" as const,
      avoid: [],
      includeGeometry: true,
    };
    await client.waypointDirections(common);
    await client.futureDirections({
      ...common,
      requestedDepartureAt: "2026-08-13T03:30:00.000Z",
    });
    expect(calls[0]).toMatchObject({ path: "/v1/waypoints/directions", method: "POST" });
    expect(calls[1].path).toContain("/v1/future/directions?");
    expect(calls[1].path).toContain("departure_time=202608131230");
    expect(calls[1].method).toBe("GET");
  });

  it("rejects malformed odd-length geometry and records retry attempts", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return new Response("temporary", { status: 500 });
      return Response.json({
        routes: [
          {
            result_code: 0,
            summary: { distance: 10, duration: 5 },
            sections: [{ distance: 10, duration: 5, roads: [{ vertexes: [129, 35, 129.1] }] }],
          },
        ],
      });
    }) as unknown as typeof fetch;
    const client = new KakaoMobilityClient({ apiKey: "server-key", fetchImpl, retryCount: 1 });
    await expect(
      client.waypointDirections({
        origin: { longitude: 129, latitude: 35 },
        destination: { longitude: 129.1, latitude: 35.1 },
        waypoints: [],
        priority: "TIME",
        avoid: [],
        includeGeometry: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(client.stats()).toMatchObject({ providerCalls: 2, retries: 1, providerFailures: 1 });
  });
});

describe("asymmetric travel matrix v1", () => {
  it.each([
    [1, 2, 2],
    [6, 42, 7],
    [15, 240, 16],
  ])("resolves %i candidates with %i directed edges in %i batches", async (count, edges, batches) => {
    const client = new FakeClient();
    const result = await provider(client).buildMatrix(input(count));
    expect(result.complete).toBe(true);
    expect(result.diagnostics).toMatchObject({
      nodeCount: count + 1,
      expectedDirectedEdges: edges,
      resolvedEdges: edges,
      unresolvedEdges: 0,
      multiDestinationRequests: batches,
      directionsFallbackRequests: 0,
    });
    expect(client.multiCalls).toHaveLength(batches);
    expect(client.multiCalls.every((call) => call.radiusMeters <= 10_000)).toBe(true);
    expect(client.multiCalls.every((call) => call.destinations.length <= 30)).toBe(true);
  });

  it("keeps stable node order, zero diagonals, and independently resolved reverse edges", async () => {
    const client = new FakeClient();
    const request = input(3);
    request.candidates.reverse();
    const result = await provider(client).buildMatrix(request);
    expect(result.nodeIds).toEqual(["origin", "place-01", "place-02", "place-03"]);
    for (const id of result.nodeIds) {
      expect(result.edges[id][id]).toMatchObject({
        distanceMeters: 0,
        durationSeconds: 0,
        temporalBasis: "traffic_independent",
      });
    }
    expect(result.edges.origin["place-01"].distanceMeters).not.toBe(
      result.edges["place-01"].origin.distanceMeters,
    );
  });

  it("rejects duplicate IDs, invalid coordinates, excess candidates, and client-selected options", async () => {
    const service = provider(new FakeClient());
    await expect(
      service.buildMatrix(input(2, { candidates: [place(1), place(2, { id: "place-01" })] })),
    ).rejects.toThrow("unique");
    await expect(
      service.buildMatrix(input(1, { candidates: [place(1, { latitude: 91 })] })),
    ).rejects.toThrow("invalid Korean coordinate");
    await expect(service.buildMatrix(input(16))).rejects.toThrow("limit exceeded");
    await expect(service.buildMatrix(input(1, { avoid: ["arbitrary"] }))).rejects.toThrow(
      "Unsupported",
    );
  });

  it("retains successful multi-destination entries and falls back only missing or failed entries", async () => {
    const client = new FakeClient();
    client.missingKeys.add("place-01");
    client.failedKeys.add("place-02");
    const result = await provider(client).buildMatrix(input(2));
    expect(result.complete).toBe(true);
    expect(result.diagnostics.directionsFallbackRequests).toBe(4);
    expect(result.edges.origin["place-01"].source).toBe("kakao_directions_live");
    expect(result.edges.origin["place-02"].source).toBe("kakao_directions_live");
    expect(result.edges["place-01"].origin.source).toBe(
      "kakao_multi_destination_live",
    );
  });

  it("uses directed pair fallback outside 10km and never fabricates Haversine road values", async () => {
    const client = new FakeClient();
    const far = place(1, { latitude: 35.35, longitude: 129.25 });
    const result = await provider(client).buildMatrix(input(1, { candidates: [far] }));
    expect(result.diagnostics).toMatchObject({
      multiDestinationRequests: 0,
      directionsFallbackRequests: 2,
      resolvedEdges: 2,
    });
    expect(result.edges.origin[far.id]).toMatchObject({
      source: "kakao_directions_live",
      status: "resolved",
    });
    expect(result.edges.origin[far.id].lowerBoundMeters).toBeGreaterThan(10_000);
  });

  it("derives enough pair fallback budget to complete an eleven-node partial batch matrix", async () => {
    const client = new FakeClient();
    const request = input(10);
    for (const candidate of request.candidates.slice(0, 3)) client.missingKeys.add(candidate.id);

    const result = await provider(client).buildMatrix(request);

    expect(result.diagnostics).toMatchObject({
      nodeCount: 11,
      expectedDirectedEdges: 110,
      resolvedEdges: 110,
      unresolvedEdges: 0,
      multiDestinationRequests: 11,
      directionsFallbackRequests: 30,
      budgetExceeded: false,
    });
    expect(result.complete).toBe(true);
  });

  it("bounds a matrix whose derived provider budget cannot cover every fallback", async () => {
    const client = new FakeClient();
    const candidates = Array.from({ length: 15 }, (_, index) =>
      place(index + 1, {
        latitude: 37,
        longitude: 125 + index * 0.2,
      }),
    );
    const result = await provider(client).buildMatrix(input(15, { candidates }));
    expect(result.diagnostics.directionsFallbackRequests).toBeGreaterThan(24);
    expect(result.diagnostics.directionsFallbackRequests).toBeLessThanOrEqual(
      TRAVEL_MATRIX_V1_CONFIG.maxProviderRequestsPerMatrix,
    );
    expect(result.diagnostics.budgetExceeded).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.diagnostics.unresolvedEdges).toBeGreaterThan(0);
    const everyEdge = result.nodeIds.flatMap((from) =>
      result.nodeIds.filter((to) => to !== from).map((to) => result.edges[from][to]),
    );
    expect(everyEdge).toHaveLength(240);
    expect(
      everyEdge
        .filter((edge) => edge.status !== "resolved")
        .every((edge) => edge.distanceMeters === null && edge.lowerBoundMeters !== null),
    ).toBe(true);
  });

  it("resolves required directed edges before optional fallback edges", async () => {
    const client = new FakeClient();
    const candidates = Array.from({ length: 15 }, (_, index) =>
      place(index + 1, {
        latitude: 37,
        longitude: 125 + index * 0.2,
      }),
    );
    const required = { fromId: "place-15", toId: "origin" };
    const result = await provider(client).buildMatrix(input(15, {
      candidates,
      requiredDirectedEdges: [required],
    }));

    expect(result.edges[required.fromId][required.toId]).toMatchObject({
      status: "resolved",
      source: "kakao_directions_live",
    });
    expect(result.diagnostics.budgetExceeded).toBe(true);
  });

  it("merges identical provider work across concurrent matrix builds", async () => {
    const client = new FakeClient();
    const original = client.multiDestination.bind(client);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    client.multiDestination = async (request) => {
      const response = await original(request);
      await gate;
      return response;
    };
    const service = provider(client);
    const first = service.buildMatrix(input(2));
    const second = service.buildMatrix(input(2));
    await vi.waitFor(() => expect(client.multiCalls.length).toBeGreaterThan(0));
    release();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.complete).toBe(true);
    expect(secondResult.complete).toBe(true);
    expect(client.multiCalls).toHaveLength(3);
    expect(firstResult.diagnostics.requestCacheHits + secondResult.diagnostics.requestCacheHits)
      .toBe(3);
  });

  it("surfaces provider timeouts without demo or estimated driving values", async () => {
    const client = new FakeClient();
    client.failMulti = true;
    client.failPairs = true;
    const result = await provider(client).buildMatrix(input(1));
    expect(result.complete).toBe(false);
    expect(result.diagnostics).toMatchObject({
      resolvedEdges: 0,
      unresolvedEdges: 2,
      timeouts: 4,
      providerFailures: 4,
    });
    expect(result.edges.origin["place-01"]).toMatchObject({
      status: "provider_unavailable",
      distanceMeters: null,
      durationSeconds: null,
      source: "haversine_lower_bound",
      confidence: "estimated_only",
    });
  });

  it("deduplicates concurrent request-scope operations and does not poison later retries", async () => {
    let hits = 0;
    let calls = 0;
    const memo = createRequestPromiseMemo(() => {
      hits += 1;
    });
    const factory = async () => {
      calls += 1;
      await Promise.resolve();
      return 42;
    };
    await expect(Promise.all([memo("same", factory), memo("same", factory)])).resolves.toEqual([
      42,
      42,
    ]);
    expect({ hits, calls }).toEqual({ hits: 1, calls: 1 });

    const rejected = vi.fn(async () => {
      throw new Error("temporary");
    });
    await expect(memo("failure", rejected)).rejects.toThrow("temporary");
    await expect(memo("failure", async () => 7)).resolves.toBe(7);
  });
});

describe("travel edge cache boundaries", () => {
  it("keys by directed normalized coordinates, options, provider version, and traffic bucket only", () => {
    const key = serializeTravelEdgeCacheKey({
      origin: "129.0756,35.1796",
      destination: "129.0776,35.1816",
      priority: "TIME",
      avoid: ["toll", "ferries", "toll"],
      travelMode: "driving",
      providerContractVersion: "kakao-mobility-public-v1",
      trafficTimeBucket: "current:123",
    });
    expect(key).toContain("kakao-mobility-public-v1");
    expect(key).toContain("current:123");
    expect(key).toContain('"avoid":["ferries","toll"]');
    expect(key).not.toMatch(/name|user|Authorization|KakaoAK/i);
    expect(TRAVEL_MATRIX_V1_CONFIG).toMatchObject({
      coordinatePrecisionDigits: 4,
      roadDistanceTtlMs: 604_800_000,
      currentTrafficDurationTtlMs: 900_000,
      futureDurationTtlMs: 900_000,
      negativeCacheTtlMs: 120_000,
    });
  });

  it("uses process-memory cache on warm replay and normalizes coordinates", async () => {
    const cache = new MemoryTravelTimeCache();
    const coldClient = new FakeClient();
    const cold = await provider(coldClient, cache).buildMatrix(input(1));
    expect(cold.diagnostics.providerCalls).toBe(2);

    const warmClient = new FakeClient();
    const changed = input(1, {
      departure: departure({ latitude: 35.179604, longitude: 129.075604 }),
      candidates: [place(1, { latitude: 35.181604, longitude: 129.077604 })],
    });
    const warm = await provider(warmClient, cache).buildMatrix(changed);
    expect(warm.diagnostics).toMatchObject({ providerCalls: 0, persistentCacheHits: 2 });
    expect(warm.complete).toBe(true);
  });

  it("retains fresh road distance but refreshes stale traffic duration", async () => {
    const cache = new MemoryTravelTimeCache();
    await provider(new FakeClient(), cache).buildMatrix(input(1));
    const later = new Date(NOW.getTime() + 20 * 60 * 1_000);
    const failing = new FakeClient();
    failing.failMulti = true;
    failing.failPairs = true;
    const result = await provider(failing, cache, () => later).buildMatrix(input(1));
    expect(result.complete).toBe(false);
    expect(result.edges.origin["place-01"]).toMatchObject({
      status: "provider_unavailable",
      durationSeconds: null,
      source: "persistent_cache",
    });
    expect(result.edges.origin["place-01"].distanceMeters).not.toBeNull();
  });

  it("supports fresh duration with stale distance and keeps the negative cache under two minutes", async () => {
    const cache = new MemoryTravelTimeCache();
    const origin = departure();
    const destination = place(1);
    const key: TravelEdgeCacheKey = {
      origin: `${origin.longitude.toFixed(4)},${origin.latitude.toFixed(4)}`,
      destination: `${destination.longitude.toFixed(4)},${destination.latitude.toFixed(4)}`,
      priority: "TIME",
      avoid: [],
      travelMode: "driving",
      providerContractVersion: TRAVEL_MATRIX_V1_CONFIG.providerContractVersion,
      trafficTimeBucket: `current:${Math.floor(
        NOW.getTime() / TRAVEL_MATRIX_V1_CONFIG.currentTrafficDurationTtlMs,
      )}`,
    };
    await cache.setEdge(key, {
      distanceMeters: 999,
      durationSeconds: 111,
      temporalBasis: "current_traffic",
      distanceFetchedAt: new Date(
        NOW.getTime() - TRAVEL_MATRIX_V1_CONFIG.roadDistanceTtlMs - 1,
      ).toISOString(),
      durationFetchedAt: NOW.toISOString(),
      negativeUntil: null,
      reasonCodes: [],
    });
    const failing = new FakeClient();
    failing.failMulti = true;
    failing.failPairs = true;
    const first = await provider(failing, cache).buildMatrix(input(1));
    expect(first.edges.origin["place-01"]).toMatchObject({
      distanceMeters: null,
      durationSeconds: 111,
      status: "provider_unavailable",
    });
    const calls = failing.multiCalls.length + failing.pairCalls.length;
    const replay = await provider(failing, cache).buildMatrix(input(1));
    expect(replay.diagnostics.persistentCacheHits).toBe(2);
    expect(failing.multiCalls.length + failing.pairCalls.length).toBe(calls);
  });

  it("includes route options in the cache key", async () => {
    const cache = new MemoryTravelTimeCache();
    await provider(new FakeClient(), cache).buildMatrix(input(1));
    const secondClient = new FakeClient();
    const second = await provider(secondClient, cache).buildMatrix(input(1, { avoid: ["toll"] }));
    expect(second.diagnostics.providerCalls).toBe(2);
  });
});

describe("ordered route validation", () => {
  it("uses the public waypoint operation, preserves order, and does not return to origin", async () => {
    const client = new FakeClient();
    client.routeSections = 3;
    const result = await provider(client).validateOrderedRoute(validationInput(3));
    expect(result).toMatchObject({
      status: "validated",
      temporalBasis: "current_traffic",
      totalDistanceMeters: 2_000,
      diagnostics: { providerOperation: "waypoints", providerCalls: 1 },
    });
    expect(result.sections.map((section) => [section.fromId, section.toId])).toEqual([
      ["origin", "place-01"],
      ["place-01", "place-02"],
      ["place-02", "place-03"],
    ]);
    expect(client.waypointCalls[0].waypoints).toHaveLength(2);
    expect(client.waypointCalls[0].destination).toMatchObject({ name: "Place 3" });
  });

  it("validates an explicit round trip by returning to the departure node", async () => {
    const client = new FakeClient();
    client.routeSections = 4;
    const request = validationInput(3);
    request.roundTrip = true;
    const result = await provider(client).validateOrderedRoute(request);
    expect(result.status).toBe("validated");
    expect(result.sections.map((section) => [section.fromId, section.toId])).toEqual([
      ["origin", "place-01"],
      ["place-01", "place-02"],
      ["place-02", "place-03"],
      ["place-03", "origin"],
    ]);
    expect(client.waypointCalls[0].waypoints).toHaveLength(3);
    expect(client.waypointCalls[0].destination).toMatchObject({ name: "Busan origin" });
  });

  it("uses future directions for a valid five-stop route", async () => {
    const client = new FakeClient();
    client.routeSections = 5;
    const request = validationInput(5);
    request.requestedDepartureAt = "2026-08-13T03:30:00.000Z";
    const result = await provider(client).validateOrderedRoute(request);
    expect(result).toMatchObject({
      status: "validated",
      temporalBasis: "future_departure",
      diagnostics: { providerOperation: "future_directions" },
    });
    expect(client.futureCalls[0].waypoints).toHaveLength(4);
    expect(client.waypointCalls).toHaveLength(0);
  });

  it("does not silently rewrite invalid time and deliberately uses current routing for past time", async () => {
    const client = new FakeClient();
    client.routeSections = 1;
    const service = provider(client);
    const invalid = validationInput(1);
    invalid.requestedDepartureAt = "not-a-date";
    await expect(service.validateOrderedRoute(invalid)).resolves.toMatchObject({
      status: "invalid_route",
      reasonCodes: ["invalid_requested_departure_time"],
      diagnostics: { providerCalls: 0 },
    });
    const past = validationInput(1);
    past.requestedDepartureAt = "2026-08-11T03:00:00.000Z";
    await expect(service.validateOrderedRoute(past)).resolves.toMatchObject({
      status: "validated",
      reasonCodes: ["requested_departure_not_future_current_used"],
      diagnostics: { providerOperation: "waypoints" },
    });
  });

  it("fails closed on partial sections and provider failures", async () => {
    const partialClient = new FakeClient();
    partialClient.routeSections = 1;
    await expect(
      provider(partialClient).validateOrderedRoute(validationInput(2)),
    ).resolves.toMatchObject({
      status: "partial_route",
      totalDistanceMeters: null,
      sections: [],
      geometry: [],
    });

    const failedClient = new FakeClient();
    failedClient.waypointDirections = async () => {
      throw new KakaoMobilityProviderError("TIMEOUT", "timeout");
    };
    await expect(
      provider(failedClient).validateOrderedRoute(validationInput(1)),
    ).resolves.toMatchObject({
      status: "provider_unavailable",
      totalDistanceMeters: null,
      geometry: [],
    });
  });

  it("caches normalized final validation for at most the traffic TTL", async () => {
    const client = new FakeClient();
    client.routeSections = 1;
    const service = provider(client);
    const first = await service.validateOrderedRoute(validationInput(1));
    const second = await service.validateOrderedRoute(validationInput(1));
    expect(first.diagnostics.cacheHit).toBe(false);
    expect(second.diagnostics).toMatchObject({ cacheHit: true, providerCalls: 0 });
    expect(client.waypointCalls).toHaveLength(1);
  });
});
