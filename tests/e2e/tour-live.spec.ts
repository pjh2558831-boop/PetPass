import { expect, test } from "@playwright/test";

test("displays live Busan Tourism places and original pet-policy evidence", async ({
  page,
}) => {
  test.setTimeout(120_000);
  test.skip(
    process.env.RUN_LIVE_TOUR_E2E !== "1",
    "Set RUN_LIVE_TOUR_E2E=1 for the opt-in live Tourism verification.",
  );

  const listResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/tour/places?"),
  );
  await page.goto(`http://localhost:3000/results?live-tour=${Date.now()}`);
  const listResponse = await listResponsePromise;
  expect(listResponse.status()).toBe(200);
  const listBody = (await listResponse.json()) as {
    ok: boolean;
    data?: {
      places?: Array<{
        contentId: string;
        title?: string;
        latitude?: number;
        longitude?: number;
      }>;
    };
  };
  expect(listBody.ok).toBe(true);
  expect(listBody.data?.places?.length).toBeGreaterThanOrEqual(10);

  await expect(page.getByText(/장소 \d+곳/)).toBeVisible();
  await expect
    .poll(() => page.locator(".kakao-map-marker").count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(10);

  const detailResponsePromise = page.waitForResponse((response) =>
    /\/api\/tour\/places\/\d+/.test(response.url()),
  );
  await page.getByRole("link", { name: /원문 상세 보기/ }).first().click();
  const detailResponse = await detailResponsePromise;
  expect(detailResponse.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "반려동물 동반 정보 원문" }),
  ).toBeVisible();
  await expect(page.getByText("제공처: Korea Tourism Organization")).toBeVisible();
  await expect(
    page.getByText(/동반 가능·조건부·불일치 판정은 하지 않습니다/),
  ).toBeVisible();
});
