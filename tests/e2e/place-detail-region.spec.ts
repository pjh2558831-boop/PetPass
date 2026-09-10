import { test, expect } from "@playwright/test";
import { liveDetail } from "./license-mock";
import { installFakeMap } from "./homepage-test-helpers";

for (const region of [{ id: "busan", code: "26" }, { id: "seoul", code: "11" }]) {
  test(`regionless tourism links use the official ${region.id} region`, async ({ page }) => {
    await installFakeMap(page);
    const data = liveDetail("not_applicable");
    data.summary.legalRegionCode = region.code;
    await page.route("**/api/tour/places/3443614?**", route => route.fulfill({ json: { ok: true, data } }));
    await page.goto("/places/3443614?contentTypeId=39");
    await expect(page.getByRole("heading", { name: data.summary.title!, exact: true }).first()).toBeVisible();
    await expect(page.locator(`a[href="/results?tab=catalog&region=${region.id}"]`).first()).toBeVisible();
    await expect(page.getByText("선택한 지역에서 이 장소를 확인할 수 없습니다.")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test("an explicitly conflicting region remains rejected", async ({ page }) => {
  await page.route("**/api/tour/places/3443614?**", route => route.fulfill({ json: { ok: true, data: liveDetail("not_applicable") } }));
  await page.goto("/places/3443614?region=seoul&contentTypeId=39");
  await expect(page.getByText("선택한 지역에서 이 장소를 확인할 수 없습니다.")).toBeVisible();
});
