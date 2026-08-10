import { expect, test } from "@playwright/test";

test("renders the landing page and reaches the existing planner entry", async ({
  page,
}) => {
  await page.goto("/");

  const main = page.locator("main");
  await expect(
    main.getByRole("heading", {
      level: 1,
      name: /함께 들어갈 수 있는 곳부터, 이동하기 좋은 순서까지/u,
    }),
  ).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "입력한 조건이 일정이 되기까지" }),
  ).toBeVisible();
  await expect(main.getByText("취향 균형 코스", { exact: true })).toBeVisible();
  await expect(main.getByText("이동 최소 코스", { exact: true })).toBeVisible();
  await expect(main.getByText("새로운 발견 코스", { exact: true })).toBeVisible();
  await expect(
    main.getByText("공공 반려동물 동반 정보에서 시작합니다.", { exact: true }),
  ).toBeVisible();

  const primaryCta = main
    .getByRole("link", { name: "여행 계획 시작하기" })
    .first();
  await expect(primaryCta).toHaveAttribute("href", "/planner/pet");
  await primaryCta.click();

  await expect(page).toHaveURL(/\/planner\/pet$/u);
  await expect(
    page.getByRole("heading", { name: "함께 여행할 반려동물을 알려주세요" }),
  ).toBeVisible();
});

test("keeps every desktop header link on an existing route", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  const header = page.locator("header");
  const navigation = header.getByRole("navigation", { name: "주요 메뉴" });
  await expect(header.getByRole("link", { name: "PetPass 홈" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(navigation.getByRole("link", { name: "장소 찾기" })).toHaveAttribute(
    "href",
    "/results",
  );
  await expect(navigation.getByRole("link", { name: "내 일정" })).toHaveAttribute(
    "href",
    "/itinerary",
  );
  await expect(navigation.getByRole("link", { name: "여행 만들기" })).toHaveAttribute(
    "href",
    "/planner/pet",
  );

  for (const href of ["/", "/results", "/itinerary", "/planner/pet"]) {
    const response = await request.get(href);
    expect(response.status(), `${href} should resolve`).toBe(200);
  }
});

test("opens the mobile navigation and follows its real destination", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const header = page.locator("header");
  await expect(header.getByRole("link", { name: "여행 만들기" })).toBeVisible();
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
  await mobileNavigation.getByRole("link", { name: "내 일정" }).click();

  await expect(page).toHaveURL(/\/itinerary$/u);
  await expect(
    page.getByRole("heading", { name: "선택된 추천 경로가 없습니다." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "여행 만들기 시작" }),
  ).toHaveAttribute("href", "/planner/pet");
});

test("avoids horizontal overflow at the required viewports", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".landing-page")).toBeVisible();
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
    const heroBox = await page.locator(".landing-page > section").first().boundingBox();
    expect(headerBox).not.toBeNull();
    expect(heroBox).not.toBeNull();
    expect(headerBox!.x).toBeGreaterThanOrEqual(0);
    expect(headerBox!.x + headerBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(heroBox!.x).toBeGreaterThanOrEqual(0);
    expect(heroBox!.x + heroBox!.width).toBeLessThanOrEqual(viewport.width);

    if (viewport.width === 320) {
      const header = page.locator("header");
      await expect(header.getByRole("link", { name: "PetPass 홈" })).toBeVisible();
      await expect(header.getByRole("link", { name: "여행 만들기" })).toBeVisible();
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
      await header.getByRole("button", { name: "메뉴 닫기" }).click();
    }
  }
});
