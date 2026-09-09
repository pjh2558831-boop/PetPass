import { REGION_CONFIGS } from "@/lib/regions/config";
import { expect, test } from "@playwright/test";
import { mockHomepage, installFakeMap, installHomepageImageFixture, initialSnapshot, enrichmentSnapshot, HOMEPAGE_INITIAL_API, HOMEPAGE_ENRICHMENT_API } from "./homepage-test-helpers";

test("v4 hero search filters the real workbench and selection can be cleared or continued", async ({ page }) => {
  await mockHomepage(page);
  await installFakeMap(page);
  await installHomepageImageFixture(page);
  await page.goto("/");
  await page.getByRole("combobox", { name: "여행 지역", exact: true }).selectOption("busan");
  await page.getByRole("searchbox", { name: "여행 장소 검색", exact: true }).fill("광안리");
  await page.getByRole("button", { name: "여행지 찾기", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "불러온 장소 검색" });
  await expect(search).toHaveValue("광안리");
  await expect(search).toBeFocused();
  await expect(page.locator(".homepage-workbench-row")).toHaveCount(2);
  await page.getByRole("button", { name: "검색어 지우기", exact: true }).click();
  await expect(search).toBeFocused();
  await expect(page.locator(".homepage-workbench-row")).toHaveCount(5);
  const checkbox = page.getByRole("checkbox", { name: "해운대 달맞이 산책로 일정에 담기" });
  await checkbox.check();
  await expect(page.locator(".home-selected-itinerary__item")).toHaveCount(1);
  await page.getByRole("button", { name: "전체 지우기", exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await expect(page.locator(".home-selected-itinerary__item")).toHaveCount(0);
  await checkbox.check();
  await page.getByRole("button", { name: "선택한 장소로 일정 만들기", exact: true }).click();
  await expect(page).toHaveURL(/\/planner\/pet\?mode=selected/);
});

test("v4 manual hero controls and responsive reference composition", async ({ page }, testInfo) => {
  await mockHomepage(page);
  await installFakeMap(page);
  await installHomepageImageFixture(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".homepage-workbench-heading strong")).toHaveText("17개 지역");
  await expect(page.getByRole("button", { name: "위성지도", exact: true })).toHaveCount(0);
  await expect(page.getByText("여행 예시 · 데이터 출처 · 문의", { exact: true })).toHaveCount(0);
  await expect(page.getByText("전국 17개 시·도 중 17개 지역 조회 완료", { exact: true })).toHaveCount(0);
  const bottom = page.getByRole("region", { name: "데이터 출처와 문의", exact: true });
  await expect(bottom.locator(".weekendoog-partner-item")).toHaveCount(3);
  await expect(bottom.getByRole("link", { name: "GitHub 이슈에서 문의하기 (새 창)" })).toHaveAttribute("href", "https://github.com/pjh2558831-boop/PetPass/issues");
  expect(await bottom.evaluate(el => el.previousElementSibling?.classList.contains("home-landscape"))).toBe(true);
  const first = page.getByRole("button", { name: "여행 이미지 1", exact: true });
  await page.getByRole("button", { name: "다음 여행 이미지", exact: true }).click();
  await expect(page.getByRole("button", { name: "여행 이미지 2", exact: true })).toHaveAttribute("aria-pressed", "true");
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  for (const width of [1440, 1280, 951, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width === 951 ? 1654 : 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const hero = await page.locator(".weekendoog-hero").boundingBox();
    const recommendations = await page.locator(".home-recommendations").boundingBox();
    const map = await page.locator("#home-discovery").boundingBox();
    expect(hero!.y + hero!.height).toBeLessThan(recommendations!.y);
    expect(recommendations!.y + recommendations!.height).toBeLessThan(map!.y);
    if (width > 900) {
      await expect(page.locator(".homepage-workbench__map")).toBeVisible();
      await expect(page.locator(".homepage-workbench__list")).toBeVisible();
    } else {
      await page.getByRole("group", { name: "홈 장소 지도 또는 목록 보기" }).getByRole("button", { name: "지도", exact: true }).click();
      await expect(page.locator(".homepage-workbench__map")).toBeVisible();
      await page.getByRole("group", { name: "홈 장소 지도 또는 목록 보기" }).getByRole("button", { name: "목록", exact: true }).click();
      await expect(page.locator(".homepage-workbench__list")).toBeVisible();
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: testInfo.outputPath("homepage-v4-" + width + ".png"), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("v4 prioritizes photos for every region and opens footer policies", async ({ page }, testInfo) => {
  await mockHomepage(page);
  await installFakeMap(page);
  await installHomepageImageFixture(page);
  await page.route(HOMEPAGE_INITIAL_API, route => {
    const region = new URL(route.request().url()).searchParams.get("region");
    const data = initialSnapshot();
    data.markers = data.markers.map(marker => [marker[0], `${region} ${marker[0]}`, marker[2], marker[3], marker[4], marker[5], marker[6], marker[7], marker[8]]);
    return route.fulfill({ json: { ok: true, data: { ...data, region } } });
  });
  await page.route(HOMEPAGE_ENRICHMENT_API, route => route.fulfill({ json: { ok: true, data: { ...enrichmentSnapshot(), cards: [] } } }));
  await page.route("**/api/map/places/cards?**", route => {
    const params = new URL(route.request().url()).searchParams;
    const items = params.get("ids")!.split(",").map(id => ({ id, address: "테스트 주소", phone: null,
      imageUrl: id === "tour:1103" || id.startsWith("kakao:") ? "https://tong.visitkorea.or.kr/test-photo.jpg" : null,
      placeUrl: null, contentTypeId: null,
    }));
    return route.fulfill({ json: { ok: true, data: { contractVersion: 1, region: params.get("region"), dataset: params.get("dataset"), publicationVersion: "p1-e2e", items, page: 1, pageSize: 12, totalCount: items.length } } });
  });
  await page.goto("/");
  for (const region of REGION_CONFIGS.filter(region => region.mapEnabled)) {
    await page.getByRole("group", { name: "추천 장소 지역" }).getByRole("button", { name: region.displayName, exact: true }).click();
    const cards = page.locator(".homepage-place-scroller .homepage-place-card");
    await expect(cards.first()).toContainText(region.id);
    await expect(cards.first()).toHaveClass(/homepage-place-card--with-image/);
    const photoFlags = await cards.evaluateAll(cards => cards.map(card => card.classList.contains("homepage-place-card--with-image")));
    expect(photoFlags).toEqual([...photoFlags].sort((a, b) => Number(b) - Number(a)));
    expect(photoFlags).toContain(true);
    expect(photoFlags).toContain(false);
  }
  const policies = page.getByRole("navigation", { name: "서비스 정책", exact: true });
  await policies.getByRole("link", { name: "개인정보처리방침", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("개인정보처리방침");
  await expect(page.locator(".legal-document")).toContainText("배박이김");
  await expect(page.locator('.legal-document a[href="mailto:weekendog2@gmail.com"]')).toBeVisible();
  for (const width of [1292, 390, 320]) {
    await page.setViewportSize({ width, height: 986 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`privacy-${width}.png`), fullPage: true });
  }
  await page.getByRole("navigation", { name: "정책 문서", exact: true }).getByRole("link", { name: "이용약관", exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("이용약관");
  await expect(page.locator('.legal-document a[href="mailto:weekendog2@gmail.com"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
