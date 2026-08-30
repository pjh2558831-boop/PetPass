import { expect, test, type Page } from "@playwright/test";

const PAGE_TITLE = "WEEKENDOG | 근거 있는 반려동물 동반 여행";

async function mockUnavailableHomepageData(page: Page) {
  await page.route("**/api/homepage/places/initial?**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: {
          code: "UPSTREAM_ERROR",
          message: "navigation test intentionally keeps live data offline",
          retryable: false,
        },
        requestId: "landing-navigation",
      }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockUnavailableHomepageData(page);
});

test("renders the landing page and reaches the existing planner entry", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(PAGE_TITLE);
  await expect(
    page.locator('meta[name="description"]'),
  ).toHaveAttribute("content", /공식 반려동물 동반 정보/u);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    PAGE_TITLE,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveCount(0);

  const main = page.locator("main");
  await expect(
    main.getByRole("heading", {
      level: 1,
      name: /반려견과 함께,[\s\S]*부산 여행을 계획해보세요/u,
    }),
  ).toBeVisible();

  const primaryCta = main
    .getByRole("form", { name: "여행 만들기 빠른 시작" })
    .getByRole("button", { name: "여행 만들기" });
  await primaryCta.click();

  await expect(page).toHaveURL(/\/planner\/pet$/u);
  await expect(
    page.getByRole("heading", { name: "여행 정보 입력" }),
  ).toBeVisible();
});

test("keeps real desktop navigation routable and hides community publicly", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  const header = page.locator("header");
  const navigation = header.getByRole("navigation", { name: "주요 메뉴" });
  await expect(header.getByRole("link", { name: "WEEKENDOG 홈" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(navigation.getByRole("link", { name: "일정 만들기" })).toHaveAttribute(
    "href",
    "/results?tab=catalog&region=busan&mode=select",
  );
  await expect(navigation.getByRole("link", { name: "장소 찾기" })).toHaveAttribute(
    "href",
    "/results?tab=catalog&region=busan",
  );
  await expect(navigation.getByRole("link", { name: "맞춤 일정" })).toHaveAttribute(
    "href",
    "/planner/pet",
  );

  await expect(header.getByRole("button", { name: /커뮤니티/u })).toHaveCount(0);
  await expect(header.getByRole("link", { name: /커뮤니티/u })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "마이페이지" })).toHaveAttribute("href", "/account");
  await expect(header.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
  await expect(header.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/login?mode=signup");

  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "일정 만들기" })).toHaveAttribute(
    "href",
    "/results?tab=catalog&region=busan&mode=select",
  );
  await expect(footer.getByRole("link", { name: "장소 찾기" })).toHaveAttribute(
    "href",
    "/results?tab=catalog&region=busan",
  );
  await expect(footer.getByRole("link", { name: "맞춤 일정" })).toHaveAttribute(
    "href",
    "/planner/pet",
  );

  for (const href of [
    "/",
    "/results?tab=catalog&region=busan&mode=select",
    "/results?tab=catalog&region=busan",
    "/itinerary",
    "/planner/pet",
  ]) {
    const response = await request.get(href);
    expect(response.status(), `${href} should resolve`).toBe(200);
  }
});

test("opens the mobile navigation and follows its real destination", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });

  const header = page.locator("header");
  await expect(header.getByRole("link", { name: "WEEKENDOG 홈" })).toBeVisible();
  await expect(header.getByRole("navigation", { name: "주요 메뉴" })).toBeHidden();

  const openMenuButton = header.getByRole("button", { name: "메뉴 열기" });
  await expect(openMenuButton).toHaveAttribute("aria-expanded", "false");
  await openMenuButton.click();
  const closeMenuButton = header.getByRole("button", { name: "메뉴 닫기" });
  await expect(closeMenuButton).toHaveAttribute("aria-expanded", "true");

  const mobileNavigation = header.getByRole("navigation", {
    name: "모바일 주요 메뉴",
  });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole("button", { name: /커뮤니티/u })).toHaveCount(0);
  await expect(mobileNavigation.getByRole("link", { name: /커뮤니티/u })).toHaveCount(0);
  await expect(mobileNavigation.getByRole("link", { name: "맞춤 일정" })).toHaveAttribute(
    "href",
    "/planner/pet",
  );

  await mobileNavigation.getByRole("link", { name: "장소 찾기" }).click();

  await expect(page).toHaveURL(/\/results\?tab=catalog&region=busan&page=1$/u);
  await expect(page.getByRole("tabpanel", { name: "장소 찾기" })).toBeVisible();
});

test("avoids horizontal overflow at the required viewports", async ({ page }) => {
  test.setTimeout(60_000);
  const viewports = [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 844 },
  ];
  await page.setViewportSize(viewports[0]);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".weekendoog-home")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    await expect
      .poll(() =>
        page.evaluate(() => {
          const root = document.documentElement;
          const body = document.body;
          return Math.max(root.scrollWidth, body.scrollWidth) - root.clientWidth;
        }),
      )
      .toBeLessThanOrEqual(1);

    const headerBox = await page.locator("header").boundingBox();
    const heroBox = await page.locator(".weekendoog-hero").boundingBox();
    expect(headerBox).not.toBeNull();
    expect(heroBox).not.toBeNull();
    expect(headerBox!.x).toBeGreaterThanOrEqual(0);
    expect(headerBox!.x + headerBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(heroBox!.x).toBeGreaterThanOrEqual(0);
    expect(heroBox!.x + heroBox!.width).toBeLessThanOrEqual(viewport.width);

    if (viewport.width === 320) {
      const header = page.locator("header");
      await expect(header.getByRole("link", { name: "WEEKENDOG 홈" })).toBeVisible();
      await header.getByRole("button", { name: "메뉴 열기" }).click();
      await expect(header.getByRole("navigation", { name: "모바일 주요 메뉴" })).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const root = document.documentElement;
            const body = document.body;
            return Math.max(root.scrollWidth, body.scrollWidth) - root.clientWidth;
          }),
        )
        .toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
      await expect(header.getByRole("button", { name: "메뉴 열기" })).toBeFocused();
    }
  }
});
