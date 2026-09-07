import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  DEPARTURE_PATH,
  GENERATE_PATH,
  futureTripDate,
  chooseConfirmedDeparture,
  continueToDay,
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

test("opens automatic planning outside Busan and offers all 17 regions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "여행 지역" }).selectOption("seoul");
  const recommend = page.getByRole("button", { name: "장소 없이 알아서 추천받기" });
  await expect(recommend).toBeEnabled();
  await recommend.focus();
  await page.keyboard.press("Enter");
  await continueToTrip(page);
  const regions = page.getByLabel("여행 지역", { exact: true });
  await expect(regions).toHaveValue("11");
  await expect(regions.locator("option")).toHaveCount(17);
  await regions.selectOption("51");
  await expect(regions).toHaveValue("51");
  await expectNoHorizontalOverflow(page);
});

test("offers explicit planning length controls while keeping the pace choice", async ({
  page,
}) => {
  await page.goto("/planner/pet");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  const relaxed = page.getByRole("radio", { name: /여유롭게/u });
  const balanced = page.getByRole("radio", { name: /적당히/u });
  const packed = page.getByRole("radio", { name: /알차게/u });

  await expect(relaxed).toBeVisible();
  await expect(balanced).toBeChecked();
  await expect(packed).toBeVisible();
  await packed.check({ force: true });
  await expect(packed).toBeChecked();
  await expect(balanced).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "방문 장소 수 기준" })).toBeChecked();
  await expect(page.getByRole("spinbutton", { name: "방문 장소 수" })).toHaveValue("5");
  await expect(page.getByRole("spinbutton", { name: "전체 일정 시간" })).toBeHidden();
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

async function open(page: Page, testInfo: TestInfo) {
  await openPetPlanner(page, testInfo, "unified-planner");
  await expect(
    page.getByRole("navigation", { name: "여행 만들기 단계" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "여행 정보 입력 단계" })
      .locator('li[aria-current="step"]'),
  ).toContainText("반려동물");
}

test("shows only the neutral pet step without sample selections", async ({
  page,
}, testInfo) => {
  await open(page, testInfo);

  await expect(page.getByRole("heading", { name: "반려동물 정보" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "출발지와 시간" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "원하는 하루" })).toBeHidden();
  await expect(page.getByRole("textbox", { name: "반려동물 이름" })).toHaveValue("");
  await expect(page.locator('input[name="species"]:checked')).toHaveCount(0);
  await expect(page.locator('input[name="size"]:checked')).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "이동장", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "목줄", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "입마개", exact: true })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "상관없음" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "실내 우선" })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "야외 우선" })).not.toBeChecked();
  await expect(page.getByLabel("추천 데이터 안내")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "출발지와 시간 입력" })).toBeVisible();

  await page.getByRole("textbox", { name: "반려동물 이름" }).fill("보리");
  await page.getByRole("radio", { name: "강아지", exact: true }).check({ force: true });
  await page.getByRole("radio", { name: /^소형/u }).check({ force: true });
  await page.getByRole("button", { name: "출발지와 시간 입력" }).click();
  await expect(page.getByLabel("여행 날짜")).toHaveValue("");
  await expect(page.getByLabel("시작 시간")).toHaveValue("");

  await page.goto("/planner/trip");
  await expect(page).toHaveURL(/\/planner\/pet$/u);
});

test("validates only the current step and focuses its first missing field", async ({
  page,
}, testInfo) => {
  await open(page, testInfo);
  await page.getByRole("button", { name: "출발지와 시간 입력" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "반려동물 이름을 1자 이상 30자 이하로 입력해 주세요.",
    }),
  ).toBeVisible();
  const petName = page.getByRole("textbox", { name: "반려동물 이름" });
  await expect(petName).toBeFocused();
  await expect(petName).toHaveAttribute("aria-invalid", "true");
  await expect(petName).toHaveAttribute("aria-describedby", "pet-name-error");
  await expect(page.getByText("검색 결과나 지도에서 실제 출발지를 선택해 주세요.")).toHaveCount(0);
  await expect(page).toHaveURL(/\/planner\/pet$/u);
});

test("shows only completed values in the planner summary", async ({
  page,
}, testInfo) => {
  await open(page, testInfo);
  const summary = page.getByRole("complementary", {
    name: "입력한 여행 조건",
  });

  await expect(summary).toContainText("입력을 시작하면");
  await expect(summary).toContainText("선택한 여행 조건이 여기에 정리됩니다.");
  await expect(summary).not.toContainText(/입력 전|선택 전/u);

  await continueToTrip(page);
  await expect(summary).toContainText("보리 · 강아지 · 소형");
  await expect(summary).not.toContainText("출발지 선택 전");

  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await expect(summary).toContainText("부산광역시 연제구 중앙대로 1001 출발");
  await expect(summary).toContainText(`${futureTripDate()} · 10:00`);
  await expect(summary).toContainText("당일치기 · 적당히");
  await expect(summary).toContainText("관광지 · 음식점");
});

test("keeps the departure error inline and focuses the search input", async ({
  page,
}, testInfo) => {
  await open(page, testInfo);
  await continueToTrip(page);
  await page.getByRole("button", { name: "원하는 하루 입력" }).click();

  const departure = page.getByRole("combobox", { name: "출발지" });
  await expect(departure).toBeFocused();
  await expect(departure).toHaveAttribute("aria-invalid", "true");
  await expect(departure).toHaveAttribute(
    "aria-describedby",
    /departure-error/u,
  );
  await expect(
    page.getByRole("alert").filter({
      hasText: "검색 결과나 지도에서 실제 출발지를 선택해 주세요.",
    }),
  ).toBeVisible();
});

test("preserves entered values when moving back between steps", async ({
  page,
}, testInfo) => {
  await open(page, testInfo);
  await continueToTrip(page);
  await page.getByRole("button", { name: "이전 단계" }).click();
  await expect(page.getByRole("textbox", { name: "반려동물 이름" })).toHaveValue("보리");
  await expect(page.getByRole("checkbox", { name: "이동장", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "목줄", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "반려동물 정보" })).toBeFocused();
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
  await continueToDay(page);

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
      date: futureTripDate(),
      startTime: "10:00",
      tripPace: "balanced",
      selectedCategories: ["attraction", "food"],
    },
    pet: {
      species: "DOG",
      size: "SMALL",
    },
  });
  expect(requests[0]?.pet).not.toHaveProperty("availableEquipment");
  expect(requests[0]?.pet).not.toHaveProperty("acceptsOutdoorOnlyPlaces");
});

test("uses a map-picked departure coordinate for routing", async ({ page }, testInfo) => {
  await open(page, testInfo);
  await continueToTrip(page);

  await page.getByRole("button", { name: "지도에서 선택" }).click();
  await page.getByRole("group", { name: "출발지 선택 지도" }).click({ position: { x: 120, y: 100 } });
  const input = page.getByRole("combobox", { name: "출발지" });
  await expect(input).toHaveValue(/지도에서 선택한 위치/u);
  await continueToDay(page);

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

test("uses the browser current location as the confirmed departure", async ({
  page,
}, testInfo) => {
  await page.context().grantPermissions(["geolocation"], {
    origin: "http://localhost:3000",
  });
  await page.context().setGeolocation({
    latitude: 35.1795543,
    longitude: 129.0756416,
  });
  await open(page, testInfo);
  await continueToTrip(page);

  await page.getByRole("button", { name: "내 위치", exact: true }).click();
  const input = page.getByRole("combobox", { name: "출발지" });
  await expect(input).toHaveValue("내 위치");
  await expect(page.getByText("현재 위치를 출발지로 설정했습니다.")).toBeAttached();
  await continueToDay(page);

  const requestPromise = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === GENERATE_PATH &&
      request.method() === "POST",
  );
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === GENERATE_PATH &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  const request = await requestPromise;
  expect(request.postDataJSON()).toMatchObject({
    departure: {
      label: "내 위치",
      latitude: 35.1795543,
      longitude: 129.0756416,
      source: "current_location",
    },
  });
  expect((await responsePromise).status()).toBe(200);
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
        error: { message: "서버 환경변수 KAKAO_REST_API_KEY가 설정되지 않았습니다." },
      }),
    });
  });
  await open(page, testInfo);
  await continueToTrip(page);
  const input = page.getByRole("combobox", { name: "출발지" });
  await input.fill("부산 느린 장소");
  await page.waitForRequest((request) => new URL(request.url()).searchParams.get("query") === "부산 느린 장소");
  await input.fill("부산 검색 실패");
  await expect(page.getByText("출발지 검색 제공처 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.")).toBeVisible();
  await expect(page.getByText(/KAKAO_REST_API_KEY|환경변수|API 키|개발자 콘솔/u)).toHaveCount(0);
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

test("does not advance or submit on early Enter and ignores IME composition Enter", async ({
  page,
}, testInfo) => {
  await open(page, testInfo);
  const name = page.getByRole("textbox", { name: "반려동물 이름" });
  await name.fill("보리");
  await name.press("Enter");
  await expect(page.getByRole("heading", { name: "반려동물 정보" })).toBeVisible();
  await continueToTrip(page);

  const input = page.getByRole("combobox", { name: "출발지" });
  await input.fill("부산역");
  await expect(page.getByRole("option", { name: /부산역 공통 결과/u })).toBeVisible();
  await input.evaluate((node) => {
    node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    node.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      isComposing: true,
    }));
    node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  });
  await expect(input).toHaveValue("부산역");
  await expect(page.getByRole("heading", { name: "출발지와 시간" })).toBeVisible();
});

test("runs the original full validation on the final action and moves focus to an earlier invalid step", async ({
  page,
}, testInfo) => {
  await open(page, testInfo);
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  await page.locator("#trip-date").evaluate((node) => {
    const input = node as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "2000-01-01");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page.getByRole("heading", { name: "출발지와 시간" })).toBeVisible();
  await expect(page.getByLabel("여행 날짜")).toBeFocused();
  await expect(page.getByText("오늘 이후 날짜를 선택하거나 날짜 미정으로 바꿔 주세요.")).toBeVisible();
  await expect(page).toHaveURL(/\/planner\/pet$/u);
});

test("keeps the combined planner responsive at all required widths", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The viewport matrix runs once.");

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1024, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await open(page, testInfo);
    await continueToTrip(page);
    await expect(page.getByRole("button", { name: "지도에서 선택" })).toBeVisible();
    await chooseConfirmedDeparture(page);
    await continueToDay(page);
    await expect(page.getByRole("button", { name: "여행 추천 받기" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("keeps the existing demo detail and provider validation boundaries", async ({
  page,
  request,
}) => {
  await page.goto("/places/demo-busan-terrace-table?contentTypeId=39&region=busan");
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

test("disables planner inputs until hydration and preserves the first fast edit", async ({ page }) => {
  let release!: () => void;
  const scriptsReady = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?|$)/u, async (route) => {
    await scriptsReady;
    await route.continue().catch(() => undefined);
  });
  await page.goto("/planner/pet", { waitUntil: "commit" });
  const name = page.getByRole("textbox", { name: "반려동물 이름" });
  try {
    await expect(name).toBeVisible();
    await expect(name).toBeDisabled();
    await expect(page.getByRole("button", { name: "출발지와 시간 입력" })).toBeDisabled();
  } finally {
    release();
  }
  await expect(name).toBeEnabled();
  await name.fill("보리");
  await page.getByRole("radio", { name: "강아지", exact: true }).check({ force: true });
  await page.getByRole("radio", { name: /^소형/u }).check({ force: true });
  await expect(name).toHaveValue("보리");
  await page.getByRole("button", { name: "출발지와 시간 입력" }).click();
  await expect(page.getByRole("heading", { name: "출발지와 시간" })).toBeVisible();
});
