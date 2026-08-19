import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseURL = process.env.EVIDENCE_BASE_URL ?? "http://localhost:3000";
const outputDirectory = path.resolve(
  "verification-evidence/weekendog-category-explorer-2026-08-19",
);

const retrievedAt = "2026-08-19T00:00:00.000Z";
const categories = [
  ["12", "attraction", "검증 관광지"],
  ["14", "culture", "검증 문화시설"],
  ["15", "festival", "검증 축제"],
  ["28", "leisure", "검증 레저시설"],
  ["39", "food", "검증 식당"],
  ["32", "accommodation", "검증 숙소"],
  ["38", "shopping", "검증 쇼핑"],
];

const tourPlaces = Array.from({ length: 21 }, (_, index) => {
  const [contentTypeId, category, label] = categories[index % categories.length];
  return {
    contentId: String(9800 + index),
    contentTypeId,
    providerContentTypeId: contentTypeId,
    category,
    title: `${label} ${String(index + 1).padStart(2, "0")}`,
    address: "부산광역시 수영구",
    detailAddress: null,
    longitude: 129.08 + (index % 6) * 0.012,
    latitude: 35.13 + Math.floor(index / 6) * 0.012,
    phone: null,
    thumbnailUrl: null,
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime: "20260819000000",
    legalRegionCode: "26",
    legalDistrictCode: "500",
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
      providerField: "showflag",
      providerValue: "1",
      checkedAt: retrievedAt,
      reasonCodes: [],
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt,
    },
  };
});

async function installTourMock(page) {
  await page.route("**/api/tour/places?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          places: tourPlaces,
          page: 1,
          pageSize: 1000,
          totalCount: tourPlaces.length,
          source: tourPlaces[0].source,
        },
        requestId: "category-evidence-tour",
      }),
    });
  });
}

async function capture(page, filename) {
  await page.screenshot({ path: path.join(outputDirectory, filename) });
}

async function setCategories(page, desired) {
  const panel = page.locator(".explorer-category-panel");
  const labels = ["관광지", "식당", "카페", "숙소", "쇼핑", "동물병원", "펫샵·용품점"];
  for (const label of labels) {
    const button = panel.getByRole("button", { name: new RegExp(`^${label}`) });
    const pressed = (await button.getAttribute("aria-pressed")) === "true";
    if (pressed !== desired.has(label)) await button.click();
  }
}

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
await installTourMock(page);
await page.goto(`${baseURL}/results?tab=catalog`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: /^총 \d+곳$/ }).waitFor();
const categoryPanel = page.locator(".explorer-category-panel");
await categoryPanel.waitFor();
try {
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll(".explorer-category-panel button")];
    const hasCount = (label) => {
      const button = buttons.find((element) => element.textContent?.includes(label));
      return Number(button?.querySelector("small")?.textContent ?? "0") > 0;
    };
    return hasCount("카페") && hasCount("동물병원") && hasCount("펫샵·용품점");
  }, undefined, { timeout: 30_000 });
} catch (error) {
  console.error(JSON.stringify({
    buttons: await categoryPanel.getByRole("button").allTextContents(),
    consoleErrors,
  }, null, 2));
  throw error;
}

await capture(page, "01-default-four-categories.png");
await page.locator(".explorer-category-panel").getByRole("button", { name: /^쇼핑/ }).click();
await capture(page, "02-shopping-enabled.png");
await page.locator(".explorer-category-panel").getByRole("button", { name: /^동물병원/ }).click();
await capture(page, "03-veterinary-enabled.png");
await page.locator(".explorer-category-panel").getByRole("button", { name: /^펫샵·용품점/ }).click();
await capture(page, "04-pet-shop-enabled.png");
await page.locator(".explorer-category-panel").getByRole("button", { name: "전체", exact: true }).click();
await capture(page, "05-all-seven-categories.png");
await page.locator(".explorer-category-panel").getByRole("button", { name: "기본으로", exact: true }).click();
await capture(page, "06-default-reset.png");
await capture(page, "07-recommendation-sorting.png");
await page.getByLabel("정렬").selectOption("popularity");
await page.getByText("이용 데이터가 쌓이는 동안 추천순을 함께 반영합니다.").waitFor();
await capture(page, "08-popularity-insufficient-notice.png");
await page.getByLabel("정렬").selectOption("recommendation");

await setCategories(page, new Set(["카페"]));
await page.locator(".catalog-result-card").first().waitFor();
await capture(page, "09-cafe-filter-existing-candidates-v2-zero.png");
await setCategories(page, new Set(["식당"]));
await page.locator(".catalog-result-card").first().waitFor();
await capture(page, "10-food-filter-existing-candidates-v2-zero.png");

await setCategories(page, new Set(["식당"]));
const locationPreview = page.getByText("위치 미리보기", { exact: true }).first();
await locationPreview.waitFor({ timeout: 20_000 });
const previewImage = page.locator('img[alt="장소 위치 미리보기"]').first();
await previewImage.waitFor({ timeout: 20_000 });
await page.waitForFunction(() => {
  const image = document.querySelector('img[alt="장소 위치 미리보기"]');
  return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
}, undefined, { timeout: 20_000 });
await capture(page, "11-location-preview-labelled.png");
await setCategories(page, new Set(["관광지"]));
await page.getByText("장소 사진 준비 중", { exact: true }).first().waitFor();
await capture(page, "12-category-placeholder.png");

await page.setViewportSize({ width: 768, height: 1024 });
await capture(page, "13-tablet-768.png");
await page.setViewportSize({ width: 390, height: 844 });
await capture(page, "14-mobile-390.png");

const overflow = await page.evaluate(() => ({
  viewport: document.documentElement.clientWidth,
  scroll: document.documentElement.scrollWidth,
}));
if (overflow.scroll > overflow.viewport) {
  throw new Error(`390px horizontal overflow: ${JSON.stringify(overflow)}`);
}
await page.setViewportSize({ width: 320, height: 800 });
const overflow320 = await page.evaluate(() => ({
  viewport: document.documentElement.clientWidth,
  scroll: document.documentElement.scrollWidth,
}));
if (overflow320.scroll > overflow320.viewport) {
  throw new Error(`320px horizontal overflow: ${JSON.stringify(overflow320)}`);
}
await browser.close();
console.log(JSON.stringify({
  outputDirectory,
  screenshots: 14,
  consoleErrors,
  overflow,
  overflow320,
}, null, 2));
