import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { RouteRecommendationReadyResponseV1 } from "../../types/recommendation";
import {
  chooseConfirmedDeparture,
  continueToDay,
  continueToTrip,
  DEPARTURE_PATH,
  expectNoHorizontalOverflow,
  GENERATE_PATH,
  futureTripDate,
  openPetPlanner,
} from "./planner-test-helpers";

const stop = (id: string, sequence: number, title: string, category: "attraction" | "food") => ({
  placeId: id,
  sequence,
  title,
  address: `부산광역시 공식로 ${sequence}`,
  coordinates: { latitude: 35.11 + sequence * 0.02, longitude: 129.04 + sequence * 0.02 },
  category,
  arrivalAt: `${futureTripDate()}T0${sequence + 1}:00:00.000Z`,
  visitStartsAt: `${futureTripDate()}T0${sequence + 1}:00:00.000Z`,
  departureAt: `${futureTripDate()}T0${sequence + 2}:00:00.000Z`,
  dwellMinutes: category === "food" ? 60 : 90,
  driveSecondsFromPrevious: 900 * sequence,
  distanceMetersFromPrevious: 3_200 * sequence,
  source: "tourism_service2" as const,
  sourceLabel: "한국관광공사" as const,
  petAssessment: "allowed" as const,
  mandatoryConditions: sequence === 1 ? [] : [{ type: "leash_required" as const, label: "목줄 착용 필수", manualConfirmationRecommended: false }],
  informationTrust: sequence === 1 ? "high" as const : "medium" as const,
  licensingStatus: category === "food" ? "no_match" as const : "not_applicable" as const,
  operatingHoursWarnings: sequence === 1 ? [] : ["operating_hours_missing"],
  inclusionReasonCodes: ["matches_requested_category", "official_pet_evidence"],
  orderingReasonCodes: sequence === 1 ? ["shorter_next_drive"] : ["meal_schedule_considered"],
  warningCodes: sequence === 1 ? [] : ["conditional_pet_requirement"],
  evidence: [{ field: "etcAcmpyInfo", label: "기타 동반 안내", originalText: `${title} 반려동물 동반 가능` }],
});

const mainStops = [
  stop("1001", 1, "해운대 공식 공원", "attraction"),
  stop("2001", 2, "광안 공식 식당", "food"),
];

const BASE_READY = {
  status: "ready" as const,
  apiVersion: "route-recommendation-response-v1" as const,
  engineVersion: "petpass-route-engine-v1" as const,
  objectiveVersion: "route-objective-v1" as const,
  solverVersion: "route-solver-v1" as const,
  editSessionId: "792f3903-b879-4d53-93ba-85aa7d52a27f",
  requestSummary: {
    departureLabel: "부산광역시 연제구 중앙대로 1001",
    tripDate: futureTripDate(),
    startTime: "10:00",
    tripType: "day_trip" as const,
    tripPace: "balanced" as const,
    selectedCategories: ["attraction", "food"],
    roundTrip: false,
  },
  optimality: "optimal_within_candidate_set_current_matrix" as const,
  route: {
    id: "optimized:1001>2001",
    kind: "optimized" as const,
    label: "추천 일정",
    routeSummary: {
      startAt: `${futureTripDate()}T01:00:00.000Z`,
      endAt: `${futureTripDate()}T05:00:00.000Z`,
      stopCount: 2,
      totalDistanceMeters: 9_600,
      totalDrivingSeconds: 2_700,
      totalVisitSeconds: 9_000,
      totalWaitSeconds: 0,
    },
    temporalBasis: { searchMatrix: "traffic_independent", finalRoute: "current_traffic" },
    stops: mainStops,
    segments: [
      { fromPlaceId: "departure", toPlaceId: "1001", travelSeconds: 900, distanceMeters: 3_200, temporalBasis: "current_traffic" },
      { fromPlaceId: "1001", toPlaceId: "2001", travelSeconds: 1_800, distanceMeters: 6_400, temporalBasis: "current_traffic" },
    ],
    geometry: [
      { latitude: 35.1796, longitude: 129.0756 },
      mainStops[0].coordinates,
      mainStops[1].coordinates,
    ],
  },
  alternatives: [
    {
      id: "alternative:lower_travel:1",
      kind: "optimized" as const,
      alternativeType: "lower_travel" as const,
      label: "이동이 적은 일정",
      routeSummary: {
        startAt: `${futureTripDate()}T01:00:00.000Z`,
        endAt: `${futureTripDate()}T04:40:00.000Z`,
        stopCount: 2,
        totalDistanceMeters: 7_400,
        totalDrivingSeconds: 2_100,
        totalVisitSeconds: 9_000,
        totalWaitSeconds: 0,
      },
      temporalBasis: { searchMatrix: "traffic_independent", finalRoute: "current_traffic" },
      stops: [
        { ...mainStops[1], sequence: 1, arrivalAt: `${futureTripDate()}T01:20:00.000Z`, departureAt: `${futureTripDate()}T02:20:00.000Z` },
        { ...mainStops[0], sequence: 2, arrivalAt: `${futureTripDate()}T02:40:00.000Z`, departureAt: `${futureTripDate()}T04:10:00.000Z` },
      ],
      geometry: [
        { latitude: 35.1796, longitude: 129.0756 },
        mainStops[1].coordinates,
        mainStops[0].coordinates,
      ],
    },
  ],
  excludedHighlights: [],
  warnings: [],
};

const preferenceStops = [
  stop("3001", 1, "송정 취향 산책지", "attraction"),
  stop("3002", 2, "기장 취향 식당", "food"),
];

const READY = {
  ...BASE_READY,
  contractVersion: "route-recommendation-v2" as const,
  engineVersion: "petpass-route-engine-v2" as const,
  region: "busan" as const,
  requestFingerprint: "0".repeat(64),
  historyContextKey: "1".repeat(64),
  meaningfullyDifferent: true,
  newPlaceCount: 2,
  sharedPlaceRatio: 0,
  diversityCapacity: "sufficient" as const,
  diversityLimitedReasons: [],
  diversity: {
    eligibleUniqueCandidateCount: 8,
    requestedStopCount: 3,
    unseenEligibleCandidateCount: 5,
    maximumFeasibleNovelReplacements: 3,
    diversityCapacity: "sufficient" as const,
    limitingReasonCodes: [],
  },
  resultState: "ready_with_reduced_stops" as const,
  candidateSourceCounts: { kto: 3, kakao: 1, merged: 0 },
  alternativeAvailability: "available" as const,
  route: {
    ...BASE_READY.route,
    id: "optimized:balanced:1001>2001",
    label: "균형 추천",
    style: "balanced" as const,
    routeSignature: "1001>2001",
    requestedTarget: 3,
    reductionStatus: "reduced" as const,
    personalizationExplanationCodes: ["route_style_balanced"],
  },
  alternatives: [],
  routeOptions: [
    {
      ...BASE_READY.route,
      id: "optimized:balanced:1001>2001",
      label: "균형 추천",
      style: "balanced" as const,
      routeSignature: "1001>2001",
      requestedTarget: 3,
      reductionStatus: "reduced" as const,
      personalizationExplanationCodes: ["route_style_balanced"],
    },
    {
      ...BASE_READY.route,
      id: "optimized:relaxed:3001>3002",
      label: "여유 일정",
      style: "relaxed" as const,
      routeSignature: "3001>3002",
      requestedTarget: 3,
      reductionStatus: "reduced" as const,
      personalizationExplanationCodes: ["route_style_relaxed"],
      stops: preferenceStops,
      geometry: [
        { latitude: 35.1796, longitude: 129.0756 },
        preferenceStops[0].coordinates,
        preferenceStops[1].coordinates,
      ],
    },
    {
      ...BASE_READY.route,
      id: "optimized:shortest:2001>1001",
      label: "이동 최소",
      style: "shortest" as const,
      routeSignature: "2001>1001",
      requestedTarget: 3,
      reductionStatus: "reduced" as const,
      personalizationExplanationCodes: ["route_style_shortest"],
      routeSummary: {
        ...BASE_READY.route.routeSummary,
        endAt: `${futureTripDate()}T04:40:00.000Z`,
        totalDistanceMeters: 7_400,
        totalDrivingSeconds: 2_100,
      },
      stops: [
        { ...mainStops[1], sequence: 1, arrivalAt: `${futureTripDate()}T01:20:00.000Z`, departureAt: `${futureTripDate()}T02:20:00.000Z` },
        { ...mainStops[0], sequence: 2, arrivalAt: `${futureTripDate()}T02:40:00.000Z`, departureAt: `${futureTripDate()}T04:10:00.000Z` },
      ],
      geometry: [
        { latitude: 35.1796, longitude: 129.0756 },
        mainStops[1].coordinates,
        mainStops[0].coordinates,
      ],
    },
  ],
};

async function installFakeMap(page: Page) {
  await page.route(`**${DEPARTURE_PATH}?**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [
          {
            id: "address:0:35.179600:129.075600",
            kind: "address",
            label: "부산광역시 연제구 중앙대로 1001",
            address: "부산광역시청 지번 1000",
            coordinates: { latitude: 35.1796, longitude: 129.0756 },
          },
        ],
      }),
    });
  });
  await page.addInitScript(() => {
    type Listener = (...args: unknown[]) => void;
    const listeners = new WeakMap<object, Map<string, Set<Listener>>>();
    const addListener = (target: object, name: string, handler: Listener) => {
      const values = listeners.get(target) ?? new Map<string, Set<Listener>>();
      const handlers = values.get(name) ?? new Set<Listener>();
      handlers.add(handler);
      values.set(name, handlers);
      listeners.set(target, values);
    };
    class LatLng {
      constructor(private lat: number, private lng: number) {}
      getLat() { return this.lat; }
      getLng() { return this.lng; }
    }
    class Bounds {
      extend() {}
      getNorthEast() { return new LatLng(35.3, 129.3); }
      getSouthWest() { return new LatLng(35, 129); }
    }
    class FakeMap {
      private center: LatLng;
      constructor(readonly container: HTMLElement, options: { center: LatLng }) {
        this.center = options.center;
        container.dataset.fakeMapReady = "true";
      }
      getBounds() { return new Bounds(); }
      getCenter() { return this.center; }
      panTo(value: LatLng) { this.center = value; }
      relayout() {}
      setBounds() {}
    }
    class Marker { setImage() {} setMap() {} setPosition() {} setZIndex() {} }
    class Overlay {
      private map: FakeMap | null;
      constructor(private options: { map: FakeMap; content: HTMLElement }) {
        this.map = options.map;
        options.map.container.append(options.content);
      }
      setMap(map: FakeMap | null) {
        this.map = map;
        if (!map) this.options.content.remove();
      }
    }
    class Polyline {
      private element: HTMLElement;
      constructor(options: { map: FakeMap; path: LatLng[] }) {
        this.element = document.createElement("div");
        this.element.dataset.providerPolyline = String(options.path.length);
        options.map.container.append(this.element);
      }
      setMap(map: FakeMap | null) { if (!map) this.element.remove(); }
    }
    class Clusterer { addMarkers() {} clear() {} }
    window.kakao = { maps: {
      load: (callback: () => void) => callback(),
      event: { addListener, removeListener(target: object, name: string, handler: Listener) { listeners.get(target)?.get(name)?.delete(handler); } },
      LatLng, LatLngBounds: Bounds, Map: FakeMap, CustomOverlay: Overlay, Marker,
      MarkerImage: class {}, MarkerClusterer: Clusterer, Point: class {}, Polyline, Size: class {},
    } as unknown as NonNullable<Window["kakao"]>["maps"] };
  });
}

async function generate(page: Page, testInfo: TestInfo, response: RouteRecommendationReadyResponseV1 = READY) {
  await installFakeMap(page);
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    await route.fulfill({ status: response.status === "ready" ? 200 : 422, contentType: "application/json", body: JSON.stringify(response) });
  });
  await openPetPlanner(page, testInfo, "stage5-ui");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page).toHaveURL(/\/results\?tab=recommendations&region=busan$/u);
}

test("shows a deliberate empty recommendation state without a request", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === GENERATE_PATH) requests.push(request.url()); });
  await page.goto("/results?tab=recommendations&region=busan");
  await expect(page.getByRole("heading", { name: "맞춤 일정을 만들려면 여행 조건이 필요합니다." })).toBeVisible();
  await expect(page.getByText(/반려견과 출발지, 원하는 하루를 입력하면/u)).toBeVisible();
  await expect(page.getByRole("link", { name: "여행 조건 입력하기" })).toHaveAttribute("href", "/planner/pet");
  await expect(page.getByText(/추천 일정 생성 중|맞춤 일정을 만들고 있습니다/u)).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("submits the strict combined contract once and renders the exact provider-backed result", async ({ page }, testInfo) => {
  const bodies: unknown[] = [];
  await installFakeMap(page);
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(READY) });
  });
  await openPetPlanner(page, testInfo, "stage5-once");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
  await expect(page).toHaveURL(/\/results\?tab=recommendations&region=busan$/u);
  const resultHeading = page.getByRole("heading", { name: /에서 시작하는 2곳 일정/u });
  await expect(resultHeading).toBeVisible();
  await expect(resultHeading).toBeFocused();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({
    departure: { label: "부산광역시 연제구 중앙대로 1001", source: "address_search" },
    trip: { regionId: "busan", tripPace: "balanced", selectedCategories: ["attraction", "food"] },
    pet: { species: "DOG", size: "SMALL" },
  });
  expect(bodies[0]).not.toHaveProperty("pet.availableEquipment");
  expect(bodies[0]).not.toHaveProperty("pet.acceptsOutdoorOnlyPlaces");
  await expect(page.getByText("요청한 3곳보다 적은 2곳으로 이동 경로를 계산했어요.", { exact: true })).toBeVisible();
  await expect(page.getByText(/9\.6km · 약 45분/u)).toBeVisible();
  await expect(page.getByText(/관광지 · 한국관광공사/u)).toBeVisible();
  await expect(page.getByText("반려동물 동반 가능", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/목줄 착용 필수/u)).toBeVisible();
  await expect(page.getByText(/조건부 동반|동반 여부 미확인|근거 미확인/u)).toHaveCount(0);
  await page.getByText("추천 근거와 이용 안내", { exact: true }).first().click();
  await expect(page.getByText("선택하신 장소 유형과 잘 맞습니다.").first()).toBeVisible();
  await expect(page.getByText("한국관광공사의 반려동물 동반 근거를 확인했습니다.").first()).toBeVisible();
  await expect(page.getByText(/2830|품질.*%|카카오 검색 후보|인기 장소 중심 일정/u)).toHaveCount(0);
  await expect(page.getByText(/Kakao.*(?:경로|길찾기)|geometry|최종 Kakao/u)).toHaveCount(0);
  await expect(page.locator("[data-provider-polyline]")).toHaveAttribute("data-provider-polyline", "3");
  await expect(page.locator(".kakao-map-marker--departure")).toContainText("출");
  await expect(page.locator(".kakao-map-marker--itinerary")).toHaveCount(2);
  const firstMapControl = page.getByRole("button", { name: "해운대 공식 공원 지도에서 보기", exact: true });
  const secondMapControl = page.getByRole("button", { name: "광안 공식 식당 지도에서 보기", exact: true });
  await expect(firstMapControl).toHaveAttribute("aria-pressed", "true");
  await expect(secondMapControl).toHaveAttribute("aria-pressed", "false");
  expect(await firstMapControl.evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await secondMapControl.click();
  await expect(secondMapControl).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#recommended-stop-2001")).toHaveAttribute("data-selected", "true");
  const firstMarker = page.locator('.kakao-map-marker[data-location-id="1001"]');
  await firstMarker.click();
  await expect(page.locator("#recommended-stop-1001")).toHaveAttribute("data-selected", "true");
  await expect(firstMapControl).toHaveAttribute("aria-pressed", "true");
});

test("switches a V2 route style without rerunning providers and updates summary, order, and geometry", async ({ page }, testInfo) => {
  let generationRequests = 0;
  await installFakeMap(page);
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    generationRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(READY) });
  });
  await openPetPlanner(page, testInfo, "stage5-alternative");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  const switchDurationMs = await page.getByRole("tab", { name: "이동 최소" }).evaluate(
    (node) => new Promise<number>((resolve) => {
      const started = performance.now();
      (node as HTMLButtonElement).click();
      requestAnimationFrame(() => resolve(performance.now() - started));
    }),
  );
  await expect(page.getByText(/7\.4km · 약 35분/u)).toBeVisible();
  expect(switchDurationMs).toBeLessThan(100);
  await expect(page.getByRole("list", { name: /이동 최소 방문 순서/u }).locator(":scope > li").first()).toContainText("광안 공식 식당");
  await expect(page.locator('[data-location-id="2001"]')).toContainText("1");
  expect(generationRequests).toBe(1);
  const resource = await page.evaluate((path) => {
    const entry = performance.getEntriesByType("resource")
      .filter(({ name }) => name.includes(path))
      .at(-1) as PerformanceResourceTiming | undefined;
    return entry ? {
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    } : null;
  }, GENERATE_PATH);
  console.log(`ROUTE_OPTION_METRICS ${JSON.stringify({
    baselineResponseRawBytes: new TextEncoder().encode(JSON.stringify(BASE_READY)).byteLength,
    rawResponseBytes: new TextEncoder().encode(JSON.stringify(READY)).byteLength,
    ...resource,
    generationRequests,
    switchDurationMs: Math.round(switchDurationMs * 100) / 100,
  })}`);
});

test("reroll sends only the primary scoped history and a new deterministic variant", async ({ page }, testInfo) => {
  const bodies: Array<{ personalization?: { rerollVariant?: number; recentRouteSignatures?: string[]; recentlySelectedCandidateIds?: string[]; historyContextKey?: string } }> = [];
  await installFakeMap(page);
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(READY) });
  });
  await openPetPlanner(page, testInfo, "v2-reroll");
  await expect(page.getByRole("radio", { name: "상관없음" })).toBeChecked();
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page.getByRole("tab", { name: "균형 추천" })).toBeVisible();
  await page.getByRole("button", { name: "새로운 장소로 다시 추천" }).click();
  await expect.poll(() => bodies.length).toBe(2);

  expect(bodies[0]?.personalization).toMatchObject({
    rerollVariant: 0,
    recentRouteSignatures: [],
    recentlySelectedCandidateIds: [],
  });
  expect(bodies[1]?.personalization?.rerollVariant).toBe(1);
  expect(bodies[1]?.personalization?.historyContextKey).toBe("1".repeat(64));
  expect(bodies[1]?.personalization?.recentRouteSignatures).toEqual(["1001>2001"]);
  expect(bodies[1]?.personalization?.recentlySelectedCandidateIds).toEqual(["1001", "2001"]);
});

test("aborts an older reroll and prevents its late response from replacing the newer result", async ({ page }, testInfo) => {
  let requestCount = 0;
  let releaseOld!: () => void;
  const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
  const responseAtDistance = (distanceMeters: number) => {
    const primary = {
      ...READY.routeOptions[0],
      routeSummary: { ...READY.routeOptions[0].routeSummary, totalDistanceMeters: distanceMeters },
    };
    return {
      ...READY,
      route: primary,
      routeOptions: [primary, ...READY.routeOptions.slice(1)],
    };
  };
  await installFakeMap(page);
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    requestCount += 1;
    const current = requestCount;
    if (current === 2) await oldGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responseAtDistance(current === 2 ? 19_900 : current === 3 ? 6_100 : 9_600)),
    }).catch(() => undefined);
  });
  await openPetPlanner(page, testInfo, "v2-late-response");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page.getByText(/9\.6km/u)).toBeVisible();

  await page.getByRole("button", { name: "새로운 장소로 다시 추천" }).evaluate((node) => {
    (node as HTMLButtonElement).click();
    (node as HTMLButtonElement).click();
  });
  await expect.poll(() => requestCount).toBe(3);
  await expect(page.getByText(/6\.1km/u)).toBeVisible();
  releaseOld();
  await page.waitForTimeout(50);
  await expect(page.getByText(/6\.1km/u)).toBeVisible();
  await expect(page.getByText(/19\.9km/u)).toHaveCount(0);
});

test("revalidates manual order, labels it honestly, and restores the original", async ({ page }, testInfo) => {
  await generate(page, testInfo);
  const manual = {
    status: "ready",
    apiVersion: "route-recommendation-response-v1",
    route: {
      ...READY.route,
      id: "manual:2001>1001",
      kind: "manual",
      label: "직접 수정한 일정",
      routeSummary: { ...READY.route.routeSummary, totalDistanceMeters: 11_200, totalDrivingSeconds: 3_300 },
      stops: [
        { ...mainStops[1], sequence: 1 },
        { ...mainStops[0], sequence: 2 },
      ],
      segments: [
        { fromPlaceId: "departure", toPlaceId: "2001", travelSeconds: 1_800, distanceMeters: 6_400, temporalBasis: "current_traffic" },
        { fromPlaceId: "2001", toPlaceId: "1001", travelSeconds: 1_500, distanceMeters: 4_800, temporalBasis: "current_traffic" },
      ],
      geometry: [READY.route.geometry[0], mainStops[1].coordinates, mainStops[0].coordinates],
    },
    warnings: ["manual_route_revalidated"],
  };
  let orderedIds: string[] = [];
  await page.route("**/api/itineraries/revalidate", async (route) => {
    orderedIds = (route.request().postDataJSON() as { orderedPlaceIds: string[] }).orderedPlaceIds;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manual) });
  });
  await page.locator("#recommended-stop-1001").getByRole("button", { name: "뒤로" }).click();
  await expect(page.getByText("수정 중인 일정", { exact: true })).toBeVisible();
  await expect(page.locator(".route-result-summary").getByText("경로 재계산 필요", { exact: true })).toBeVisible();
  await expect(page.locator("[data-provider-polyline]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "일정 저장" })).toBeDisabled();
  await page.getByRole("button", { name: "경로 다시 계산" }).click();
  await expect(page.getByText("직접 수정한 일정", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/11\.2km · 약 55분/u)).toBeVisible();
  expect(orderedIds).toEqual(["2001", "1001"]);
  await page.getByRole("button", { name: "일정 저장" }).click();
  await expect(page.getByRole("status")).toContainText("현재 일정을 이 브라우저에 저장했습니다");
  const stored = await page.evaluate(() =>
    localStorage.getItem("petpass:saved-route-recommendation"),
  );
  expect(stored).toContain('"manuallyModified":true');
  expect(stored).not.toContain(READY.editSessionId);
  await page.getByRole("button", { name: "원래 추천 일정 복원" }).click();
  await expect(page.getByText("WEEKENDOG 추천 일정", { exact: true })).toBeVisible();
  await expect(page.getByText(/9\.6km · 약 45분/u)).toBeVisible();
});

test("keeps factual conditions non-blocking after manual revision and uses the renewed edit session", async ({ page }, testInfo) => {
  const initial = fullCatalogResponse();
  await generate(page, testInfo, initial);
  const approvedSession = `v1.${"c".repeat(60)}.${"d".repeat(43)}`;
  const requests: Array<{ editSessionId: string; orderedPlaceIds: string[]; conditionAnswers?: unknown[] }> = [];
  const manualStops = [initial.route.stops[1]!, initial.route.stops[0]!].map((value, index) => {
    const arrival = index === 0 ? 900 : 6300;
    const departure = arrival + value.dwellMinutes * 60;
    const absolute = (seconds: number) => new Date(Date.parse(initial.route.routeSummary.startAt!) + seconds * 1000).toISOString();
    return { ...value, sequence: index + 1, driveSecondsFromPrevious: initial.route.segments![index]!.travelSeconds, distanceMetersFromPrevious: initial.route.segments![index]!.distanceMeters, arrivalAt: absolute(arrival), visitStartsAt: absolute(arrival), departureAt: absolute(departure), arrivalOffsetSeconds: arrival, visitStartsOffsetSeconds: arrival, departureOffsetSeconds: departure };
  });
  const manualRoute = {
    ...initial.route, kind: "manual", label: "직접 수정한 일정",
    stops: manualStops,
    geometry: [initial.route.geometry[0]!, ...manualStops.map(value => value.coordinates)],
    segments: initial.route.segments!.map((edge, index) => ({ ...edge, fromPlaceId: index === 0 ? "departure" : "tour:2001", toPlaceId: index === 0 ? "tour:2001" : "kakao:9001" })),
  };
  await page.route("**/api/itineraries/revalidate", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ready", apiVersion: "route-recommendation-response-v2", route: manualRoute, warnings: [], editSessionId: approvedSession }) });
  });
  await page.locator('[id="recommended-stop-kakao:9001"]').getByRole("button", { name: "뒤로" }).click();
  await page.getByRole("button", { name: "경로 다시 계산" }).click();
  await expect(page.getByText("직접 수정한 일정", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "이 일정에 필요한 사실만 확인해 주세요" })).toHaveCount(0);
  await expect(page.getByText("반려동물 동반 가능", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "일정 저장", exact: true })).toBeEnabled();
  expect(requests[0]?.conditionAnswers).toBeUndefined();
  expect(requests[0]?.orderedPlaceIds).toEqual(["tour:2001", "kakao:9001"]);
  await page.getByRole("button", { name: "일정 저장", exact: true }).click();
  await expect(page.getByRole("link", { name: "저장된 일정 보기" })).toBeVisible();
  await page.locator('[id="recommended-stop-tour:2001"]').getByRole("button", { name: "뒤로" }).click();
  await page.getByRole("button", { name: "경로 다시 계산" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]?.editSessionId).toBe(approvedSession);
  expect(requests[1]?.conditionAnswers).toBeUndefined();
});

test("restores a saved recommendation directly and after refresh without provider requests", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The explicit saved-route viewport matrix runs once.");
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route(`**${DEPARTURE_PATH}?**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [
          {
            id: "address:0:35.179600:129.075600",
            kind: "address",
            label: "부산광역시 연제구 중앙대로 1001",
            address: "부산광역시청 지번 1000",
            coordinates: { latitude: 35.1796, longitude: 129.0756 },
          },
        ],
      }),
    });
  });
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    const originalParse = JSON.parse;
    const metrics = { reads: 0, parses: 0, parseDurationMs: 0 };
    Object.defineProperty(window, "__savedRouteStorageMetrics", {
      value: metrics,
      configurable: true,
    });
    Storage.prototype.getItem = function (key: string) {
      if (key === "petpass:saved-route-recommendation") metrics.reads += 1;
      return originalGetItem.call(this, key);
    };
    JSON.parse = function (text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown) {
      const measured = text.includes("petpass-route-engine-v2");
      const startedAt = performance.now();
      const value = originalParse.call(JSON, text, reviver);
      if (measured) {
        metrics.parses += 1;
        metrics.parseDurationMs += performance.now() - startedAt;
      }
      return value;
    } as typeof JSON.parse;
  });
  await generate(page, testInfo);
  await page.getByRole("button", { name: "일정 저장" }).click();
  await expect(page.getByRole("status")).toContainText("현재 일정을 이 브라우저에 저장했습니다");
  const storageBytes = await page.evaluate(() =>
    new TextEncoder().encode(localStorage.getItem("petpass:saved-route-recommendation") ?? "").byteLength,
  );
  expect(storageBytes).toBeGreaterThan(0);

  const providerRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/api/") || pathname.includes("KorPetTourService2")) {
      providerRequests.push(pathname);
    }
  });
  await page.evaluate(() => Object.assign((window as unknown as { __savedRouteStorageMetrics: object }).__savedRouteStorageMetrics, { reads: 0, parses: 0, parseDurationMs: 0 }));
  await page.getByRole("link", { name: "저장된 일정 보기" }).click();
  await expect(page).toHaveURL(/\/itinerary$/u);
  await expect(page.getByText("저장된 일정", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "균형 추천" })).toBeVisible();
  await expect(page.locator('[data-itinerary-source="saved-recommendation"] .surface-card')).toHaveCount(0);
  await expect(page.getByRole("list", { name: "저장된 일정 방문 순서" }).locator(":scope > li")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "해운대 공식 공원" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "광안 공식 식당" })).toBeVisible();
  await expect(page.getByText("한국관광공사", { exact: true })).toHaveCount(2);
  await expect(page.getByText("저장된 조건 원문", { exact: true })).toHaveCount(2);
  await expect(page.getByText("한국관광공사 기반 추천에 저장된 장소", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/9\.6km/u)).toBeVisible();
  await expect(page.getByText(/45분/u)).toBeVisible();
  await expect(page.getByText(/저장 당시 확인된 경로 정보/u)).toBeVisible();
  expect(providerRequests).toEqual([]);

  const firstMetrics = await page.evaluate(() =>
    (window as unknown as { __savedRouteStorageMetrics: { reads: number; parses: number; parseDurationMs: number } }).__savedRouteStorageMetrics,
  );
  // One raw freshness read and one versioned validation read; unchanged payload parses once.
  expect(firstMetrics.reads).toBe(2);
  expect(firstMetrics.parses).toBe(1);

  await page.reload();
  await expect(page.getByText("저장된 일정", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "균형 추천" })).toBeVisible();
  await expect(page.locator('[data-itinerary-source="saved-recommendation"] .surface-card')).toHaveCount(0);
  const refreshMetrics = await page.evaluate(() =>
    (window as unknown as { __savedRouteStorageMetrics: { reads: number; parses: number; parseDurationMs: number } }).__savedRouteStorageMetrics,
  );
  expect(refreshMetrics.reads).toBe(2);
  expect(refreshMetrics.parses).toBe(1);
  expect(providerRequests).toEqual([]);

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("저장된 일정", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "저장된 일정 방문 순서" })).toBeVisible();
  }
  expect(browserErrors).toEqual([]);
  await expect(page.locator("[data-nextjs-error-overlay], [data-nextjs-dialog]")).toHaveCount(0);
  console.log(`SAVED_ROUTE_METRICS ${JSON.stringify({ storageBytes, firstMetrics, refreshMetrics, providerRequests: providerRequests.length })}`);
});

test("preserves a corrupt saved recommendation and keeps the neutral itinerary state", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("petpass:saved-route-recommendation", "{broken");
    localStorage.setItem("petpass:pet-profile", "unrelated-profile");
  });
  await page.goto("/itinerary");
  await expect(page.getByRole("heading", { name: "아직 저장된 일정이 없습니다." })).toBeVisible();
  const values = await page.evaluate(() => ({
    saved: localStorage.getItem("petpass:saved-route-recommendation"),
    profile: localStorage.getItem("petpass:pet-profile"),
  }));
  expect(values).toEqual({ saved: "{broken", profile: "unrelated-profile" });
});

test("keeps a rejected manual edit visible and allows restoration", async ({ page }, testInfo) => {
  await generate(page, testInfo);
  await page.route("**/api/itineraries/revalidate", async (route) => {
    await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({
      status: "insufficient_feasible_route",
      apiVersion: "route-recommendation-response-v1",
      reasonCodes: ["manual_order_operating_window_or_pace_conflict"],
      userMessage: "방문 가능한 장소는 있지만 운영시간과 이동시간을 함께 맞추기 어려웠습니다.",
      retryable: false,
    }) });
  });
  await page.locator("#recommended-stop-2001").getByRole("button", { name: "제외" }).click();
  await page.getByRole("button", { name: "경로 다시 계산" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "운영시간과 이동시간" })).toBeVisible();
  await page.getByRole("button", { name: "원래 추천 복원" }).click();
  await expect(page.getByRole("list", { name: /균형 추천 방문 순서/u }).locator(":scope > li")).toHaveCount(2);
});

test("submits an overnight trip without forcing an accommodation category preference", async ({ page }, testInfo) => {
  await installFakeMap(page);
  let submitted: { trip: { tripType: string; selectedCategories: string[] } } | undefined;
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(READY) });
  });
  await openPetPlanner(page, testInfo, "full-catalog-overnight-preference");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await page.getByRole("radio", { name: /1박 여행/u }).check({ force: true });
  await continueToDay(page);
  await expect(page.getByRole("checkbox", { name: "숙소", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect.poll(() => submitted?.trip.tripType).toBe("overnight");
  expect(submitted?.trip.selectedCategories).toEqual(["attraction", "food"]);
  await expect(page).toHaveURL(/\/results\?tab=recommendations&region=busan$/u);
});

test("shows compact request-backed loading without fake pipeline stages", async ({ page }, testInfo) => {
  await installFakeMap(page);
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(READY) });
  });
  await openPetPlanner(page, testInfo, "stage5-loading");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page).toHaveURL(/\/results\?tab=recommendations&region=busan$/u);
  const loading = page.getByRole("status", { name: "맞춤 일정 생성 상태" });
  await expect(loading.getByRole("heading", { name: "맞춤 일정을 만들고 있습니다" })).toBeVisible();
  await expect(loading).toContainText("반려견 동반 근거와 실제 이동 경로를 확인하고 있어요.");
  await expect(loading).toContainText("보리 · 강아지 · 소형");
  await expect(loading).toContainText("부산광역시 연제구 중앙대로 1001 출발");
  await expect(loading).toContainText(`${futureTripDate()} · 10:00`);
  await expect(loading).not.toContainText(/Kakao|geometry/u);
  await expect(loading.locator(".recommendation-loading-stop")).toHaveCount(3);
  await expect(page.getByText("선택 장소 확인")).toHaveCount(0);
  await expect(page.getByText("추천 완료")).toHaveCount(0);
  await expect(page.getByText(/\d+%/u)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("loading-redesign.png"), fullPage: true });
  release!();
  await expect(page.getByRole("heading", { name: /에서 시작하는 2곳 일정/u })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("result-redesign.png"), fullPage: true });
});

test("shows time-limited wording and preserves confirmed input across a recoverable failure", async ({ page }, testInfo) => {
  await installFakeMap(page);
  let attempt = 0;
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    attempt += 1;
    const body = attempt === 1
      ? { status: "kakao_provider_unavailable", apiVersion: "route-recommendation-response-v1", reasonCodes: ["timeout"], userMessage: "장소 정보는 확인했지만 실제 이동 경로를 계산하지 못했습니다.", retryable: true }
      : { ...READY, optimality: "best_found_within_time_limit" };
    await route.fulfill({ status: attempt === 1 ? 503 : 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await openPetPlanner(page, testInfo, "stage5-retry");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page.getByRole("alert", { name: "일정을 표시할 수 없어요" })).toContainText("실제 이동 경로를 계산하지 못했습니다");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByText("제한 시간 안에서 확인한 일정 중 가장 적합한 결과입니다.")).toBeVisible();
  expect(attempt).toBe(2);
});

test("keeps the Stage 5 result usable at desktop, tablet, and mobile widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The explicit viewport matrix runs once.");
  const longDepartureLabel = "WEEKENDOG".repeat(12);
  await generate(page, testInfo, {
    ...READY,
    requestSummary: { ...READY.requestSummary, departureLabel: longDepartureLabel },
  });
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    const resultHeading = page.getByRole("heading", { name: /에서 시작하는 2곳 일정/u });
    await expect(resultHeading).toBeVisible();
    await expect(resultHeading).toHaveCSS("overflow-wrap", "anywhere");
    await expect(page.getByRole("list", { name: /균형 추천 방문 순서/u })).toBeVisible();
    const map = page.locator(".kakao-map-canvas");
    await expect(map).toBeVisible();
    expect((await map.boundingBox())?.height ?? 0).toBeGreaterThan(280);
    const verticalLayout = await page.evaluate(() => {
      const timeline = document.querySelector(".route-result-timeline");
      const footer = document.querySelector("footer");
      if (!timeline || !footer) return null;
      const timelineBox = timeline.getBoundingClientRect();
      const footerBox = footer.getBoundingClientRect();
      return {
        footerAfterTimeline: footerBox.top >= timelineBox.bottom,
        documentContainsTimeline:
          document.documentElement.scrollHeight >=
          timelineBox.bottom + window.scrollY,
      };
    });
    expect(verticalLayout).toEqual({
      footerAfterTimeline: true,
      documentContainsTimeline: true,
    });
  }
});

// Completion-first fixtures exercise HTTP/UI/storage contracts; engine correctness is covered by service tests.
function completionResponse(date: string | null, startTime: string | null, suggestedTime?: string) {
  const effectiveTime = suggestedTime ?? startTime ?? (date ? "09:00" : null);
  const schedule = {
    requested: { date, startTime }, effective: { date, startTime: effectiveTime },
    state: suggestedTime && suggestedTime !== startTime ? "adjustment_proposal" as const : date ? "scheduled" as const : "undated_template" as const,
    timingBasis: date ? "dated" as const : startTime ? "illustrative_clock" as const : "relative" as const,
    roadValidated: true, timeBudgetValidated: true,
    calendarValidation: date ? "checked_known_rules" as const : "date_required" as const,
    operatingAvailability: "requires_confirmation" as const, reasonCodes: [],
  };
  const absolute = (seconds: number) => date ? new Date(Date.parse(`${date}T${effectiveTime}:00+09:00`) + seconds * 1000).toISOString() : null;
  const stops = READY.route.stops.map((value, index) => {
    const arrival = index === 0 ? 900 : 8100;
    const departure = arrival + value.dwellMinutes * 60;
    return { ...value, placeId: `tour:${value.placeId}`, regionId: "busan" as const, arrivalAt: absolute(arrival), visitStartsAt: absolute(arrival), departureAt: absolute(departure), arrivalOffsetSeconds: arrival, visitStartsOffsetSeconds: arrival, departureOffsetSeconds: departure };
  });
  const route = { ...READY.route, planningPolicy: "full_public_catalog_v1" as const, venueCompatibility: "unchecked" as const, schedule, stops, routeSignature: "tour:1001>tour:2001", routeSummary: { ...READY.route.routeSummary, startAt: absolute(0), endAt: absolute(11700), totalElapsedSeconds: 11700 }, segments: READY.route.segments.map((edge, index) => ({ ...edge, fromPlaceId: index === 0 ? "departure" : "tour:1001", toPlaceId: `tour:${edge.toPlaceId}` })) };
  return { ...READY, apiVersion: "route-recommendation-response-v2" as const, requestSummary: { ...READY.requestSummary, tripDate: date, startTime }, route, routeOptions: [route] };
}

function fullCatalogResponse(kakaoId = "9001"): RouteRecommendationReadyResponseV1 {
  const base = completionResponse(futureTripDate(), "10:00");
  const route = {
    ...base.route,
    stops: [
      { ...base.route.stops[0]!, placeId: `kakao:${kakaoId}`, title: `카카오 공개 장소 ${kakaoId}`, source: "kakao_catalog" as const, sourceLabel: "카카오 검색 후보" as const, petAssessment: "allowed" as const, evidenceStatus: "verified" as const, informationTrust: "low" as const, evidence: [], inclusionReasonCodes: ["matches_requested_category"], catalogEvidence: [{ provider: "kakao" as const, providerPlaceId: kakaoId, petAssessment: "unknown" as const, originalText: null, retrievedAt: null, publicLabel: "반려동물 동반 가능" }] },
      { ...base.route.stops[1]!, petAssessment: "allowed" as const, evidenceStatus: "verified" as const, operatingStatus: "reported_closed" as const, licensingStatus: "confirmed_closed" as const, mandatoryConditions: [], evidence: [{ field: "catalog", label: "보존된 이용 안내", originalText: "반려동물 출입 불가 · 휴업 안내" }], inclusionReasonCodes: ["matches_requested_category"], catalogEvidence: [{ provider: "kto" as const, providerPlaceId: "2001", petAssessment: "not_allowed" as const, originalText: "반려동물 출입 불가 · 휴업 안내", retrievedAt: "2026-09-01T00:00:00Z", publicLabel: "반려동물 동반 가능" }] },
    ],
    segments: base.route.segments.map((edge, index) => ({ ...edge, fromPlaceId: index === 0 ? "departure" : `kakao:${kakaoId}`, toPlaceId: index === 0 ? `kakao:${kakaoId}` : "tour:2001" })),
    routeSignature: `kakao:${kakaoId}>tour:2001`,
  };
  return { ...base, route, routeOptions: [route], candidateSourceCounts: { kto: 1, kakao: 1, merged: 0 } };
}

for (const mode of [
  { name: "undated relative", date: null, time: null },
  { name: "date only", date: futureTripDate(), time: null },
  { name: "time only", date: null, time: "10:00" },
  { name: "fixed schedule", date: futureTripDate(), time: "10:00" },
]) {
  test(`completion schedule ${mode.name} survives request, saved link, and refresh`, async ({ page }, testInfo) => {
    const bodies: Array<Record<string, unknown>> = [];
    await installFakeMap(page);
    await page.route(`**${GENERATE_PATH}`, async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(completionResponse(mode.date, mode.time)) });
    });
    await openPetPlanner(page, testInfo, "completion-mode");
    await continueToTrip(page);
    if (!mode.date) await page.getByRole("button", { name: "날짜 미정", exact: true }).click();
    if (!mode.time) await page.getByRole("button", { name: "시간 미정", exact: true }).click();
    await chooseConfirmedDeparture(page);
    await continueToDay(page);
    await page.getByRole("button", { name: "여행 추천 받기" }).click();
    await expect(page.getByRole("heading", { name: /에서 시작하는 2곳 일정/u })).toBeVisible();
    expect(bodies[0]).toMatchObject({ requestVersion: 2, trip: { date: mode.date, startTime: mode.time } });
    expect(bodies[0]).not.toHaveProperty("pet.availableEquipment");
    if (!mode.date) await expect(page.getByLabel("일정 상태")).toContainText("날짜 미정 초안");
    if (!mode.date && !mode.time) await expect(page.locator("#recommended-stop-tour\\:1001")).toContainText("출발 후 15분");
    if (!mode.date && mode.time) await expect(page.locator("#recommended-stop-tour\\:1001")).toContainText("10:15 (예시)");
    if (mode.date && !mode.time) await expect(page.getByLabel("일정 상태")).toContainText("추천 출발 시간: 09:00");
    await page.getByRole("button", { name: "일정 저장", exact: true }).click();
    await page.getByRole("link", { name: "저장된 일정 보기" }).click();
    await expect(page).toHaveURL(/\/itinerary$/u);
    await page.reload();
    await expect(page.getByRole("heading", { name: "균형 추천" })).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("petpass:saved-route-recommendation")!));
    expect(saved.version).toBe(2);
    expect(saved.data.route.schedule.requested).toEqual({ date: mode.date, startTime: mode.time });
    expect(saved.data.route.segments).toHaveLength(2);
    expect(saved.data.saveState).toBe("draft");
    if (!mode.date) expect(saved.data.route.stops.every((value: { arrivalAt: unknown }) => value.arrivalAt === null)).toBe(true);
    expect(JSON.stringify(saved)).not.toContain(READY.editSessionId);
  });
}

test("keeps an explicit time until applying and revalidating its proposal", async ({ page }, testInfo) => {
  const requestedTimes: string[] = [];
  await installFakeMap(page);
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    const request = route.request().postDataJSON();
    requestedTimes.push(request.trip.startTime);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(completionResponse(request.trip.date, request.trip.startTime, request.trip.startTime === "10:00" ? "11:00" : undefined)) });
  });
  await openPetPlanner(page, testInfo, "completion-proposal");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page.getByLabel("일정 상태")).toContainText("요청 출발 10:00");
  await expect(page.getByLabel("일정 상태")).toContainText("11:00 출발을 제안");
  const storedTime = () => page.evaluate(() => JSON.parse(localStorage.getItem("weekendog:plan-draft")!).data.startTime);
  expect(await storedTime()).toBe("10:00");
  await page.getByRole("button", { name: "이 시간 적용" }).click();
  await expect.poll(() => requestedTimes).toEqual(["10:00", "11:00"]);
  await expect(page.getByLabel("일정 상태")).toContainText("요청 출발 11:00");
  await expect(page.getByRole("button", { name: "이 시간 적용" })).toHaveCount(0);
  expect(await storedTime()).toBe("11:00");
});

test("keeps manual order when applying a schedule proposal and commits the clock only after validation", async ({ page }, testInfo) => {
  await installFakeMap(page);
  let generations = 0;
  const edits: Array<{ orderedPlaceIds: string[]; applyScheduleProposal?: boolean }> = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${GENERATE_PATH}`, async route => {
    generations++;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(completionResponse(futureTripDate(), "10:00", "11:00")) });
  });
  await page.route("**/api/itineraries/revalidate", async route => {
    const request = route.request().postDataJSON(); edits.push(request);
    if (request.applyScheduleProposal) await gate;
    const ready = completionResponse(futureTripDate(), request.applyScheduleProposal ? "11:00" : "10:00", request.applyScheduleProposal ? undefined : "11:00");
    const ordered = request.orderedPlaceIds.map((id: string, index: number) => ({ ...ready.route.stops.find(stop => stop.placeId === id)!, sequence: index + 1 }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ready", apiVersion: ready.apiVersion, route: { ...ready.route, kind: "manual", label: "직접 수정한 일정", stops: ordered }, warnings: [], editSessionId: `v1.${"a".repeat(60)}.${"b".repeat(43)}` }) });
  });
  await openPetPlanner(page, testInfo, "completion-manual-proposal");
  await continueToTrip(page); await chooseConfirmedDeparture(page); await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await page.locator('[id="recommended-stop-tour:1001"]').getByRole("button", { name: "뒤로" }).click();
  await page.getByRole("button", { name: "경로 다시 계산" }).click();
  await expect(page.getByText("직접 수정한 일정", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "이 시간 적용" }).click();
  await expect.poll(() => edits.length).toBe(2);
  expect(edits[1]).toMatchObject({ orderedPlaceIds: ["tour:2001", "tour:1001"], applyScheduleProposal: true });
  const storedTime = () => page.evaluate(() => JSON.parse(localStorage.getItem("weekendog:plan-draft")!).data.startTime);
  expect(await storedTime()).toBe("10:00");
  release();
  await expect(page.getByLabel("일정 상태")).toContainText("요청 출발 11:00");
  expect(await storedTime()).toBe("11:00");
  expect(generations).toBe(1);
  await expect(page.getByRole("list", { name: "직접 수정한 일정 방문 순서" }).locator(":scope > li").first()).toContainText("광안 공식 식당");
  await expect(page.getByRole("button", { name: "이 시간 적용" })).toHaveCount(0);
});

for (const failureCase of [
  { status: "kakao_provider_unavailable", http: 503, message: "실제 이동 경로를 계산하지 못했습니다." },
  { status: "rate_limited", http: 429, message: "공개 장소 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요." },
  { status: "internal_error", http: 500, message: "여행 경로를 만드는 중 문제가 발생했습니다. (참조 번호: a1b2c3d4)" },
]) {
test(`preserves the last valid route after reroll failure and recovers on the next success (${failureCase.status})`, async ({ page }, testInfo) => {
  let attempt = 0;
  await installFakeMap(page);
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    attempt++;
    await route.fulfill({ status: attempt === 2 ? failureCase.http : 200, contentType: "application/json", body: JSON.stringify(attempt === 2 ? { status: failureCase.status, apiVersion: "route-recommendation-response-v2", reasonCodes: ["controlled_failure"], userMessage: failureCase.message, retryable: true } : completionResponse(futureTripDate(), "10:00")) });
  });
  await openPetPlanner(page, testInfo, "completion-retained");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page.getByRole("heading", { name: /에서 시작하는 2곳 일정/u })).toBeVisible();
  await page.getByRole("button", { name: "새로운 장소로 다시 추천" }).click();
  const failure = page.getByRole("alert").filter({ hasText: "마지막으로 성공한 입력 기준" });
  await expect(failure).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: failureCase.message })).toBeVisible();
  await expect(page.getByRole("list", { name: "균형 추천 방문 순서" })).toBeVisible();
  await expect(page.locator("[data-provider-polyline]")).toHaveCount(1);
  await page.getByRole("button", { name: "현재 입력으로 다시 시도" }).click();
  await expect(failure).toHaveCount(0);
  expect(attempt).toBe(3);
});
}

test("removal and undo preserve route state while exclusions survive reroll and refresh", async ({ page }, testInfo) => {
  const exclusions: string[][] = [];
  await installFakeMap(page);
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    exclusions.push(route.request().postDataJSON().personalization.explicitlyExcludedPlaceIds);
    const body = completionResponse(futureTripDate(), "10:00");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await openPetPlanner(page, testInfo, "completion-exclusions");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  const secondStop = page.locator('[id="recommended-stop-tour:2001"]');
  await secondStop.getByRole("button", { name: "제외", exact: true }).click();
  await expect(secondStop).toHaveCount(0);
  await page.getByRole("button", { name: "마지막 제외 실행 취소" }).click();
  await expect(secondStop).toBeVisible();
  await secondStop.getByRole("button", { name: "제외", exact: true }).click();
  await page.getByRole("button", { name: "새로운 장소로 다시 추천" }).click();
  await expect.poll(() => exclusions.length).toBe(2);
  expect(exclusions[1]).toEqual(["tour:2001"]);
  const readExcluded = () => page.evaluate(() => JSON.parse(localStorage.getItem("weekendog:plan-draft")!).data.excludedPlaceIds);
  expect(await readExcluded()).toEqual(["tour:2001"]);
  await page.reload();
  expect(await readExcluded()).toEqual(["tour:2001"]);
});

test("route style tabs support arrow keys, Home, End, and panel association", async ({ page }, testInfo) => {
  await generate(page, testInfo);
  const balanced = page.getByRole("tab", { name: "균형 추천" });
  await balanced.focus();
  await balanced.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "여유 일정" })).toBeFocused().catch(async (error) => {
    console.log("ROUTE_TAB_FOCUS", await page.evaluate(() => ({ id: document.activeElement?.id, tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.slice(0, 100) })));
    throw error;
  });
  await expect(page.getByRole("tab", { name: "여유 일정" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "이동 최소" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(balanced).toBeFocused();
  const panelId = await balanced.getAttribute("aria-controls");
  await expect(page.locator(`[id="${panelId}"]`)).toHaveAttribute("role", "tabpanel");
  await expect(page.getByRole("tab", { name: "여유 일정" })).toHaveAttribute("tabindex", "-1");
});

test("keeps a reroll reachable when public catalog reserve has not yet been road-queried", async ({ page }, testInfo) => {
  const requests: Array<Record<string, unknown>> = [];
  await installFakeMap(page);
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    requests.push(route.request().postDataJSON());
    const body = fullCatalogResponse(requests.length === 1 ? "9001" : "9002");
    body.diversityCapacity = "limited";
    body.diversity = {
      eligibleUniqueCandidateCount: 2,
      requestedStopCount: 3,
      unseenEligibleCandidateCount: 0,
      maximumFeasibleNovelReplacements: 0,
      scoredUniqueCandidateCount: 50,
      unqueriedCandidateCount: 48,
      diversityCapacity: "limited",
      limitingReasonCodes: ["unqueried_catalog_candidates_remain"],
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await openPetPlanner(page, testInfo, "full-catalog-reserve");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page.locator('[id="recommended-stop-kakao:9001"]')).toBeVisible();
  const reroll = page.getByRole("button", { name: "다른 조합 보기", exact: true });
  await expect(reroll).toBeEnabled();
  await expect(page.getByRole("button", { name: "새로운 장소로 다시 추천", exact: true })).toHaveCount(0);
  await expect(page.getByText("확인 필요 장소를 명시적으로 허용하기", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "새 장소 선택 폭을 넓히는 방법", exact: true })).toHaveCount(0);
  await reroll.click();
  await expect(page.locator('[id="recommended-stop-kakao:9002"]')).toBeVisible();
  await expect(page.locator('[id="recommended-stop-kakao:9001"]')).toHaveCount(0);
  await expect(page.getByText("반려동물 동반 가능", { exact: true })).toHaveCount(2);
  expect(requests).toHaveLength(2);
  expect(requests.every(request => !request.conditionConfirmation && !request.conditionAnswers)).toBe(true);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("unqueried-reserve-reroll.png"), fullPage: true });
});

test("registered catalog access stays usable through map, reroll, save and refresh", async ({ page }, testInfo) => {
  const requests: Array<Record<string, unknown>> = [];
  await installFakeMap(page);
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fullCatalogResponse(requests.length === 1 ? "9001" : "9002")) });
  });
  await openPetPlanner(page, testInfo, "full-catalog-warnings");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page.getByRole("heading", { name: /에서 시작하는 2곳 일정/u })).toBeVisible();
  await expect(page.getByText("전체 장소 기반 추천", { exact: true })).toBeVisible();
  await expect(page.getByText("반려동물 동반 가능", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/동반 여부 미확인|원문상 동반 불가|조건부 동반/u)).toHaveCount(0);
  await expect(page.getByText("휴업/폐업 안내 있음 · 원문 확인", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: /균형 추천/u })).toContainText("운영 안내 1곳");
  await expect(page.getByText("축소 결과 · 이동시간 안에 계산한 경로", { exact: true })).toBeVisible();
  await expect(page.getByText("안전하게 완성 가능한 장소만 포함", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "이 일정에 필요한 사실만 확인해 주세요" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "답변한 조건 다시 확인" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("full-catalog-result-warnings.png"), fullPage: true });
  await page.locator('[id="recommended-stop-kakao:9001"]').getByRole("button", { name: /지도에서 보기/u }).click();
  await expect(page.locator('[id="recommended-stop-kakao:9001"]')).toHaveAttribute("data-selected", "true");
  await page.getByRole("button", { name: "새로운 장소로 다시 추천" }).click();
  await expect(page.locator('[id="recommended-stop-kakao:9002"]')).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests.every(request => !request.conditionConfirmation && !request.conditionAnswers)).toBe(true);
  await page.getByRole("button", { name: "일정 저장", exact: true }).click();
  await page.getByRole("link", { name: "저장된 일정 보기" }).click();
  await expect(page).toHaveURL(/\/itinerary$/u);
  await page.reload();
  await expect(page).toHaveURL(/\/itinerary$/u);
  await expect(page.getByText("휴업/폐업 안내 있음 · 원문 확인", { exact: true })).toBeVisible();
  await expect(page.getByText("반려동물 동반 가능", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/동반 여부 미확인|원문상 동반 불가|조건부 동반/u)).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("petpass:saved-route-recommendation")!).data);
  expect(saved.saveState).toBe("draft");
  expect(saved.route.stops.map((item: { petAssessment: string }) => item.petAssessment)).toEqual(["allowed", "allowed"]);
  expect(saved.route.stops[1].catalogEvidence[0].originalText).toBe("반려동물 출입 불가 · 휴업 안내");
  expect(JSON.stringify(saved)).not.toContain(READY.editSessionId);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("full-catalog-saved-warnings.png"), fullPage: true });
});

test("cancels the first generation and ignores its late response before a fresh retry", async ({ page }, testInfo) => {
  let attempts = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await installFakeMap(page);
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    attempts++;
    const attempt = attempts;
    if (attempt === 1) await gate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(completionResponse(futureTripDate(), "10:00")) }).catch(() => undefined);
  });
  await openPetPlanner(page, testInfo, "completion-cancel");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page.getByRole("status", { name: "맞춤 일정 생성 상태" })).toBeVisible();
  await page.getByRole("button", { name: "요청 취소" }).click();
  await expect(page.getByRole("button", { name: "추천 일정 만들기", exact: true })).toBeVisible();
  release();
  await expect(page.getByRole("heading", { name: /에서 시작하는 2곳 일정/u })).toHaveCount(0);
  await page.getByRole("button", { name: "추천 일정 만들기", exact: true }).click();
  await expect(page.getByRole("heading", { name: /에서 시작하는 2곳 일정/u })).toBeVisible();
  expect(attempts).toBe(2);
});
