import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  chooseConfirmedDeparture,
  continueToTrip,
  DEPARTURE_PATH,
  expectNoHorizontalOverflow,
  GENERATE_PATH,
  openPetPlanner,
} from "./planner-test-helpers";

const stop = (id: string, sequence: number, title: string, category: "attraction" | "food") => ({
  placeId: id,
  sequence,
  title,
  address: `부산광역시 공식로 ${sequence}`,
  coordinates: { latitude: 35.11 + sequence * 0.02, longitude: 129.04 + sequence * 0.02 },
  category,
  arrivalAt: `2026-08-15T0${sequence + 1}:00:00.000Z`,
  visitStartsAt: `2026-08-15T0${sequence + 1}:00:00.000Z`,
  departureAt: `2026-08-15T0${sequence + 2}:00:00.000Z`,
  dwellMinutes: category === "food" ? 60 : 90,
  driveSecondsFromPrevious: 900 * sequence,
  distanceMetersFromPrevious: 3_200 * sequence,
  source: "tourism_service2" as const,
  sourceLabel: "한국관광공사" as const,
  petAssessment: sequence === 1 ? "allowed" as const : "conditional" as const,
  mandatoryConditions: sequence === 1 ? [] : [{ type: "leash_required", label: "목줄 착용 필수", manualConfirmationRecommended: false }],
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

const READY = {
  status: "ready" as const,
  apiVersion: "route-recommendation-response-v1" as const,
  engineVersion: "petpass-route-engine-v1" as const,
  objectiveVersion: "route-objective-v1" as const,
  solverVersion: "route-solver-v1" as const,
  editSessionId: "792f3903-b879-4d53-93ba-85aa7d52a27f",
  requestSummary: {
    departureLabel: "부산광역시 연제구 중앙대로 1001",
    tripDate: "2026-08-15",
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
      startAt: "2026-08-15T01:00:00.000Z",
      endAt: "2026-08-15T05:00:00.000Z",
      stopCount: 2,
      totalDistanceMeters: 9_600,
      totalDrivingSeconds: 2_700,
      totalVisitSeconds: 9_000,
      totalWaitSeconds: 0,
    },
    temporalBasis: { searchMatrix: "traffic_independent", finalRoute: "current_traffic" },
    stops: mainStops,
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
        startAt: "2026-08-15T01:00:00.000Z",
        endAt: "2026-08-15T04:40:00.000Z",
        stopCount: 2,
        totalDistanceMeters: 7_400,
        totalDrivingSeconds: 2_100,
        totalVisitSeconds: 9_000,
        totalWaitSeconds: 0,
      },
      temporalBasis: { searchMatrix: "traffic_independent", finalRoute: "current_traffic" },
      stops: [
        { ...mainStops[1], sequence: 1, arrivalAt: "2026-08-15T01:20:00.000Z", departureAt: "2026-08-15T02:20:00.000Z" },
        { ...mainStops[0], sequence: 2, arrivalAt: "2026-08-15T02:40:00.000Z", departureAt: "2026-08-15T04:10:00.000Z" },
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

async function installFakeMap(page: Page) {
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

async function generate(page: Page, testInfo: TestInfo, response = READY) {
  await installFakeMap(page);
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    await route.fulfill({ status: response.status === "ready" ? 200 : 422, contentType: "application/json", body: JSON.stringify(response) });
  });
  await openPetPlanner(page, testInfo, "stage5-ui");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
}

test("shows a deliberate empty recommendation state without a request", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === GENERATE_PATH) requests.push(request.url()); });
  await page.goto("/results?tab=recommendations");
  await expect(page.getByRole("heading", { name: "여행 조건이 아직 확정되지 않았어요." })).toBeVisible();
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
  await page.getByRole("button", { name: "여행 추천 받기" }).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
  await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
  await expect(page.getByRole("heading", { name: /에서 시작하는 2곳 일정/u })).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({
    departure: { label: "부산광역시 연제구 중앙대로 1001", source: "address_search" },
    trip: { regionId: "busan", tripPace: "balanced", selectedCategories: ["attraction", "food"] },
    pet: { species: "DOG", size: "SMALL", availableEquipment: { carrier: true, leash: true, muzzle: false } },
  });
  await expect(page.getByText("현재 후보와 확인된 이동 정보 안에서 가장 적합한 일정을 찾았습니다.")).toBeVisible();
  await expect(page.getByText(/9\.6km · 약 45분/u)).toBeVisible();
  await expect(page.getByText(/관광지 · 한국관광공사/u)).toBeVisible();
  await expect(page.getByText("동반 가능", { exact: true })).toBeVisible();
  await expect(page.getByText("조건부 가능", { exact: true })).toBeVisible();
  await expect(page.getByText(/목줄 착용 필수/u)).toBeVisible();
  await expect(page.getByText("인허가 데이터 추가 확인 필요", { exact: true })).toBeVisible();
  await page.getByText("추천 근거와 확인사항", { exact: true }).first().click();
  await expect(page.getByText("선택하신 장소 유형과 잘 맞습니다.").first()).toBeVisible();
  await expect(page.getByText("한국관광공사의 반려동물 동반 근거를 확인했습니다.").first()).toBeVisible();
  await expect(page.getByText(/2830|품질.*%|카카오 검색 후보|인기 장소 중심 일정/u)).toHaveCount(0);
  await expect(page.locator("[data-provider-polyline]")).toHaveAttribute("data-provider-polyline", "3");
  await expect(page.locator(".kakao-map-marker--departure")).toContainText("출");
  await expect(page.locator(".kakao-map-marker--itinerary")).toHaveCount(2);
  const secondMarker = page.locator('.kakao-map-marker[data-location-id="2001"]');
  await secondMarker.click();
  await expect(page.locator("#recommended-stop-2001")).toHaveClass(/ring-2/u);
});

test("switches a validated alternative without rerunning providers and updates summary, order, and geometry", async ({ page }, testInfo) => {
  let generationRequests = 0;
  await installFakeMap(page);
  await page.route(`**${GENERATE_PATH}`, async (route) => {
    generationRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(READY) });
  });
  await openPetPlanner(page, testInfo, "stage5-alternative");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await page.getByRole("tab", { name: "이동이 적은 일정" }).click();
  await expect(page.getByText(/7\.4km · 약 35분/u)).toBeVisible();
  await expect(page.getByRole("list", { name: /이동이 적은 일정 방문 순서/u }).locator(":scope > li").first()).toContainText("광안 공식 식당");
  await expect(page.locator('[data-location-id="2001"]')).toContainText("1");
  expect(generationRequests).toBe(1);
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
  await expect(page.getByText("경로 재계산 필요", { exact: true })).toBeVisible();
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
      const measured = text.includes("petpass-route-engine-v1");
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
  await page.goto("/planner/pet");
  await expect(page.getByRole("heading", { name: "여행 정보 입력" })).toBeVisible();
  await page.goto("/itinerary");
  await expect(page.getByText("저장된 일정", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "추천 일정" })).toBeVisible();
  await expect(page.getByRole("list", { name: "저장된 일정 방문 순서" }).locator(":scope > li")).toHaveCount(2);
  await expect(page.getByText("해운대 공식 공원")).toBeVisible();
  await expect(page.getByText("광안 공식 식당")).toBeVisible();
  await expect(page.getByText(/9\.6km/u)).toBeVisible();
  await expect(page.getByText(/45분/u)).toBeVisible();
  await expect(page.getByText(/저장 당시 확인된 경로 정보/u)).toBeVisible();
  expect(providerRequests).toEqual([]);

  const firstMetrics = await page.evaluate(() =>
    (window as unknown as { __savedRouteStorageMetrics: { reads: number; parses: number; parseDurationMs: number } }).__savedRouteStorageMetrics,
  );
  expect(firstMetrics.reads).toBe(1);
  expect(firstMetrics.parses).toBe(1);

  await page.reload();
  await expect(page.getByText("저장된 일정", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "추천 일정" })).toBeVisible();
  const refreshMetrics = await page.evaluate(() =>
    (window as unknown as { __savedRouteStorageMetrics: { reads: number; parses: number; parseDurationMs: number } }).__savedRouteStorageMetrics,
  );
  expect(refreshMetrics.reads).toBe(1);
  expect(refreshMetrics.parses).toBe(1);
  expect(providerRequests).toEqual([]);

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("저장된 일정", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "저장된 일정 방문 순서" })).toBeVisible();
  }
  expect(browserErrors).toEqual([]);
  await expect(page.locator("[data-nextjs-error-overlay], [data-nextjs-dialog]")).toHaveCount(0);
  console.log(`SAVED_ROUTE_METRICS ${JSON.stringify({ storageBytes, firstMetrics, refreshMetrics, providerRequests: providerRequests.length })}`);
});

test("clears only a corrupt saved recommendation and keeps the neutral itinerary state", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("petpass:saved-route-recommendation", "{broken");
    localStorage.setItem("petpass:pet-profile", "unrelated-profile");
  });
  await page.goto("/itinerary");
  await expect(page.getByRole("heading", { name: "선택된 추천 경로가 없습니다." })).toBeVisible();
  const values = await page.evaluate(() => ({
    saved: localStorage.getItem("petpass:saved-route-recommendation"),
    profile: localStorage.getItem("petpass:pet-profile"),
  }));
  expect(values).toEqual({ saved: null, profile: "unrelated-profile" });
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
  await expect(page.getByRole("list", { name: /추천 일정 방문 순서/u }).locator(":scope > li")).toHaveCount(2);
});

test("shows truthful staged loading labels without fake percentages", async ({ page }, testInfo) => {
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
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
  await expect(page.getByText("방문 가능한 공식 장소를 확인하고 있어요")).toBeVisible();
  await expect(page.getByText("최종 이동 경로를 확인하고 있어요")).toBeVisible();
  await expect(page.getByText(/\d+%/u)).toHaveCount(0);
  release!();
  await expect(page.getByRole("heading", { name: /에서 시작하는 2곳 일정/u })).toBeVisible();
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
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page.getByRole("alert", { name: "일정을 표시할 수 없어요" })).toContainText("실제 이동 경로를 계산하지 못했습니다");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByText("제한 시간 안에서 확인한 일정 중 가장 적합한 결과입니다.")).toBeVisible();
  expect(attempt).toBe(2);
});

test("keeps the Stage 5 result usable at desktop, tablet, and mobile widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The explicit viewport matrix runs once.");
  await generate(page, testInfo);
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("heading", { name: /에서 시작하는 2곳 일정/u })).toBeVisible();
    await expect(page.getByRole("list", { name: /추천 일정 방문 순서/u })).toBeVisible();
    const map = page.locator(".kakao-map-canvas");
    await expect(map).toBeVisible();
    expect((await map.boundingBox())?.height ?? 0).toBeGreaterThan(280);
  }
});
