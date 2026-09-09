import { expect, test } from "@playwright/test";
import { mockHomepage, installFakeMap, installHomepageImageFixture } from "./homepage-test-helpers";

test("loads missing workbench photos from card details and offers retry after a failure", async ({ page }) => {
  await mockHomepage(page);
  await installFakeMap(page);
  await installHomepageImageFixture(page);
  let fail = true;
  await page.route("**/api/map/places/cards?**", (route) => {
    if (fail) return route.fulfill({ status: 503, json: { ok: false } });
    const params = new URL(route.request().url()).searchParams;
    const ids = params.get("ids")!.split(",");
    expect(ids.length).toBeLessThanOrEqual(12);
    const items = ids.map((id) => ({ id, address: "부산 테스트 주소", phone: null,
      imageUrl: "https://tong.visitkorea.or.kr/test-photo.jpg", placeUrl: null, contentTypeId: null }));
    return route.fulfill({ json: { ok: true, data: { contractVersion: 1,
      region: params.get("region"), dataset: "core", publicationVersion: "p1-e2e",
      items, page: 1, pageSize: 12, totalCount: items.length } } });
  });
  await page.goto("/");
  await page.locator(".home-region-overview").getByRole("button", { name: "부산", exact: false }).click();
  const retry = page.getByRole("button", { name: "사진 다시 불러오기" });
  await expect(retry).toBeVisible();
  fail = false;
  await retry.click();
  const photo = page.locator(".homepage-workbench-row__image img").first();
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(retry).toHaveCount(0);
});
