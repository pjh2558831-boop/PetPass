import { expect, test, type Page } from "@playwright/test";

async function keepHomepageDataDeterministic(page: Page) {
  await page.route("**/api/homepage/places/initial?**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: {
          code: "UPSTREAM_ERROR",
          message: "all-routes UI test keeps lower homepage data offline",
          retryable: false,
        },
        requestId: "all-routes-ui",
      }),
    });
  });
}

test("keeps the homepage upper structure while the global skip link targets main", async ({ page }) => {
  await keepHomepageDataDeterministic(page);
  await page.goto("/");

  await expect(page.locator('main#main-content')).toBeVisible();
  await expect(page.getByRole("link", { name: "본문으로 건너뛰기" })).toHaveAttribute(
    "href",
    "#main-content",
  );
  await expect(page.locator(".weekendoog-hero")).toBeVisible();
  await expect(page.locator("#weekendoog-hero-heading")).toBeVisible();
  await expect(page.locator(".weekendoog-hero-photo-frame")).toBeVisible();
  await expect(page.locator(".hero-planner-launcher")).toBeVisible();
});

test("marks the exact live desktop and mobile destination as current", async ({ page }, testInfo) => {
  if (testInfo.project.name === "chromium") {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/results?tab=catalog&region=busan");
    const desktopNavigation = page.getByRole("navigation", { name: "주요 메뉴" });
    await expect(desktopNavigation.getByRole("link", { name: "장소 찾기" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(desktopNavigation.getByRole("link", { name: "일정 만들기" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );

    const selectedModeResponse = await page.goto(
      "/results?tab=recommendations&region=busan&mode=select",
    );
    expect(selectedModeResponse).not.toBeNull();
    const selectedModeHtml = await selectedModeResponse!.text();
    expect(selectedModeHtml).toContain(
      'aria-current="page" href="/results?tab=catalog&amp;mode=select">일정 만들기',
    );
    expect(selectedModeHtml).not.toContain(
      'aria-current="page" href="/planner/pet">맞춤 일정',
    );
    await expect(desktopNavigation.getByRole("link", { name: "일정 만들기" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(desktopNavigation.getByRole("link", { name: "맞춤 일정" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  } else {
    await page.goto("/results?tab=recommendations&region=busan&mode=select");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  const mobileNavigation = page.getByRole("navigation", { name: "모바일 주요 메뉴" });
  await expect(mobileNavigation.getByRole("link", { name: "일정 만들기" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(mobileNavigation.getByRole("link", { name: "맞춤 일정" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(mobileNavigation.getByText("준비 중")).toHaveCount(0);
});

test("keeps every account-management route behind authentication", async ({ page }) => {
  const protectedRoutes = [
    "/onboarding",
    "/account",
    "/account/profile",
    "/account/pets/new",
    "/account/pets/9f791b6b-44dd-40ae-984a-503a275605eb/edit",
  ];

  for (const path of protectedRoutes) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login(?:\?|$)/u);
  }
});

test("keeps one main landmark in the planner decision flow", async ({ page }) => {
  await page.goto("/planner/pet");
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("main#main-content .planner-step-column")).toBeVisible();
});

test("renders an open compact not-found state without implementation or demo copy", async ({ page }) => {
  await page.goto("/this-weekendog-route-does-not-exist");

  await expect(page.getByRole("heading", { name: "요청한 페이지를 찾을 수 없어요." })).toBeVisible();
  await expect(page.locator("main .surface-card, main .surface-panel")).toHaveCount(0);
  await expect(page.getByText(/Supabase|환경 변수|데모 장소/u)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "장소 목록 보기" })).toBeVisible();
});

test("keeps a valid demo detail truthful without a missing-photo state or itinerary claim", async ({ page }) => {
  await page.goto("/places/demo-busan-coast-walk?region=busan");

  await expect(page.getByRole("heading", { name: "청사포 바다 산책길" })).toBeVisible();
  await expect(page.getByText("제공된 이미지가 없어요")).toHaveCount(0);
  await expect(page.getByRole("img", { name: /청사포 바다 산책길 이미지 없음/u })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "이 장소가 담긴 일정 보기" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "장소 목록으로" })).toHaveAttribute(
    "href",
    "/results?tab=catalog&region=busan",
  );
});
