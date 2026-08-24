import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  DEPARTURE_PATH,
  GENERATE_PATH,
  continueToTrip,
  expectNoHorizontalOverflow,
  openPetPlanner,
} from "@/tests/e2e/planner-test-helpers";

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  await installFakeCoordinatePicker(page);
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([]);
  await expect(
    page.locator("[data-nextjs-error-overlay], [data-nextjs-dialog]"),
  ).toHaveCount(0);
});

test("uses one trip-pace choice instead of technical length controls", async ({
  page,
}) => {
  await page.goto("/planner/pet");
  const relaxed = page.getByRole("radio", { name: /여유롭게/u });
  const balanced = page.getByRole("radio", { name: /적당히/u });
  const packed = page.getByRole("radio", { name: /알차게/u });

  await expect(relaxed).toBeVisible();
  await expect(balanced).toBeChecked();
  await expect(packed).toBeVisible();
  await packed.check({ force: true });
  await expect(packed).toBeChecked();
  await expect(balanced).not.toBeChecked();
  await expect(page.getByText("방문 장소 수", { exact: true })).toHaveCount(0);
  await expect(page.getByText("전체 일정 시간", { exact: true })).toHaveCount(0);
});

function installFakeCoordinatePicker(page: Page) {
  return page.addInitScript(() => {
    type Listener = (...args: unknown[]) => void;
    const listeners = new WeakMap<object, Map<string, Set<Listener>>>();
    const emit = (target: object, name: string, ...args: unknown[]) => {
      listeners.get(target)?.get(name)?.forEach((handler) => handler(...args));
    };

    class FakeLatLng {
      constructor(
        private readonly latitude: number,
        private readonly longitude: number,
      ) {}
      getLat() { return this.latitude; }
      getLng() { return this.longitude; }
    }
    class FakeMap {
      constructor(container: HTMLElement) {
        container.addEventListener("click", () => {
          emit(this, "click", { latLng: new FakeLatLng(35.1151, 129.0414) });
        });
      }
      getBounds() { return null; }
      getCenter() { return new FakeLatLng(35.1796, 129.0756); }
      panTo() {}
      relayout() {}
      setBounds() {}
    }
    class FakeMarker {
      setImage() {}
      setMap() {}
      setPosition() {}
      setZIndex() {}
    }
    class FakeClusterer {
      addMarkers() {}
      clear() {}
    }

    window.kakao = {
      maps: {
        load: (callback: () => void) => callback(),
        event: {
          addListener(target: object, name: string, handler: Listener) {
            const targetListeners = listeners.get(target) ?? new Map();
            const eventListeners = targetListeners.get(name) ?? new Set();
            eventListeners.add(handler);
            targetListeners.set(name, eventListeners);
            listeners.set(target, targetListeners);
          },
          removeListener(target: object, name: string, handler: Listener) {
            listeners.get(target)?.get(name)?.delete(handler);
          },
        },
        LatLng: FakeLatLng,
        Map: FakeMap,
        Marker: FakeMarker,
        MarkerClusterer: FakeClusterer,
      } as unknown as NonNullable<Window["kakao"]>["maps"],
    };
  });
}

async function expectPlannerStep(page: Page, label: string) {
  const progress = page.getByRole("navigation", { name: "여행 만들기 단계" });
  await expect(progress).toBeVisible();
  const activeStep = progress.locator('li[aria-current="step"]:visible');
  await expect(activeStep).toHaveCount(1);
  await expect(activeStep).toContainText(label);
}

async function open(page: Page, testInfo: TestInfo) {
  await openPetPlanner(page, testInfo, "unified-planner");
  await expectPlannerStep(page, "정보 입력");
}

test("shows one neutral combined input screen without sample selections", async ({
  page,
}, testInfo) => {
  await open(page, testInfo);

  await expect(page.getByRole("heading", { name: /1\s+반려동물 정보/u })).toBeVisible();
  await expect(page.getByRole("heading", { name: /2\s+여행 조건/u })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "반려동물 이름" })).toHaveValue("");
  await expect(page.locator('input[name="species"]:checked')).toHaveCount(0);
  await expect(page.locator('input[name="size"]:checked')).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "이동장", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "목줄", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "입마개", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: /야외 전용 장소도 포함해요/u })).not.toBeChecked();
  await expect(page.getByLabel("여행 날짜")).toHaveValue("");
  await expect(page.getByLabel("시작 시간")).toHaveValue("");
  await expect(page.locator('input[id^="category-"]:checked')).toHaveCount(0);
  await expect(page.getByLabel("추천 데이터 안내")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "여행 추천 받기" })).toBeVisible();

  await page.goto("/planner/trip");
  await expect(page).toHaveURL(/\/planner\/pet$/u);
});

test("validates the combined form and focuses the first missing field", async ({
  page,
}, testInfo) => {
  await open(page, testInfo);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "반려동물 이름을 1자 이상 30자 이하로 입력해 주세요.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "반려동물 이름" })).toBeFocused();
  await expect(page).toHaveURL(/\/planner\/pet$/u);
});

test("searches a departure by place name and generates exactly once", async ({
  page,
}, testInfo) => {
  await open(page, testInfo);
  await continueToTrip(page);

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === DEPARTURE_PATH && url.searchParams.get("query") === "부산역";
  });
  const input = page.getByRole("combobox", { name: "출발지" });
  await input.fill("부산역");
  expect((await responsePromise).status()).toBe(200);
  const placeOption = page.getByRole("option", { name: /부산역 공통 결과/u });
  await expect(placeOption).toBeVisible();
  await placeOption.click();
  await expect(input).toHaveValue("부산역 공통 결과");

  const requests: Array<Record<string, unknown>> = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === GENERATE_PATH && request.method() === "POST") {
      requests.push(request.postDataJSON() as Record<string, unknown>);
    }
  });
  const generationResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === GENERATE_PATH &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "여행 추천 받기" }).evaluate((node) => {
    const button = node as HTMLButtonElement;
    button.click();
    button.click();
  });

  const generated = await generationResponse;
  expect(generated.status()).toBe(200);
  await expect(generated.json()).resolves.toMatchObject({
    status: "ready",
    route: { kind: "optimized" },
  });
  await expect(page).toHaveURL(/\/results\?tab=recommendations&region=busan$/u);
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({
    departure: {
      label: "부산역 공통 결과",
      source: "kakao_place_search",
    },
    trip: {
      date: "2026-08-15",
      startTime: "10:00",
      tripPace: "balanced",
      selectedCategories: ["attraction", "food"],
    },
    pet: {
      species: "DOG",
      size: "SMALL",
      acceptsOutdoorOnlyPlaces: false,
      availableEquipment: { carrier: true, leash: true, muzzle: false },
    },
  });
});

test("uses a map-picked departure coordinate for routing", async ({ page }, testInfo) => {
  await open(page, testInfo);
  await continueToTrip(page);

  await page.getByRole("button", { name: "지도에서 선택" }).click();
  await page.getByRole("group", { name: "출발지 선택 지도" }).click({ position: { x: 120, y: 100 } });
  const input = page.getByRole("combobox", { name: "출발지" });
  await expect(input).toHaveValue(/지도에서 선택한 위치/u);

  const requestPromise = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === GENERATE_PATH && request.method() === "POST",
  );
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  const request = await requestPromise;
  expect(request.postDataJSON()).toMatchObject({
    departure: {
      latitude: 35.1151,
      longitude: 129.0414,
      source: "map_selection",
    },
  });
});

test("never selects a stale or failed departure response", async ({
  page,
}, testInfo) => {
  await page.route(`**${DEPARTURE_PATH}?**`, async (route) => {
    const query = new URL(route.request().url()).searchParams.get("query");
    if (query === "부산 느린 장소") {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: [{
            id: "place:slow",
            kind: "place",
            label: "느린 장소",
            address: "부산광역시 느린로 1",
            coordinates: { latitude: 35.1, longitude: 129.1 },
          }],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { message: "출발지 검색 제공자가 응답하지 않았습니다." },
      }),
    });
  });
  await open(page, testInfo);
  const input = page.getByRole("combobox", { name: "출발지" });
  await input.fill("부산 느린 장소");
  await page.waitForRequest((request) => new URL(request.url()).searchParams.get("query") === "부산 느린 장소");
  await input.fill("부산 검색 실패");
  await expect(page.getByText("출발지 검색 제공자가 응답하지 않았습니다.")).toBeVisible();
  await page.waitForTimeout(800);
  const expectedNetworkError =
    "Failed to load resource: the server responded with a status of 502 (Bad Gateway)";
  await expect.poll(() => browserErrors.get(page) ?? []).toContain(
    expectedNetworkError,
  );
  browserErrors.set(
    page,
    (browserErrors.get(page) ?? []).filter(
      (message) => message !== expectedNetworkError,
    ),
  );
  await expect(page.getByRole("option", { name: /느린 장소/u })).toHaveCount(0);
  await expect(input).toHaveValue("부산 검색 실패");
});

test("keeps the combined planner responsive at all required widths", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The viewport matrix runs once.");

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await open(page, testInfo);
    await expect(page.getByRole("button", { name: "지도에서 선택" })).toBeVisible();
    await expect(page.getByRole("button", { name: "여행 추천 받기" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("keeps the existing demo detail and provider validation boundaries", async ({
  page,
  request,
}) => {
  await page.goto("/places/demo-busan-terrace-table");
  await expect(page.getByRole("heading", { name: "마린 테라스 식탁" })).toBeVisible();
  await expect(page.locator("blockquote")).toBeVisible();
  await expect(page.getByLabel("로컬 데모 데이터")).toBeVisible();

  const response = await request.get("/api/tour/places?contentTypeId=75", {
    headers: { "x-forwarded-for": `planner-provider-boundary-${test.info().project.name}` },
  });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: { code: "INVALID_REQUEST", retryable: false },
  });
});
