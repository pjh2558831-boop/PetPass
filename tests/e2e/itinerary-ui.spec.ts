import { expect, test, type Page } from "@playwright/test";
import type {
  GeneratedItineraryStop,
  ItineraryGenerationResponse,
} from "../../types/route-generation";
import {
  expectNoHorizontalOverflow,
  generateConfirmedRecommendations,
  GENERATE_PATH,
} from "./planner-test-helpers";

const SUPPORTED_IMAGE_URL =
  "https://tong.visitkorea.or.kr/e2e-itinerary-supported.png";
const LONG_KOREAN_PLACE_NAME =
  "반려동물과 함께 걷는 부산 바다 전망 문화예술 산책정원과 따뜻한 휴식 라운지";
const TINY_SUPPORTED_IMAGE = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" fill="#dcefe4"/></svg>',
  "utf8",
);

type GenerationEnvelope = {
  ok: true;
  data: ItineraryGenerationResponse;
  requestId?: string;
};

function formatDistance(meters: number): string {
  return meters < 1_000
    ? `${Math.round(meters)}m`
    : `${(meters / 1_000).toFixed(1)}km`;
}

function formatDrivingDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `약 ${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0
    ? `약 ${hours}시간 ${remainder}분`
    : `약 ${hours}시간`;
}

function formatElapsedDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}분`;
  return minutes === 0
    ? `${hours}시간`
    : `${hours}시간 ${minutes}분`;
}

function addSourceBackedConditionalAccess(stop: GeneratedItineraryStop) {
  stop.title = LONG_KOREAN_PLACE_NAME;
  stop.imageUrl = SUPPORTED_IMAGE_URL;
  stop.callAheadRequired = true;
  stop.operatingHours = {
    ...stop.operatingHours,
    warning: "운영시간 확인 필요",
  };
  stop.petAccess = {
    ...stop.petAccess,
    verdict: "conditional",
    evaluationState: "partial",
    permittedScopes: ["outdoor"],
    restrictedScopes: ["indoor"],
    conditions: [
      {
        type: "carrier_required",
        scope: "indoor",
        label: "실내 이동장 사용 필수",
        sourceText: "실내에서는 이동장을 사용해야 합니다.",
        evidenceIds: ["e2e-condition"],
        manualConfirmationRecommended: true,
      },
    ],
    summary:
      "실내에서는 이동장을 사용하는 조건으로 동반할 수 있습니다.",
    confidence: "medium",
    reasonCodes: ["material_condition"],
    evidence: [
      {
        id: "e2e-condition",
        operation: "detailPetTour2",
        field: "etcAcmpyInfo",
        fieldLabel: "기타 동반 안내",
        originalText: "실내에서는 이동장을 사용해야 합니다.",
        assertion: "limits",
        scope: "indoor",
        priority: 1,
        providerModifiedTime: "20260805000000",
      },
    ],
    conflicts: [],
    verificationItems: [
      {
        code: "confirm_current_policy",
        label: "방문 당일 최신 동반 규정을 확인하세요.",
        evidenceIds: ["e2e-condition"],
      },
    ],
    sources: [
      {
        operation: "detailPetTour2",
        status: "available",
        retrievedAt: "2026-08-10T00:00:00.000Z",
        providerModifiedTime: "20260805000000",
      },
    ],
    warnings: ["운영 정책은 변경될 수 있습니다."],
  };
}

async function interceptItineraryImages(page: Page) {
  const interceptedRequests: string[] = [];
  await page.route(SUPPORTED_IMAGE_URL, async (route) => {
    interceptedRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: TINY_SUPPORTED_IMAGE,
    });
  });
  await page.route("**/_next/image**", async (route) => {
    const source = new URL(route.request().url()).searchParams.get("url");
    if (source === SUPPORTED_IMAGE_URL) {
      interceptedRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: TINY_SUPPORTED_IMAGE,
      });
      return;
    }
    await route.continue();
  });
  return interceptedRequests;
}

test("opens the exact selected strategy as a truthful, source-backed itinerary", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "The explicit itinerary viewport matrix runs once in desktop Chromium.",
  );
  test.setTimeout(120_000);

  const generationRequests: unknown[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === GENERATE_PATH &&
      request.method() === "POST"
    ) {
      generationRequests.push(request.postDataJSON());
    }
  });

  const interceptedImageRequests = await interceptItineraryImages(page);
  await page.route("**/api/itineraries/generate", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as GenerationEnvelope;
    const selected = body.ok ? body.data.itineraries[1] : undefined;
    if (selected?.stops[0] && selected.stops[1]) {
      addSourceBackedConditionalAccess(selected.stops[0]);
      delete selected.stops[1].imageUrl;
    }
    await route.fulfill({ response, json: body });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  const body = (await generateConfirmedRecommendations(page, testInfo, {
    prefix: "itinerary-ui",
    stopCount: "2",
  })) as GenerationEnvelope;
  expect(body.ok).toBe(true);
  expect(body.data.itineraries.length).toBeGreaterThanOrEqual(2);
  const firstStrategy = body.data.itineraries[0]!;
  const selected = body.data.itineraries[1]!;
  expect(selected.stops.length).toBeGreaterThanOrEqual(2);
  await expect.poll(() => generationRequests.length).toBe(1);

  const strategyTabs = page
    .getByRole("tablist", { name: "추천 경로 전략" })
    .getByRole("tab");
  await expect(strategyTabs).toHaveCount(body.data.itineraries.length);
  await strategyTabs.first().focus();
  await strategyTabs.first().press("ArrowRight");
  await expect(strategyTabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(strategyTabs.nth(1)).toBeFocused();
  await expect(
    page
      .locator("#selected-strategy-panel")
      .getByRole("heading", { name: selected.title, exact: true }),
  ).toBeVisible();
  await expect.poll(() => generationRequests.length).toBe(1);

  await page
    .getByRole("button", { name: "이 경로로 상세 일정 보기" })
    .click();
  await expect(page).toHaveURL(/\/itinerary$/u);
  await expect.poll(() => generationRequests.length).toBe(1);

  const itineraryHeading = page.getByRole("heading", {
    level: 1,
    name: `보리와 함께하는 ${selected.title}`,
    exact: true,
  });
  await expect(itineraryHeading).toBeVisible();
  await expect(itineraryHeading).toBeFocused();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `보리와 함께하는 ${firstStrategy.title}`,
      exact: true,
    }),
  ).toHaveCount(0);

  const origin = body.data.request.start.label ?? "출발지";
  await expect(page.getByText(origin, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "출발지부터 이어지는 실제 이동 구간",
      exact: true,
    }),
  ).toBeVisible();

  const timeline = page.getByRole("list", {
    name: `${selected.title} 상세 방문 순서`,
  });
  const stopCards = timeline.locator(":scope > li");
  await expect(stopCards).toHaveCount(selected.stops.length);
  for (const [index, stop] of selected.stops.entries()) {
    const card = stopCards.nth(index);
    const previousLabel =
      index === 0 ? origin : selected.stops[index - 1]!.title;
    await expect(
      card.getByLabel(`${stop.order}번째 방문 장소`, { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByRole("heading", { name: stop.title, exact: true }),
    ).toBeVisible();
    await expect(card).toContainText(`${previousLabel} → ${stop.title}`);
    await expect(card).toContainText(
      `${formatDistance(stop.distanceFromPreviousMeters)} · ${formatDrivingDuration(stop.durationFromPreviousSeconds)}`,
    );
    await expect(card).toContainText(
      `${stop.plannedArrival}–${stop.plannedDeparture} · 체류 ${stop.visitDurationMinutes}분`,
    );
  }

  const summary = page.getByRole("complementary", {
    name: "일정 요약과 지도",
  });
  const summaryMetric = (label: string) =>
    summary.getByText(label, { exact: true }).locator("..").locator("dd");
  await expect(summaryMetric("총 이동 거리")).toHaveText(
    formatDistance(selected.totalDistanceMeters),
  );
  await expect(summaryMetric("차량 이동")).toHaveText(
    formatDrivingDuration(selected.totalDurationSeconds),
  );
  await expect(summaryMetric("방문 장소")).toHaveText(
    `${selected.stops.length}곳`,
  );
  await expect(summaryMetric("전체 일정")).toHaveText(
    formatElapsedDuration(selected.estimatedElapsedDurationMinutes),
  );

  const evidenceCard = stopCards.first();
  await expect(evidenceCard.getByText("조건부 동반 가능", { exact: true })).toBeVisible();
  await expect(
    evidenceCard.getByText(
      "실내에서는 이동장을 사용하는 조건으로 동반할 수 있습니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(evidenceCard.getByText("이동장 · 준비됨", { exact: true })).toBeVisible();
  await expect(evidenceCard.getByText("장비 조건", { exact: true })).toBeVisible();
  await expect(evidenceCard.getByText("동반 조건", { exact: true }).first()).toBeVisible();
  await expect(evidenceCard.getByText("실내 이동장 사용 필수", { exact: true }).first()).toBeVisible();
  await expect(
    evidenceCard.getByText("실내에서는 이동장을 사용해야 합니다.", {
      exact: true,
    }).first(),
  ).toBeVisible();
  await expect(evidenceCard.getByText("방문 전 확인할 내용", { exact: true })).toBeVisible();
  await expect(
    evidenceCard.getByText(
      "시설에 직접 반려동물 동반 가능 여부를 확인해 주세요.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(evidenceCard.getByText("운영시간 확인 필요", { exact: true }).first()).toBeVisible();
  await expect(
    evidenceCard.getByText(
      "실내 이동장 사용 필수의 최신 적용 여부를 확인해 주세요.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    evidenceCard.getByText("방문 당일 최신 동반 규정을 확인하세요.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    evidenceCard.getByText("운영 정책은 변경될 수 있습니다.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    evidenceCard.getByText("한국관광공사 제공 근거", { exact: true }),
  ).toBeVisible();
  await expect(
    evidenceCard.getByText("제공처: Korea Tourism Organization", {
      exact: true,
    }),
  ).toBeVisible();

  const supportedImage = evidenceCard.locator(
    `img[alt="${selected.stops[0]!.title} 제공 이미지"]`,
  );
  await expect(supportedImage).toBeVisible();
  await expect.poll(() => interceptedImageRequests.length).toBeGreaterThan(0);
  await expect
    .poll(() =>
      supportedImage.evaluate(
        (image) =>
          (image as HTMLImageElement).complete &&
          (image as HTMLImageElement).naturalWidth > 0,
      ),
    )
    .toBe(true);
  await expect(
    stopCards
      .nth(1)
      .getByRole("img", { name: `${selected.stops[1]!.title} 이미지 없음` }),
  ).toBeVisible();

  await expect(
    page.getByText(/평점|리뷰|날씨|인기|예약 완료|1박 여행|1일차/u),
  ).toHaveCount(0);

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await expect(itineraryHeading).toBeVisible();
    await expect(timeline).toBeVisible();
    const map = page.locator(".kakao-map-canvas");
    await expect(map).toBeVisible();
    expect((await map.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(290);
    await expect(
      page.getByRole("button", { name: "경로 비교로 돌아가기" }).first(),
    ).toBeVisible();
  }

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "선택된 추천 경로가 없습니다." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "여행 만들기 시작" }),
  ).toHaveAttribute("href", "/planner/pet");
  await expect(
    page.getByRole("heading", {
      name: "출발지부터 이어지는 실제 이동 구간",
    }),
  ).toHaveCount(0);
});

test("shows a deliberate empty state on direct itinerary entry", async ({
  page,
}) => {
  const generationRequests: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === GENERATE_PATH &&
      request.method() === "POST"
    ) {
      generationRequests.push(request.url());
    }
  });

  await page.goto("/itinerary");
  await expect(
    page.getByRole("heading", { name: "선택된 추천 경로가 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText(/새로고침하거나 주소로 바로 들어온 경우/u)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "여행 만들기 시작" }),
  ).toHaveAttribute("href", "/planner/pet");
  await expect(
    page.getByRole("heading", {
      name: "출발지부터 이어지는 실제 이동 구간",
    }),
  ).toHaveCount(0);
  expect(generationRequests).toEqual([]);
});
