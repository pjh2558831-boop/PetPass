import { expect, test } from "@playwright/test";

test("shows a high-confidence lodging match through the real provider pipeline", async ({
  page,
}) => {
  await page.goto("/places/2001?contentTypeId=80");
  await expect(page.getByText("숙박 인허가 기록 일치")).toBeVisible();
  await expect(page.getByText("숙박업 인허가")).toBeVisible();
  await expect(page.getByText("확인된 세부 유형: 숙박시설")).toBeVisible();
});

test("shows a high-confidence tourist-accommodation match", async ({ page }) => {
  await page.goto("/places/2002?contentTypeId=80");
  await expect(page.getByText("관광숙박업 등록")).toBeVisible();
  await expect(page.getByText("관광호텔업")).toBeVisible();
  await expect(page.getByText("확인된 세부 유형: 호텔")).toBeVisible();
});

test("shows a high-confidence tourist-pension match", async ({ page }) => {
  await page.goto("/places/2003?contentTypeId=80");
  await expect(page.getByText("관광펜션업 등록")).toBeVisible();
  await expect(page.getByText("확인된 세부 유형: 관광펜션")).toBeVisible();
});

test("groups compatible cross-dataset licenses under one accommodation", async ({
  page,
}) => {
  await page.goto("/places/2004?contentTypeId=80");
  await expect(
    page.getByText("동일 시설에 대한 복수 인허가 기록이 확인되었습니다", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("숙박업 인허가")).toBeVisible();
  await expect(page.getByText("관광숙박업 등록")).toBeVisible();
  await expect(page.getByText("일치 가능한 숙박 인허가 기록이 여러 개입니다")).toHaveCount(0);
});

test("shows distinct cross-dataset businesses as ambiguous", async ({ page }) => {
  await page.goto("/places/2005?contentTypeId=80");
  await expect(
    page.getByText("일치 가능한 숙박 인허가 기록이 여러 개입니다"),
  ).toBeVisible();
  await expect(page.getByText("블루웨이브호텔")).toBeVisible();
  await expect(page.getByText("블루웨이브펜션")).toBeVisible();
  await expect(page.getByText(/확인된 세부 유형:/u)).toHaveCount(0);
});

test("shows the exact accommodation not-found disclaimer", async ({ page }) => {
  await page.goto("/places/2006?contentTypeId=80");
  await expect(
    page.getByText(
      "일치 기록이 검색되지 않았다는 의미이며, 무허가 숙박시설이라는 뜻은 아닙니다.",
    ),
  ).toBeVisible();
  await expect(page.getByText("무허가", { exact: true })).toHaveCount(0);
  await expect(page.getByText("불법", { exact: true })).toHaveCount(0);
});

test("keeps a partial accommodation match usable when one provider fails", async ({
  page,
}) => {
  await page.goto("/places/2007?contentTypeId=80");
  await expect(page.getByText("유사한 숙박 인허가 기록 확인 필요")).toBeVisible();
  await expect(page.getByText("숙박업 인허가")).toBeVisible();
  await expect(page.getByText("일부 숙박 인허가 제공처를 확인하지 못했습니다.")).toBeVisible();
});

test("keeps Tourism evidence visible when all accommodation providers fail", async ({
  page,
}) => {
  await page.goto("/places/2008?contentTypeId=80");
  await expect(page.getByRole("heading", { name: "폴트브레이크 호텔" })).toBeVisible();
  await expect(page.getByText("현재 숙박 인허가 정보를 확인할 수 없습니다").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "반려동물 동반 안내" })).toBeVisible();
});

test("shows a closed accommodation record as historical evidence", async ({ page }) => {
  await page.goto("/places/2009?contentTypeId=80");
  await expect(page.getByText("폐업 기록")).toBeVisible();
  await expect(page.getByText(/과거 기록일 수 있으므로/u)).toBeVisible();
});

test("surfaces conflicting operating states", async ({ page }) => {
  await page.goto("/places/2010?contentTypeId=80");
  await expect(
    page.getByText("데이터별 영업상태가 달라 현재 상태 확인이 필요합니다", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("폐업 기록")).toBeVisible();
  await expect(page.getByText("영업·정상 기록")).toBeVisible();
});

test("does not render accommodation licensing for a non-accommodation place", async ({
  page,
}) => {
  await page.goto("/places/2011?contentTypeId=76");
  await expect(page.getByRole("heading", { name: "해운대 해수욕장" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "인허가 정보" })).toHaveCount(0);
});

test("keeps food places on the existing food datasets", async ({ page }) => {
  await page.goto("/places/2012?contentTypeId=82");
  await expect(page.getByText("인허가 기록 일치")).toBeVisible();
  await expect(page.getByText("확인된 세부 유형: 일반음식점")).toBeVisible();
  await expect(page.getByText(/데이터셋: general_restaurants/u)).toBeVisible();
  await expect(page.getByText(/lodgings|tourist_accommodations|tourist_pensions/u)).toHaveCount(0);
});
