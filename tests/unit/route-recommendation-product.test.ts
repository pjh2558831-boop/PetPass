import { describe, expect, it, vi } from "vitest";
import { createRouteRecommendationHandler } from "@/app/api/itineraries/generate/handler";
import {
  isRecommendationAnalyticsEvent,
  recordRecommendationAnalytics,
} from "@/lib/recommendation/analytics";
import {
  recommendationReasonCopy,
  recommendationWarningCopy,
} from "@/lib/recommendation/recommendation-copy";
import { recommendationFailure } from "@/lib/recommendation/recommendation-errors";
import { routeRecommendationRequestSchema } from "@/lib/recommendation/recommendation-request";
import {
  routeRecommendationReadyResponseSchema,
  routeRecommendationResponseSchema,
} from "@/lib/recommendation/recommendation-response";
import { createRouteRecommendationRequest } from "@/lib/recommendation/recommendation-ui-request";
import {
  loadSavedRouteRecommendation,
  saveRouteRecommendation,
} from "@/lib/storage/recommendation-storage";
import type { StorageLike } from "@/lib/storage/versioned-storage";
import type { PetProfile, TravelPreferences } from "@/types/pet";
import type {
  ProductRouteV1,
  RouteRecommendationReadyResponseV1,
  RouteRecommendationRequest,
} from "@/types/recommendation";

const VALID_REQUEST: RouteRecommendationRequest = {
  departure: {
    label: "부산역",
    latitude: 35.115,
    longitude: 129.04,
    source: "kakao_place_search",
  },
  trip: {
    regionId: "busan",
    districtId: null,
    date: "2026-08-15",
    startTime: "10:00",
    tripType: "day_trip",
    tripPace: "balanced",
    selectedCategories: ["attraction", "food"],
    roundTrip: false,
  },
  pet: {
    name: "보리",
    species: "DOG",
    size: "SMALL",
    availableEquipment: { carrier: true, leash: true, muzzle: false },
    acceptsOutdoorOnlyPlaces: false,
  },
};

const ROUTE: ProductRouteV1 = {
  id: "optimized:1001",
  kind: "optimized",
  label: "추천 일정",
  routeSummary: {
    startAt: "2026-08-15T01:00:00.000Z",
    endAt: "2026-08-15T04:00:00.000Z",
    stopCount: 1,
    totalDistanceMeters: 12_340,
    totalDrivingSeconds: 1_800,
    totalVisitSeconds: 5_400,
    totalWaitSeconds: 0,
  },
  temporalBasis: {
    searchMatrix: "traffic_independent",
    finalRoute: "current_traffic",
  },
  stops: [
    {
      placeId: "1001",
      sequence: 1,
      title: "공식 관광지",
      address: "부산광역시",
      coordinates: { latitude: 35.16, longitude: 129.16 },
      category: "attraction",
      arrivalAt: "2026-08-15T01:30:00.000Z",
      visitStartsAt: "2026-08-15T01:30:00.000Z",
      departureAt: "2026-08-15T03:00:00.000Z",
      dwellMinutes: 90,
      driveSecondsFromPrevious: 1_800,
      distanceMetersFromPrevious: 12_340,
      source: "tourism_service2",
      sourceLabel: "한국관광공사",
      petAssessment: "allowed",
      mandatoryConditions: [],
      informationTrust: "high",
      licensingStatus: "not_applicable",
      operatingHoursWarnings: [],
      inclusionReasonCodes: ["matches_requested_category"],
      orderingReasonCodes: ["shorter_next_drive"],
      warningCodes: [],
      evidence: [
        { field: "etcAcmpyInfo", label: "기타 동반 정보", originalText: "반려동물 동반 가능" },
      ],
    },
  ],
  geometry: [
    { latitude: 35.115, longitude: 129.04 },
    { latitude: 35.16, longitude: 129.16 },
  ],
};

const READY: RouteRecommendationReadyResponseV1 = {
  status: "ready",
  apiVersion: "route-recommendation-response-v1",
  engineVersion: "petpass-route-engine-v1",
  objectiveVersion: "route-objective-v1",
  solverVersion: "route-solver-v1",
  editSessionId: "792f3903-b879-4d53-93ba-85aa7d52a27f",
  requestSummary: {
    departureLabel: "부산역",
    tripDate: "2026-08-15",
    startTime: "10:00",
    tripType: "day_trip",
    tripPace: "balanced",
    selectedCategories: ["attraction", "food"],
    roundTrip: false,
  },
  optimality: "optimal_within_candidate_set_current_matrix",
  route: ROUTE,
  alternatives: [],
  excludedHighlights: [],
  warnings: [],
};

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItemCalls = 0;
  getItem(key: string) {
    this.getItemCalls += 1;
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

class ThrowingStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error("storage unavailable");
  }
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/itineraries/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Stage 5 recommendation product contract", () => {
  it("maps the combined form exactly, including departure source, pace, and deduped categories", () => {
    const profile: PetProfile = {
      id: "pet",
      name: " 보리 ",
      species: "DOG",
      size: "SMALL",
      hasCarrier: true,
      hasLeash: true,
      hasMuzzle: false,
      acceptsOutdoorOnly: false,
    };
    const preferences: TravelPreferences = {
      regionCode: "26",
      regionName: "부산",
      districtCode: "350",
      tripDate: "2026-08-15",
      tripType: "DAY_TRIP",
      tripPace: "packed",
      startTime: "10:00",
      preferredCategories: ["RESTAURANT", "CAFE", "WALK"],
      includeShopping: true,
      roundTrip: true,
      environmentPreference: "indoor_preferred",
      departure: {
        label: "지도 출발지",
        source: "map_selection",
        coordinates: { latitude: 35.1, longitude: 129.1 },
      },
    };
    expect(createRouteRecommendationRequest(profile, preferences)).toEqual({
      departure: {
        label: "지도 출발지",
        latitude: 35.1,
        longitude: 129.1,
        source: "map_selection",
      },
      trip: {
        regionId: "busan",
        districtId: "350",
        date: "2026-08-15",
        startTime: "10:00",
        tripType: "day_trip",
        tripPace: "packed",
        selectedCategories: ["food", "leisure", "shopping"],
        roundTrip: true,
        environmentPreference: "indoor_preferred",
        travelMode: "driving",
      },
      pet: {
        name: "보리",
        species: "DOG",
        size: "SMALL",
        availableEquipment: { carrier: true, leash: true, muzzle: false },
        acceptsOutdoorOnlyPlaces: false,
      },
      personalization: {
        petCount: 1,
        petActivityLevel: "moderate",
        walkingTolerance: "moderate",
        crowdPreference: "any",
        tripMood: "balanced",
        categoryPriorities: {},
        recentRouteSignatures: [],
        recentlySelectedCandidateIds: [],
        explicitlyExcludedPlaceIds: [],
        rerollVariant: 0,
      },
    });
  });

  it("defaults indoor and outdoor preference to neutral any", () => {
    const request = createRouteRecommendationRequest(
      {
        id: "pet",
        name: "보리",
        species: "DOG",
        size: "SMALL",
        hasCarrier: true,
        hasLeash: true,
        hasMuzzle: false,
        acceptsOutdoorOnly: false,
      },
      {
        regionCode: "26",
        regionName: "부산",
        tripDate: "2026-08-15",
        tripType: "DAY_TRIP",
        tripPace: "balanced",
        startTime: "10:00",
        preferredCategories: ["WALK"],
        departure: {
          label: "부산역",
          coordinates: { latitude: 35.115, longitude: 129.04 },
        },
      },
    );

    expect(request.trip.environmentPreference).toBe("any");
  });

  it("requires a resolved departure before submission", () => {
    expect(() =>
      createRouteRecommendationRequest(
        { ...VALID_REQUEST.pet, id: "pet", hasCarrier: true, hasLeash: true, hasMuzzle: false, acceptsOutdoorOnly: false } as PetProfile,
        { regionCode: "26", regionName: "부산", tripDate: "2026-08-15", tripType: "DAY_TRIP", tripPace: "relaxed", startTime: "10:00", preferredCategories: ["WALK"] },
      ),
    ).toThrow("resolved departure");
  });

  it.each([
    ["missing departure", { ...VALID_REQUEST, departure: undefined }],
    ["invalid coordinates", { ...VALID_REQUEST, departure: { ...VALID_REQUEST.departure, latitude: 120 } }],
    ["invalid date", { ...VALID_REQUEST, trip: { ...VALID_REQUEST.trip, date: "2026-02-31" } }],
    ["invalid time", { ...VALID_REQUEST, trip: { ...VALID_REQUEST.trip, startTime: "25:00" } }],
    ["invalid pace", { ...VALID_REQUEST, trip: { ...VALID_REQUEST.trip, tripPace: "fast" } }],
    ["unsupported category", { ...VALID_REQUEST, trip: { ...VALID_REQUEST.trip, selectedCategories: ["transportation"] } }],
    ["client limit override", { ...VALID_REQUEST, maxCandidates: 999 }],
  ])("rejects %s", (_label, value) => {
    expect(routeRecommendationRequestSchema.safeParse(value).success).toBe(false);
  });

  it("returns a versioned ready response through the canonical endpoint", async () => {
    const generate = vi.fn(async () => READY);
    const response = await createRouteRecommendationHandler({ enabled: true, generate })(request(VALID_REQUEST));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(READY);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("rejects Jeju before recommendation generation or any route-provider work", async () => {
    const generate = vi.fn(async () => READY);
    const response = await createRouteRecommendationHandler({ enabled: true, generate })(request({
      ...VALID_REQUEST,
      trip: { ...VALID_REQUEST.trip, regionId: "jeju", districtId: "110" },
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      status: "region_not_supported_for_itinerary",
      reasonCodes: ["REGION_NOT_SUPPORTED_FOR_ITINERARY"],
      retryable: false,
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects Seoul before KTO, Kakao discovery, matrix, or solver work", async () => {
    const calls = {
      kto: vi.fn(),
      kakaoDiscovery: vi.fn(),
      matrix: vi.fn(),
      solver: vi.fn(),
    };
    const generate = vi.fn(async () => {
      calls.kto();
      calls.kakaoDiscovery();
      calls.matrix();
      calls.solver();
      return READY;
    });
    const response = await createRouteRecommendationHandler({ enabled: true, generate })(request({
      ...VALID_REQUEST,
      trip: { ...VALID_REQUEST.trip, regionId: "seoul", districtId: "110" },
      departure: { ...VALID_REQUEST.departure, latitude: 37.5665, longitude: 126.978 },
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      status: "region_not_supported_for_itinerary",
      reasonCodes: ["REGION_NOT_SUPPORTED_FOR_ITINERARY"],
      retryable: false,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(calls.kto).not.toHaveBeenCalled();
    expect(calls.kakaoDiscovery).not.toHaveBeenCalled();
    expect(calls.matrix).not.toHaveBeenCalled();
    expect(calls.solver).not.toHaveBeenCalled();
  });

  it.each([
    ["Seoul", 37.5665, 126.978],
    ["Tokyo", 35.6812, 139.7671],
  ])("rejects an out-of-region %s origin before generation", async (_label, latitude, longitude) => {
    const generate = vi.fn(async () => READY);
    const response = await createRouteRecommendationHandler({
      enabled: true,
      generate,
      rateLimit: () => ({ allowed: true, limit: 8, remaining: 7, retryAfterSeconds: 0 }),
    })(request({
      ...VALID_REQUEST,
      departure: { ...VALID_REQUEST.departure, latitude, longitude },
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      status: "invalid_request",
      reasonCodes: ["DEPARTURE_OUTSIDE_ITINERARY_REGION"],
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("does not coalesce personalized requests under a catalog-incomplete in-flight key", async () => {
    let release: ((value: RouteRecommendationReadyResponseV1) => void) | undefined;
    const pending = new Promise<RouteRecommendationReadyResponseV1>((resolve) => {
      release = resolve;
    });
    const generate = vi.fn(() => pending);
    const handler = createRouteRecommendationHandler({ enabled: true, generate });
    const first = handler(request(VALID_REQUEST));
    const second = handler(request(VALID_REQUEST));
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    release!(READY);
    await expect(Promise.all([first, second]).then((values) => values.map(({ status }) => status))).resolves.toEqual([200, 200]);
    await handler(request(VALID_REQUEST));
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("propagates client cancellation into recommendation work", async () => {
    const controller = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const generate = vi.fn(async (_request, dependencies) => {
      observedSignal = dependencies?.signal;
      await Promise.resolve();
      dependencies?.signal?.throwIfAborted();
      return READY;
    });
    const handler = createRouteRecommendationHandler({ enabled: true, generate });

    controller.abort();
    const abortedRequest = request(VALID_REQUEST);
    Object.defineProperty(abortedRequest, "signal", { value: controller.signal });
    await expect(handler(abortedRequest)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(observedSignal?.aborted).toBe(true);
  });

  it("returns typed disabled, rate-limited, invalid, and safely normalized error states", async () => {
    const disabled = await createRouteRecommendationHandler({
      enabled: false,
      rateLimit: () => ({ allowed: true, limit: 8, remaining: 7, retryAfterSeconds: 0 }),
    })(request(VALID_REQUEST));
    expect(disabled.status).toBe(503);
    await expect(disabled.json()).resolves.toMatchObject({ status: "route_engine_disabled" });

    const limited = await createRouteRecommendationHandler({
      enabled: true,
      rateLimit: () => ({ allowed: false, limit: 8, remaining: 0, retryAfterSeconds: 12 }),
    })(request(VALID_REQUEST));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("12");

    const invalid = await createRouteRecommendationHandler({
      enabled: true,
      rateLimit: () => ({ allowed: true, limit: 8, remaining: 7, retryAfterSeconds: 0 }),
    })(request({ ...VALID_REQUEST, upstreamUrl: "https://evil.invalid" }));
    expect(invalid.status).toBe(400);

    const failed = await createRouteRecommendationHandler({
      enabled: true,
      rateLimit: () => ({ allowed: true, limit: 8, remaining: 7, retryAfterSeconds: 0 }),
      generate: async () => { throw new Error("serviceKey=SECRET https://provider.invalid/raw"); },
    })(request(VALID_REQUEST));
    const serialized = JSON.stringify(await failed.json());
    expect(failed.status).toBe(500);
    expect(serialized).toContain("recommendation_handler_failed");
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("provider.invalid");
  });

  it("accepts only strict Tourism stops and rejects provider payload leakage", () => {
    expect(routeRecommendationReadyResponseSchema.safeParse(READY).success).toBe(true);
    expect(routeRecommendationResponseSchema.safeParse({ ...READY, route: { ...ROUTE, stops: [{ ...ROUTE.stops[0]!, source: "kakao" }] } }).success).toBe(false);
    expect(routeRecommendationResponseSchema.safeParse({ ...READY, rawProviderPayload: { serviceKey: "SECRET" } }).success).toBe(false);
  });

  it("persists a bounded product snapshot including manual-edit state without an edit session", () => {
    const storage = new MemoryStorage();
    const manual: ProductRouteV1 = { ...ROUTE, id: "manual:1001", kind: "manual", label: "직접 수정한 일정" };
    expect(saveRouteRecommendation(READY, manual, storage, new Date("2026-08-15T00:00:00.000Z"))).toBe(true);
    expect(loadSavedRouteRecommendation(storage)).toMatchObject({
      manuallyModified: true,
      selectedProviderContentIds: ["1001"],
      savedAt: "2026-08-15T00:00:00.000Z",
      route: { kind: "manual" },
    });
    const serialized = [...storage.values.values()].join("");
    expect(serialized).not.toContain(READY.editSessionId);
    expect(serialized).not.toContain("serviceKey");
    expect(serialized).not.toContain("geometry");
    expect(serialized).not.toContain("35.115");
  });

  it("reads and parses one saved snapshot only once for the same storage hydration", () => {
    const seed = new MemoryStorage();
    expect(saveRouteRecommendation(READY, READY.route, seed)).toBe(true);
    const storage = new MemoryStorage();
    storage.values.set(
      "petpass:saved-route-recommendation",
      seed.values.get("petpass:saved-route-recommendation")!,
    );

    expect(loadSavedRouteRecommendation(storage)?.route.id).toBe(READY.route.id);
    expect(loadSavedRouteRecommendation(storage)?.route.id).toBe(READY.route.id);
    expect(storage.getItemCalls).toBe(1);
  });

  it.each([
    ["corrupt JSON", "{broken"],
    [
      "unsupported future version",
      JSON.stringify({ version: 99, data: { route: READY.route } }),
    ],
    [
      "schema-invalid data",
      JSON.stringify({ version: 1, data: { route: { id: "incomplete" } } }),
    ],
  ])("clears only the saved recommendation key for %s", (_label, raw) => {
    const storage = new MemoryStorage();
    storage.setItem("petpass:saved-route-recommendation", raw);
    storage.setItem("petpass:pet-profile", "unrelated-profile");

    expect(loadSavedRouteRecommendation(storage)).toBeNull();
    expect(storage.values.has("petpass:saved-route-recommendation")).toBe(false);
    expect(storage.values.get("petpass:pet-profile")).toBe("unrelated-profile");
  });

  it("returns null without mutating storage when no saved recommendation exists", () => {
    const storage = new MemoryStorage();

    expect(loadSavedRouteRecommendation(storage)).toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it("returns a non-blocking false result when browser persistence fails", () => {
    expect(saveRouteRecommendation(READY, READY.route, new ThrowingStorage())).toBe(false);
    expect(READY.route.stops).toHaveLength(1);
  });

  it("keeps analytics allowlisted and disabled without blocking route use", async () => {
    expect(isRecommendationAnalyticsEvent("route_saved_locally")).toBe(true);
    expect(isRecommendationAnalyticsEvent("arbitrary_provider_refresh")).toBe(false);
    await expect(recordRecommendationAnalytics("recommendation_ready")).resolves.toEqual({
      accepted: false,
      reason: "analytics_ingestion_disabled",
    });
  });

  it("renders only supported structured explanation copy", () => {
    expect(recommendationReasonCopy("matches_requested_category")).toContain("장소 유형");
    expect(recommendationReasonCopy("made_up_reason")).toBeNull();
    expect(recommendationWarningCopy("operating_hours_missing")).toContain("운영시간");
    expect(recommendationWarningCopy("made_up_warning")).toBeNull();
  });

  it("keeps provider failures distinct from no-place failures", () => {
    expect(recommendationFailure("tourism_provider_unavailable", ["timeout"])).toMatchObject({
      status: "tourism_provider_unavailable",
      retryable: true,
    });
    expect(recommendationFailure("insufficient_eligible_places", ["strict_gate"])).toMatchObject({
      status: "insufficient_eligible_places",
      retryable: false,
    });
  });
});
