import { expect, test, type Page, type Route } from "@playwright/test";
import type {
  HomepageFeaturedPlace,
  TourHomepageSnapshot,
} from "@/types/homepage";
import type {
  TourPlaceCategory,
  TourPlaceSummary,
  TourSourceReference,
} from "@/types/place";
import type { TourPetAccessAssessment } from "@/types/tour-pet-access";

const HOMEPAGE_API = "**/api/tour/homepage";
const GENERATE_API_PATH = "/api/itineraries/generate";
const RETRIEVED_AT = "2026-08-14T02:00:00.000Z";
const NETWORK_BOUNDARY_TEST =
  "loads one homepage snapshot and no unrelated provider routes";

const CATALOG_SOURCE: TourSourceReference = {
  provider: "Korea Tourism Organization",
  operation: "areaBasedList2",
  retrievedAt: RETRIEVED_AT,
};

function createSummary({
  contentId,
  title,
  contentTypeId,
  category,
  address,
  districtCode,
  latitude,
  longitude,
}: {
  contentId: string;
  title: string;
  contentTypeId: TourPlaceSummary["contentTypeId"];
  category: TourPlaceCategory;
  address: string;
  districtCode: string;
  latitude: number | null;
  longitude: number | null;
}): TourPlaceSummary {
  return {
    contentId,
    contentTypeId,
    providerContentTypeId: contentTypeId,
    category,
    title,
    address,
    detailAddress: null,
    longitude,
    latitude,
    phone: null,
    thumbnailUrl: null,
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime: null,
    legalRegionCode: "26",
    legalDistrictCode: districtCode,
    classificationCodes: {
      primary: null,
      secondary: null,
      tertiary: null,
      largeCategory: null,
      middleCategory: null,
      smallCategory: null,
    },
    providerVisibility: {
      status: "exposed",
      providerField: "providerVisibility",
      providerValue: "Y",
      checkedAt: RETRIEVED_AT,
      reasonCodes: ["homepage-e2e-visible"],
    },
    source: { ...CATALOG_SOURCE, contentId },
  };
}

function createAssessment(
  contentId: string,
  verdict: TourPetAccessAssessment["verdict"],
  evaluationState: TourPetAccessAssessment["evaluationState"],
): TourPetAccessAssessment {
  const complete = evaluationState === "complete";
  const allowed = verdict === "allowed" && complete;

  return {
    rulesetVersion: "1",
    verdict,
    evaluationState,
    confidence: allowed ? "high" : "low",
    reasonCodes: allowed
      ? ["explicit_allowance"]
      : verdict === "conditional"
        ? ["material_condition"]
        : ["no_meaningful_evidence"],
    summary: allowed
      ? "공식 원문에서 반려동물 동반 가능을 확인했습니다."
      : "상세 동반 조건을 추가로 확인해야 합니다.",
    permittedScopes: allowed ? ["whole_place"] : [],
    restrictedScopes: [],
    conditions:
      verdict === "conditional"
        ? [
            {
              type: "advance_inquiry_required",
              scope: "unknown",
              label: "방문 전 문의 필요",
              sourceText: "방문 전 문의",
              evidenceIds: [`${contentId}-evidence`],
              manualConfirmationRecommended: true,
            },
          ]
        : [],
    evidence: complete
      ? [
          {
            id: `${contentId}-evidence`,
            operation: "detailPetTour2",
            field: "acmpyTypeCd",
            fieldLabel: "동반 유형",
            originalText: allowed ? "반려동물 동반 가능" : "방문 전 문의",
            assertion: allowed ? "allows" : "limits",
            scope: allowed ? "whole_place" : "unknown",
            priority: 1,
            providerModifiedTime: null,
          },
        ]
      : [],
    conflicts: [],
    verificationItems: complete
      ? []
      : [
          {
            code: "confirm_missing_source",
            label: "공식 원문을 다시 확인해 주세요.",
            evidenceIds: [],
          },
        ],
    evaluatedAt: RETRIEVED_AT,
    providerModifiedTime: null,
    sources: [
      {
        operation: "detailPetTour2",
        status: complete ? "available" : "unavailable",
        retrievedAt: RETRIEVED_AT,
        providerModifiedTime: null,
      },
    ],
    warnings: [],
  };
}

function createFeaturedPlace(
  summary: TourPlaceSummary,
  verdict: TourPetAccessAssessment["verdict"],
  evaluationState: TourPetAccessAssessment["evaluationState"],
): HomepageFeaturedPlace {
  return {
    summary,
    assessment: createAssessment(summary.contentId, verdict, evaluationState),
    source: {
      provider: "Korea Tourism Organization",
      operation: "detailPetTour2",
      retrievedAt: RETRIEVED_AT,
      contentId: summary.contentId,
    },
  };
}

const ALLOWED_WALK = createSummary({
  contentId: "homepage-allowed-walk",
  title: "해운대 달맞이 산책로",
  contentTypeId: "12",
  category: "attraction",
  address: "부산광역시 해운대구 달맞이길 1",
  districtCode: "350",
  latitude: 35.1587,
  longitude: 129.16,
});

const CONDITIONAL_CAFE = createSummary({
  contentId: "homepage-conditional-cafe",
  title: "광안리 조건 확인 카페",
  contentTypeId: "39",
  category: "food",
  address: "부산광역시 수영구 광안해변로 1",
  districtCode: "500",
  latitude: 35.1532,
  longitude: 129.1187,
});

const ALLOWED_PARK = createSummary({
  contentId: "homepage-allowed-park",
  title: "부산 시민공원 산책길",
  contentTypeId: "12",
  category: "attraction",
  address: "부산광역시 부산진구 시민공원로 1",
  districtCode: "230",
  latitude: 35.1686,
  longitude: 129.0572,
});

const UNKNOWN_VIEW = createSummary({
  contentId: "homepage-unknown-view",
  title: "근거 미확인 전망대",
  contentTypeId: "14",
  category: "culture",
  address: "부산광역시 영도구 전망로 1",
  districtCode: "200",
  latitude: null,
  longitude: null,
});

const ALLOWED_STAY = createSummary({
  contentId: "homepage-allowed-stay",
  title: "기장 바다 동반 숙소",
  contentTypeId: "32",
  category: "accommodation",
  address: "부산광역시 기장군 기장해안로 1",
  districtCode: "710",
  latitude: 35.2446,
  longitude: 129.2223,
});

const HOMEPAGE_SNAPSHOT: TourHomepageSnapshot = {
  catalog: {
    places: [
      ALLOWED_WALK,
      CONDITIONAL_CAFE,
      ALLOWED_PARK,
      UNKNOWN_VIEW,
      ALLOWED_STAY,
    ],
    page: 1,
    pageSize: 5,
    totalCount: 37,
    source: CATALOG_SOURCE,
  },
  featured: {
    state: "ready",
    places: [
      createFeaturedPlace(ALLOWED_WALK, "allowed", "complete"),
      createFeaturedPlace(CONDITIONAL_CAFE, "conditional", "complete"),
      createFeaturedPlace(ALLOWED_PARK, "allowed", "complete"),
      createFeaturedPlace(UNKNOWN_VIEW, "unknown", "insufficient_evidence"),
      createFeaturedPlace(ALLOWED_STAY, "allowed", "complete"),
    ],
    assessedCount: 5,
    failedCount: 0,
  },
};

async function fulfillHomepageSuccess(
  route: Route,
  snapshot: TourHomepageSnapshot = HOMEPAGE_SNAPSHOT,
) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      data: snapshot,
      requestId: "homepage-e2e-success",
    }),
  });
}

async function mockHomepageSuccess(page: Page) {
  await page.route(HOMEPAGE_API, (route) => fulfillHomepageSuccess(route));
}

async function installFakeMap(
  page: Page,
  { deferUntilSdkScript = false }: { deferUntilSdkScript?: boolean } = {},
) {
  await page.addInitScript(({ deferUntilSdkScript }) => {
    const install = () => {
      type Listener = (...args: unknown[]) => void;
      const listeners = new WeakMap<object, Map<string, Set<Listener>>>();
      const addListener = (target: object, name: string, handler: Listener) => {
        const targetListeners =
          listeners.get(target) ?? new Map<string, Set<Listener>>();
        const eventListeners = targetListeners.get(name) ?? new Set<Listener>();
        eventListeners.add(handler);
        targetListeners.set(name, eventListeners);
        listeners.set(target, targetListeners);
      };

      class LatLng {
        constructor(
          private readonly latitude: number,
          private readonly longitude: number,
        ) {}
        getLat() {
          return this.latitude;
        }
        getLng() {
          return this.longitude;
        }
      }

      class Bounds {
        extend() {}
        getNorthEast() {
          return new LatLng(35.3, 129.3);
        }
        getSouthWest() {
          return new LatLng(35, 129);
        }
      }

      class FakeMap {
        private center: LatLng;

        constructor(
          readonly container: HTMLElement,
          options: { center: LatLng },
        ) {
          this.center = options.center;
          container.dataset.fakeMapReady = "true";
        }
        getBounds() {
          return new Bounds();
        }
        getCenter() {
          return this.center;
        }
        panTo(value: LatLng) {
          this.center = value;
        }
        relayout() {}
        setBounds() {}
      }

      class Marker {
        setImage() {}
        setMap() {}
        setPosition() {}
        setZIndex() {}
      }

      class Overlay {
        constructor(
          private readonly options: { map: FakeMap; content: HTMLElement },
        ) {
          options.map.container.append(options.content);
        }
        setMap(map: FakeMap | null) {
          if (!map) this.options.content.remove();
        }
      }

      class Polyline {
        private readonly element: HTMLElement;

        constructor(options: { map: FakeMap; path: LatLng[] }) {
          this.element = document.createElement("div");
          this.element.dataset.providerPolyline = String(options.path.length);
          options.map.container.append(this.element);
        }
        setMap(map: FakeMap | null) {
          if (!map) this.element.remove();
        }
      }

      class Clusterer {
        addMarkers() {}
        clear() {}
      }

      window.kakao = {
        maps: {
          load: (callback: () => void) => callback(),
          event: {
            addListener,
            removeListener(target: object, name: string, handler: Listener) {
              listeners.get(target)?.get(name)?.delete(handler);
            },
          },
          LatLng,
          LatLngBounds: Bounds,
          Map: FakeMap,
          CustomOverlay: Overlay,
          Marker,
          MarkerImage: class {},
          MarkerClusterer: Clusterer,
          Point: class {},
          Polyline,
          Size: class {},
        } as unknown as NonNullable<Window["kakao"]>["maps"],
      };
    };

    if (!deferUntilSdkScript) {
      install();
      return;
    }

    const observer = new MutationObserver((records) => {
      const sdkScriptAdded = records.some((record) =>
        Array.from(record.addedNodes).some(
          (node) =>
            node instanceof HTMLScriptElement &&
            node.src.startsWith("https://dapi.kakao.com/v2/maps/sdk.js"),
        ),
      );
      if (!sdkScriptAdded) return;
      observer.disconnect();
      install();
    });
    observer.observe(document, { childList: true, subtree: true });
  }, { deferUntilSdkScript });
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title !== NETWORK_BOUNDARY_TEST) await installFakeMap(page);
});

test(NETWORK_BOUNDARY_TEST, async ({ page }) => {
  let homepageRequestCount = 0;
  const sdkRequests: string[] = [];
  const forbiddenRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/tour/homepage") homepageRequestCount += 1;
    if (
      url.hostname === "dapi.kakao.com" &&
      url.pathname === "/v2/maps/sdk.js"
    ) {
      sdkRequests.push(url.toString());
    }
    if (
      [
        "/api/itineraries/generate",
        "/api/directions",
        "/api/kakao/directions",
        "/api/map/places",
        "/api/places/discovery",
      ].includes(url.pathname) ||
      url.pathname.startsWith("/api/kakao/local/") ||
      url.hostname.includes("supabase")
    ) {
      forbiddenRequests.push(url.toString());
    }
  });

  await mockHomepageSuccess(page);
  await page.route("https://dapi.kakao.com/v2/maps/sdk.js**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "window.kakao={maps:{load:function(callback){callback();}}};",
    });
  });

  await page.goto("/");
  await expect(page.locator(".homepage-live-ready")).toBeVisible();
  await expect.poll(() => homepageRequestCount).toBe(1);
  await expect.poll(() => sdkRequests.length).toBe(1);

  const sdkUrl = new URL(sdkRequests[0]);
  expect(sdkUrl.searchParams.get("autoload")).toBe("false");
  expect(new Set(sdkUrl.searchParams.get("libraries")?.split(","))).toEqual(
    new Set(["services", "clusterer"]),
  );
  expect(forbiddenRequests).toEqual([]);
});

test("shows neutral loading UI before publishing any provider count", async ({
  page,
}) => {
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route(HOMEPAGE_API, async (route) => {
    await responseGate;
    await fulfillHomepageSuccess(route);
  });

  await page.goto("/");

  await expect(
    page.getByLabel("공식 관광 지도 불러오는 중"),
  ).toBeVisible();
  await expect(
    page.getByText("한국관광공사 장소 정보를 불러오고 있어요."),
  ).toBeVisible();
  await expect(page.locator(".homepage-live-ready")).toHaveCount(0);
  await expect(page.getByText("37곳", { exact: true })).toHaveCount(0);

  releaseResponse();
  await expect(
    page.getByRole("heading", { name: /부산 공식 관광 장소\s*37곳/u }),
  ).toBeVisible();
});

test("keeps provider errors honest and retries without fixture fallback", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route(HOMEPAGE_API, async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "UPSTREAM_ERROR",
            message: "한국관광공사 응답을 지금 확인할 수 없습니다.",
            retryable: true,
          },
          requestId: "homepage-e2e-error",
        }),
      });
      return;
    }
    await fulfillHomepageSuccess(route);
  });

  await page.goto("/");

  const error = page.locator(".homepage-live-error");
  await expect(error).toHaveAttribute("role", "alert");
  await expect(
    error.getByRole("heading", {
      name: "공식 관광 정보를 지금 불러올 수 없어요",
    }),
  ).toBeVisible();
  await expect(error).toContainText(
    "확인되지 않은 수치나 데모 장소로 대신 보여드리지 않습니다.",
  );
  await expect(page.locator(".homepage-map-section")).toHaveCount(0);
  await expect(page.getByText("해운대 달맞이 산책로")).toHaveCount(0);
  await expect(page.getByText("0곳", { exact: true })).toHaveCount(0);

  await error.getByRole("button", { name: "다시 시도" }).click();
  await expect(
    page.getByRole("heading", { name: /부산 공식 관광 장소\s*37곳/u }),
  ).toBeVisible();
  expect(requestCount).toBe(2);
});

test("rejects a malformed successful homepage envelope", async ({ page }) => {
  await page.route(HOMEPAGE_API, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: null,
        requestId: "homepage-malformed",
      }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".homepage-live-error")).toBeVisible();
  await expect(page.locator(".homepage-live-ready")).toHaveCount(0);
});

test("renders only verified allowed cards and no invented popularity", async ({
  page,
}) => {
  await mockHomepageSuccess(page);
  await page.goto("/");

  const summary = page.locator(".homepage-area-summary");
  await expect(
    page.getByRole("heading", { name: /부산 공식 관광 장소\s*37곳/u }),
  ).toBeVisible();
  await expect(summary).toContainText("동반 가능 장소 수를 뜻하지 않습니다.");
  await expect(summary.locator(".homepage-map-count-note")).toHaveText(
    "지도 표시 4곳 · 좌표 미확인 1곳 제외",
  );

  const mapCanvas = page.locator(".homepage-map-canvas-wrap .map-canvas");
  await expect(mapCanvas).toHaveAttribute("data-location-count", "4");
  await expect(mapCanvas).toHaveAttribute("data-route-point-count", "0");
  await expect(
    mapCanvas.getByRole("group", { name: "지도 장소 마커" }),
  ).toHaveAttribute("data-interactive-marker-count", "4");
  await expect(
    page.getByRole("link", { name: "지도 크게 보기" }),
  ).toHaveAttribute("href", "/results?tab=catalog");

  const carousel = page.getByRole("region", {
    name: "동반 가능한 공식 장소",
  });
  const cards = carousel.getByRole("link");
  await expect(cards).toHaveCount(3);
  await expect(
    carousel.getByRole("link", { name: "해운대 달맞이 산책로 상세 보기" }),
  ).toHaveAttribute(
    "href",
    "/places/homepage-allowed-walk?contentTypeId=12",
  );
  await expect(
    carousel.getByRole("link", { name: "부산 시민공원 산책길 상세 보기" }),
  ).toHaveAttribute(
    "href",
    "/places/homepage-allowed-park?contentTypeId=12",
  );
  await expect(
    carousel.getByRole("link", { name: "기장 바다 동반 숙소 상세 보기" }),
  ).toHaveAttribute(
    "href",
    "/places/homepage-allowed-stay?contentTypeId=32",
  );
  await expect(carousel.getByText("광안리 조건 확인 카페")).toHaveCount(0);
  await expect(carousel.getByText("근거 미확인 전망대")).toHaveCount(0);
  await expect(carousel.locator(".homepage-allowed-badge")).toHaveCount(3);
  await expect(carousel.getByText("한국관광공사")).toHaveCount(3);

  const homepage = page.locator(".weekendoog-home");
  await expect(homepage).not.toContainText(/평점|별점|리뷰|후기|인기 검색|인기 순위/u);
});

test("moves carousel focus with Arrow, Home, and End keys", async ({ page }) => {
  await mockHomepageSuccess(page);
  await page.goto("/");

  const carousel = page.getByRole("region", {
    name: "동반 가능한 공식 장소",
  });
  const cards = carousel.getByRole("link");
  await expect(cards).toHaveCount(3);

  await cards.nth(0).focus();
  await expect(cards.nth(0)).toBeFocused();
  await page.keyboard.press("End");
  await expect(cards.nth(2)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(cards.nth(1)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(cards.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(cards.nth(1)).toBeFocused();

  const filters = page.getByLabel("장소 카테고리 필터");
  await filters.getByRole("button", { name: "숙박" }).click();
  await expect(carousel.getByRole("link")).toHaveCount(1);
  await expect(
    carousel.getByRole("link", { name: "기장 바다 동반 숙소 상세 보기" }),
  ).toBeVisible();
});

test("prefills the selected district without confirming or generating", async ({
  page,
}) => {
  const generationRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === GENERATE_API_PATH) {
      generationRequests.push(request.url());
    }
  });
  await page.route(HOMEPAGE_API, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: {
          code: "UPSTREAM_ERROR",
          message: "launcher-only test",
          retryable: false,
        },
        requestId: "homepage-launcher",
      }),
    });
  });

  await page.goto("/");
  const launcher = page.getByRole("form", {
    name: "여행 만들기 빠른 시작",
  });
  await launcher.getByLabel("부산 여행 지역").selectOption("350");
  await expect(
    launcher.getByRole("button", { name: "해운대구" }),
  ).toHaveAttribute("aria-pressed", "true");
  await launcher.getByRole("button", { name: "여행 만들기" }).click();

  await expect(page).toHaveURL(/\/planner\/pet$/u);
  await expect(
    page.getByRole("heading", { name: "여행 정보 입력" }),
  ).toBeVisible();
  await expect(page.getByLabel("세부 지역")).toHaveValue("350");
  expect(generationRequests).toEqual([]);
});

test("keeps the live map and horizontal carousel inside a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockHomepageSuccess(page);
  await page.goto("/");
  await expect(page.locator(".homepage-live-ready")).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        return Math.max(root.scrollWidth, body.scrollWidth) - root.clientWidth;
      }),
    )
    .toBeLessThanOrEqual(1);

  const summaryBox = await page.locator(".homepage-area-summary").boundingBox();
  const mapBox = await page
    .locator(".homepage-map-canvas-wrap .map-canvas")
    .boundingBox();
  const selectedBox = await page
    .locator(".homepage-selected-place")
    .boundingBox();
  expect(summaryBox).not.toBeNull();
  expect(mapBox).not.toBeNull();
  expect(selectedBox).not.toBeNull();
  expect(summaryBox!.y + summaryBox!.height).toBeLessThanOrEqual(mapBox!.y);
  expect(selectedBox!.y).toBeGreaterThanOrEqual(mapBox!.y + mapBox!.height);
  expect(mapBox!.width).toBeLessThanOrEqual(390);

  const scroller = page.getByRole("region", {
    name: "동반 가능한 공식 장소",
  });
  const firstCardBox = await scroller.locator(".homepage-place-card").first().boundingBox();
  expect(firstCardBox).not.toBeNull();
  expect(firstCardBox!.width).toBeGreaterThan(290);
  expect(firstCardBox!.width).toBeLessThan(315);
  expect(
    await scroller.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "표시된 장소에 지도 위치 맞추기" }),
  ).toBeEnabled();
});
