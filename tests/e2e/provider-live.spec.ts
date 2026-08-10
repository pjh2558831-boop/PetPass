import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { parseKakaoPlaceUrl } from "@/lib/kakao/place-url";
import type { ItineraryGenerationResponse } from "@/types/route-generation";

const GEOCODE_PATH = "/api/kakao/local/geocode";
const GENERATE_PATH = "/api/itineraries/generate";

type GenerationEnvelope = {
  ok: boolean;
  data?: ItineraryGenerationResponse;
};

function collectBrowserHealth(page: Page) {
  let consoleErrorCount = 0;
  let pageErrorCount = 0;
  const applicationServerErrors: string[] = [];
  const failedKakaoRequests: string[] = [];
  const unauthorizedRestRequests: string[] = [];
  const clientRequestUrls: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrorCount += 1;
  });
  page.on("pageerror", () => {
    pageErrorCount += 1;
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === "http://localhost:3000" && url.pathname.startsWith("/api/") && response.status() >= 500) {
      applicationServerErrors.push(`${response.status()} ${url.pathname}`);
    }
  });
  page.on("request", (request) => {
    clientRequestUrls.push(request.url());
    const url = new URL(request.url());
    if (
      url.hostname === "dapi.kakao.com" &&
      url.pathname !== "/v2/maps/sdk.js"
    ) {
      unauthorizedRestRequests.push(`${request.method()} ${url.hostname}${url.pathname}`);
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (
      url.hostname === "dapi.kakao.com" ||
      url.hostname.endsWith("daumcdn.net")
    ) {
      failedKakaoRequests.push(`${url.hostname}${url.pathname}`);
    }
  });

  return {
    snapshot: () => ({
      consoleErrorCount,
      pageErrorCount,
      applicationServerErrors: [...applicationServerErrors],
      failedKakaoRequests: [...failedKakaoRequests],
      unauthorizedRestRequests: [...unauthorizedRestRequests],
      clientRequestUrls: [...clientRequestUrls],
    }),
  };
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function expectFiniteCoordinates(latitude: number, longitude: number) {
  expect(Number.isFinite(latitude)).toBe(true);
  expect(Number.isFinite(longitude)).toBe(true);
  expect(latitude).toBeGreaterThanOrEqual(-90);
  expect(latitude).toBeLessThanOrEqual(90);
  expect(longitude).toBeGreaterThanOrEqual(-180);
  expect(longitude).toBeLessThanOrEqual(180);
}

function logGenerationFunnel(generation: ItineraryGenerationResponse) {
  const funnel = generation.candidateFunnel;
  console.log(`LIVE_PROVIDER_STATE=${generation.state}`);
  console.log(`LIVE_PROVIDER_CATALOG_MATCHES=${funnel.matchingCatalogCandidates}`);
  console.log(`LIVE_PROVIDER_AFTER_BASIC_FILTERS=${funnel.afterBasicFilters}`);
  console.log(`LIVE_PROVIDER_TRAVEL_SUITABLE=${funnel.travelSuitableCandidates}`);
  console.log(`LIVE_PROVIDER_TRAVEL_EXCLUDED=${funnel.travelSuitabilityExcluded}`);
  console.log(`LIVE_PROVIDER_PRELIMINARY_RANKED=${funnel.preliminaryRankedCandidates}`);
  console.log(`LIVE_PROVIDER_DETAIL_SHORTLIST=${funnel.detailedAssessmentCandidates}`);
  console.log(`LIVE_PROVIDER_DETAIL_UNAVAILABLE=${funnel.detailOutcomes.unavailable}`);
  console.log(`LIVE_PROVIDER_DETAIL_MISMATCH=${funnel.detailOutcomes.mismatch}`);
  console.log(`LIVE_PROVIDER_PET_ALLOWED=${funnel.basePetAccess.allowed}`);
  console.log(`LIVE_PROVIDER_PET_CONDITIONAL=${funnel.basePetAccess.conditional}`);
  console.log(`LIVE_PROVIDER_PET_NOT_ALLOWED=${funnel.basePetAccess.notAllowed}`);
  console.log(`LIVE_PROVIDER_PET_UNKNOWN=${funnel.basePetAccess.unknown}`);
  console.log(`LIVE_PROVIDER_PET_NOT_APPLICABLE=${funnel.basePetAccess.notApplicable}`);
  console.log(`LIVE_PROVIDER_SIZE_COMPATIBLE=${funnel.petSizeCompatibility.compatible}`);
  console.log(`LIVE_PROVIDER_SIZE_INCOMPATIBLE=${funnel.petSizeCompatibility.incompatible}`);
  console.log(`LIVE_PROVIDER_SIZE_VERIFY=${funnel.petSizeCompatibility.verificationRequired}`);
  console.log(`LIVE_PROVIDER_SIZE_UNSPECIFIED=${funnel.petSizeCompatibility.notSpecified}`);
  console.log(`LIVE_PROVIDER_EQUIPMENT_EXCLUDED=${funnel.equipmentMismatchExcluded}`);
  console.log(`LIVE_PROVIDER_INDOOR_EXCLUDED=${funnel.indoorRequirementExcluded}`);
  console.log(`LIVE_PROVIDER_ITINERARY_ELIGIBLE=${funnel.itineraryEligibleCandidates}`);
  console.log(`LIVE_PROVIDER_COMBINATIONS=${funnel.generatedCombinations}`);
  console.log(`LIVE_PROVIDER_RETURNED_ROUTES=${funnel.returnedRoutes}`);
  for (const [reason, count] of Object.entries(generation.exclusionCounts)) {
    if (count > 0) console.log(`LIVE_PROVIDER_EXCLUSION_${reason.toUpperCase()}=${count}`);
  }
  for (const [reason, count] of Object.entries(
    generation.travelSuitabilityExclusions,
  )) {
    if ((count ?? 0) > 0) {
      console.log(`LIVE_PROVIDER_TRAVEL_REASON_${reason.toUpperCase()}=${count}`);
    }
  }
}

test("completes one bounded real-provider journey across all three strategies", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.RUN_LIVE_PROVIDER_E2E !== "1",
    "Set RUN_LIVE_PROVIDER_E2E=1 with the dedicated live config.",
  );
  test.setTimeout(300_000);
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `petpass-live-provider-${testInfo.workerIndex}`,
  });

  const health = collectBrowserHealth(page);
  let generationRequestCount = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === GENERATE_PATH &&
      request.method() === "POST"
    ) {
      generationRequestCount += 1;
    }
  });

  const landingResponse = await page.goto("/");
  expect(landingResponse?.status()).toBe(200);
  await expect(page.locator("body")).not.toHaveText("");
  await page.locator('a[href="/planner/pet"]').first().click();
  await expect(page).toHaveURL(/\/planner\/pet$/u);
  await page.getByRole("textbox", { name: "반려동물 이름" }).fill("보리");
  await page.getByRole("checkbox", { name: "입마개" }).check();
  await page.getByRole("button", { name: "여행 조건 정하기" }).click();
  await expect(page).toHaveURL(/\/planner\/trip$/u);

  const departureQuery = "부산광역시 연제구 중앙대로 1001";
  const geocodeResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === GEOCODE_PATH &&
      response.request().method() === "GET",
    { timeout: 30_000 },
  );
  const departureInput = page.getByRole("combobox", { name: "출발지 주소" });
  await departureInput.fill(departureQuery);
  const geocodeResponse = await geocodeResponsePromise;
  expect(geocodeResponse.status()).toBe(200);
  const geocodeBody = (await geocodeResponse.json()) as {
    ok: boolean;
    data?: Array<{
      coordinates: { latitude: number; longitude: number };
    }>;
  };
  expect(geocodeBody.ok).toBe(true);
  expect(geocodeBody.data?.length ?? 0).toBeGreaterThan(0);
  const originCoordinates = geocodeBody.data![0]!.coordinates;
  expectFiniteCoordinates(
    originCoordinates.latitude,
    originCoordinates.longitude,
  );
  const departureOptions = page
    .getByRole("listbox", { name: "출발지 주소 검색 결과" })
    .getByRole("option");
  await expect(departureOptions.first()).toBeVisible();
  await departureOptions.first().click();

  const generationResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === GENERATE_PATH &&
      response.request().method() === "POST",
    { timeout: 240_000 },
  );
  await page.getByRole("button", { name: "추천 경로 만들기" }).click();
  const generationResponse = await generationResponsePromise;
  expect(generationResponse.status()).toBe(200);
  const envelope = (await generationResponse.json()) as GenerationEnvelope;
  expect(envelope.ok).toBe(true);
  expect(envelope.data).toBeDefined();
  const generation = envelope.data!;
  logGenerationFunnel(generation);
  expect(generation.itineraries).toHaveLength(3);
  expect(generationRequestCount).toBe(1);
  expect(generation.providerCalls.detail).toBeGreaterThan(0);
  expect(generation.providerCalls.directions).toBeGreaterThan(0);

  const signatures = new Set<string>();
  const routeOrders: string[] = [];
  let missingImageCount = 0;
  let missingEvidenceCount = 0;
  let missingKakaoLinkCount = 0;
  let canonicalKakaoLinkCount = 0;
  for (const itinerary of generation.itineraries) {
    expect(itinerary.stops.length).toBeGreaterThan(0);
    expect(itinerary.totalDistanceMeters).toBeGreaterThan(0);
    expect(Number.isFinite(itinerary.totalDistanceMeters)).toBe(true);
    expect(itinerary.totalDurationSeconds).toBeGreaterThan(0);
    expect(Number.isFinite(itinerary.totalDurationSeconds)).toBe(true);
    expect(itinerary.geometry.length).toBeGreaterThan(1);
    itinerary.geometry.forEach((coordinates) =>
      expectFiniteCoordinates(coordinates.latitude, coordinates.longitude),
    );
    itinerary.stops.forEach((stop, index) => {
      expect(stop.order).toBe(index + 1);
      expect(stop.title.trim().length).toBeGreaterThan(0);
      expectFiniteCoordinates(
        stop.coordinates.latitude,
        stop.coordinates.longitude,
      );
      if (!stop.imageUrl) missingImageCount += 1;
      if (!stop.petAccess.evidence?.length) missingEvidenceCount += 1;
      if (stop.placeUrl) {
        expect(parseKakaoPlaceUrl(stop.placeUrl)).toBe(stop.placeUrl);
        expect(stop.placeUrl.startsWith("https://place.map.kakao.com/")).toBe(
          true,
        );
        canonicalKakaoLinkCount += 1;
      } else if (stop.source === "KAKAO") {
        missingKakaoLinkCount += 1;
      }
    });
    signatures.add(itinerary.signature);
    routeOrders.push(
      itinerary.stops.map((stop) => stop.stableIdentity).join(" -> "),
    );
  }
  expect(signatures.size).toBe(3);
  expect(new Set(routeOrders).size).toBeGreaterThan(1);
  expect(new Set(generation.itineraries.map(({ profile }) => profile))).toEqual(
    new Set(["preference_balanced", "minimum_movement", "discovery"]),
  );
  expect(
    new Set(
      generation.itineraries.map(({ geometry }) =>
        shortHash(JSON.stringify(geometry)),
      ),
    ).size,
  ).toBe(3);

  await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          sdk: Boolean(window.kakao?.maps?.Map),
          clusterer: Boolean(window.kakao?.maps?.MarkerClusterer),
          overlay: Boolean(
            document.querySelector(
              "[data-nextjs-error-overlay], [data-nextjs-dialog]",
            ),
          ),
        })),
      { timeout: 30_000 },
    )
    .toEqual({ sdk: true, clusterer: true, overlay: false });

  const strategyTabs = page
    .getByRole("tablist", { name: "추천 경로 전략" })
    .getByRole("tab");
  await expect(strategyTabs).toHaveCount(3);

  for (const [index, itinerary] of generation.itineraries.entries()) {
    await strategyTabs.nth(index).click();
    await expect(strategyTabs.nth(index)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page
        .locator("#selected-strategy-panel")
        .getByRole("heading", { name: itinerary.title, exact: true }),
    ).toBeVisible();
    const resultsMap = page.locator(
      "#selected-strategy-panel .kakao-map-canvas",
    );
    await expect(resultsMap).toHaveAttribute(
      "data-route-point-count",
      String(itinerary.geometry.length),
    );
    await expect(resultsMap).toHaveAttribute(
      "data-location-count",
      String(itinerary.stops.length),
    );

    await page
      .getByRole("button", { name: "이 경로로 상세 일정 보기" })
      .click();
    await expect(page).toHaveURL(/\/itinerary$/u);
    await expect(
      page.getByRole("heading", { level: 1, name: new RegExp(itinerary.title, "u") }),
    ).toBeVisible();
    const timeline = page.getByRole("list", {
      name: `${itinerary.title} 상세 방문 순서`,
    });
    const stopCards = timeline.locator(":scope > li");
    await expect(stopCards).toHaveCount(itinerary.stops.length);
    for (const [stopIndex, stop] of itinerary.stops.entries()) {
      await expect(
        stopCards
          .nth(stopIndex)
          .getByRole("heading", { name: stop.title, exact: true }),
      ).toBeVisible();
    }
    const itineraryMap = page.locator(".kakao-map-canvas");
    await expect(itineraryMap).toHaveAttribute(
      "data-route-point-count",
      String(itinerary.geometry.length),
    );
    await expect(itineraryMap).toHaveAttribute(
      "data-location-count",
      String(itinerary.stops.length),
    );

    if (index < generation.itineraries.length - 1) {
      await page
        .getByRole("button", { name: "경로 비교로 돌아가기" })
        .first()
        .click();
      await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
    }
  }

  expect(generationRequestCount).toBe(1);
  const browserHealth = health.snapshot();
  expect(browserHealth.consoleErrorCount).toBe(0);
  expect(browserHealth.pageErrorCount).toBe(0);
  expect(browserHealth.applicationServerErrors).toEqual([]);
  expect(browserHealth.failedKakaoRequests).toEqual([]);
  expect(browserHealth.unauthorizedRestRequests).toEqual([]);
  const serverOnlySecrets = [
    process.env.TOUR_API_SERVICE_KEY,
    process.env.KAKAO_REST_API_KEY,
    process.env.LOCALDATA_SERVICE_KEY,
  ].filter((value): value is string => Boolean(value));
  const pageHtml = await page.content();
  const secretExposed = serverOnlySecrets.some(
    (secret) =>
      pageHtml.includes(secret) ||
      browserHealth.clientRequestUrls.some((url) => url.includes(secret)),
  );
  expect(secretExposed).toBe(false);

  console.log(`LIVE_PROVIDER_GEOCODE_CANDIDATES=${geocodeBody.data!.length}`);
  console.log(`LIVE_PROVIDER_STRATEGIES=${generation.itineraries.length}`);
  console.log(`LIVE_PROVIDER_DETAIL_CALLS=${generation.providerCalls.detail}`);
  console.log(`LIVE_PROVIDER_DIRECTIONS_CALLS=${generation.providerCalls.directions}`);
  console.log(`LIVE_PROVIDER_DISCOVERY_CALLS=${generation.providerCalls.discovery}`);
  console.log(`LIVE_PROVIDER_MISSING_IMAGES=${missingImageCount}`);
  console.log(`LIVE_PROVIDER_MISSING_EVIDENCE=${missingEvidenceCount}`);
  console.log(`LIVE_PROVIDER_MISSING_KAKAO_LINKS=${missingKakaoLinkCount}`);
  console.log(`LIVE_PROVIDER_CANONICAL_KAKAO_LINKS=${canonicalKakaoLinkCount}`);
  generation.itineraries.forEach((itinerary, index) => {
    console.log(`LIVE_PROVIDER_ROUTE_${index + 1}_PROFILE=${itinerary.profile}`);
    console.log(`LIVE_PROVIDER_ROUTE_${index + 1}_SIGNATURE_HASH=${shortHash(itinerary.signature)}`);
    console.log(
      `LIVE_PROVIDER_ROUTE_${index + 1}_STOP_HASHES=${itinerary.stops
        .map(({ stableIdentity }) => shortHash(stableIdentity))
        .join(",")}`,
    );
    console.log(
      `LIVE_PROVIDER_ROUTE_${index + 1}_GEOMETRY_HASH=${shortHash(JSON.stringify(itinerary.geometry))}`,
    );
    console.log(`LIVE_PROVIDER_ROUTE_${index + 1}_SELECTED=true`);
    console.log(`LIVE_PROVIDER_ROUTE_${index + 1}_STOPS=${itinerary.stops.length}`);
    console.log(`LIVE_PROVIDER_ROUTE_${index + 1}_DISTANCE_METERS=${itinerary.totalDistanceMeters}`);
    console.log(`LIVE_PROVIDER_ROUTE_${index + 1}_DURATION_SECONDS=${itinerary.totalDurationSeconds}`);
    console.log(`LIVE_PROVIDER_ROUTE_${index + 1}_GEOMETRY_POINTS=${itinerary.geometry.length}`);
  });
});
