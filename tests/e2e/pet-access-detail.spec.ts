import { expect, test } from "@playwright/test";

const verdictCases = [
  {
    name: "shows explicit unrestricted pet allowance",
    contentId: "3001",
    type: "38",
    verdictState: "allowed",
    verdict: "반려동물 동반 가능",
    extra: "전체 시설",
  },
  {
    name: "shows size-limited conditional allowance",
    contentId: "3002",
    type: "38",
    verdictState: "conditional",
    verdict: "조건부 동반 가능",
    extra: "크기 제한",
  },
  {
    name: "shows carrier-required conditional allowance",
    contentId: "3003",
    type: "38",
    verdictState: "conditional",
    verdict: "조건부 동반 가능",
    extra: "이동장·케이지 필요",
  },
  {
    name: "resolves indoor denial and outdoor allowance",
    contentId: "3004",
    type: "38",
    verdictState: "conditional",
    verdict: "조건부 동반 가능",
    extra: "야외",
  },
  {
    name: "shows selected-room conditional allowance",
    contentId: "3005",
    type: "32",
    verdictState: "conditional",
    verdict: "조건부 동반 가능",
    extra: "일부 지정 객실만 가능",
  },
  {
    name: "shows provider-attributed pet denial",
    contentId: "3006",
    type: "38",
    verdictState: "not_allowed",
    verdict: "반려동물 동반 불가로 안내됨",
    extra: "반려동물 동반 불가",
  },
  {
    name: "shows insufficient evidence for an empty response",
    contentId: "3007",
    type: "38",
    verdictState: "unknown",
    verdict: "반려동물 동반 여부 확인 필요",
    extra: "판단 근거 부족",
  },
  {
    name: "keeps inquiry-only evidence unknown",
    contentId: "3008",
    type: "38",
    verdictState: "unknown",
    verdict: "반려동물 동반 여부 확인 필요",
    extra: "시설 문의 필요",
  },
  {
    name: "surfaces conflicting provider evidence",
    contentId: "3009",
    type: "38",
    verdictState: "unknown",
    verdict: "반려동물 동반 여부 확인 필요",
    extra: "상충하는 원문 안내",
  },
] as const;

for (const scenario of verdictCases) {
  test(scenario.name, async ({ page }) => {
    await page.goto(`/places/${scenario.contentId}?contentTypeId=${scenario.type}&region=busan`);
    await expect(
      page.getByText(scenario.verdict, { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(scenario.extra).first()).toBeVisible();
    await expect(
      page.locator(`[data-verdict-icon="${scenario.verdictState}"]`),
    ).toBeVisible();
    await expect(page.getByText(/한국관광공사 제공 정보를 바탕으로 한 안내이며/u)).toBeVisible();
  });
}

test("keeps the detail page usable when the pet provider is unavailable", async ({
  page,
}) => {
  await page.goto("/places/3010?contentTypeId=38&region=busan");
  await expect(page.getByRole("heading", { name: "반려동물 원문 장애 관광지" })).toBeVisible();
  await expect(
    page.getByText("반려동물 동반 여부 확인 필요", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "반려동물 동반 안내" })
      .getByText("원문 자료 불러오기 실패"),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "반려동물 원문 장애 관광지 위치" })).toBeVisible();
});

test("fails closed for a legacy provider record rather than showing a pet denial", async ({
  page,
}) => {
  await page.goto("/places/3013?contentTypeId=38&region=busan");
  await expect(page.locator(".surface-card[role='alert']")).toBeVisible();
  await expect(
    page.getByText("반려동물 동반 불가로 안내됨", { exact: true }),
  ).toHaveCount(0);
});

test("uses trusted intro fallback with a partial warning", async ({ page }) => {
  await page.goto("/places/3011?contentTypeId=38&region=busan");
  await expect(page.getByText("반려동물 동반 가능", { exact: true }).first()).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "반려동물 동반 안내" })
      .getByText("일부 자료로 평가"),
  ).toBeVisible();
  await expect(page.getByText(/detailIntro2의 반려동물 전용 항목으로 부분 평가/u)).toBeVisible();
  await expect(page.getByText(/반려동물 동반 가능/u).last()).toBeVisible();
});

test("keeps identical pet evidence invariant across licensing states", async ({ page }) => {
  await page.goto("/places/2011?contentTypeId=12&region=busan");
  await expect(page.getByText("반려동물 동반 가능", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "인허가 정보" })).toHaveCount(0);

  await page.goto("/places/2012?contentTypeId=39&region=busan");
  await expect(page.getByText("반려동물 동반 가능", { exact: true })).toBeVisible();
  await expect(page.getByText("인허가 기록 일치", { exact: true })).toBeVisible();
  await expect(page.getByText(/데이터셋: general_restaurants/u)).toBeVisible();
  const panelOrder = await page.evaluate(() => {
    const assessment = document.getElementById("pet-access-decision-heading");
    const licensing = document.getElementById("license-heading");
    return Boolean(
      assessment &&
        licensing &&
        assessment.getBoundingClientRect().top <
          licensing.getBoundingClientRect().top,
    );
  });
  expect(panelOrder).toBe(true);
});

test("uses a truthful fallback title for provider-backed detail pages", async ({ page }) => {
  await page.goto("/places/3001?contentTypeId=38&region=busan");
  await expect(page).toHaveTitle("장소 상세 | WEEKENDOG");
});

test("ignores a spoofed browser content type for the verdict and provider selection", async ({
  page,
}) => {
  await page.goto("/places/3001?contentTypeId=39&region=busan");
  await expect(page.getByText("반려동물 동반 가능", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "인허가 정보" })).toHaveCount(0);
});

test("renders bounded provider evidence as text without executable HTML", async ({ page }) => {
  await page.goto("/places/3012?contentTypeId=38&region=busan");
  await expect(page.getByText("조건부 동반 가능", { exact: true })).toBeVisible();
  await expect(page.getByText("목줄 필요", { exact: true })).toBeVisible();
  await expect(page.getByText("반려동물 동반 가능", { exact: true }).last()).toBeVisible();
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  await expect(page.getByText(/onerror=alert/u)).toHaveCount(0);
});

test("keeps the assessment readable without horizontal overflow", async ({ page }) => {
  await page.goto("/places/3004?contentTypeId=38&region=busan");
  await expect(page.getByRole("heading", { name: "반려동물 동반 안내" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const assessment = page.locator(".place-detail-assessment");
  const intro = page.locator(".place-detail-intro");
  const [assessmentBox, introBox] = await Promise.all([
    assessment.boundingBox(),
    intro.boundingBox(),
  ]);
  expect(assessmentBox).not.toBeNull();
  expect(introBox).not.toBeNull();
  expect(assessmentBox?.width ?? 0).toBeGreaterThanOrEqual((introBox?.width ?? 0) - 2);
  await expect(page.locator(".kakao-map-canvas")).toHaveAttribute("data-initial-level", "4");
});

test("puts the visit decision before evidence and removes dashboard-style detail panels", async ({
  page,
}) => {
  await page.goto("/places/3004?contentTypeId=38&region=busan");
  await expect(page.locator("#pet-access-decision-heading")).toBeVisible();

  await expect(page.getByText("PET ACCESS ASSESSMENT", { exact: true })).toHaveCount(0);
  await expect(page.getByText("SOURCE & TRUST", { exact: true })).toHaveCount(0);
  await expect(page.locator(".place-detail-evidence-layer .surface-card")).toHaveCount(0);

  const hierarchy = await page.evaluate(() => {
    const decision = document.getElementById("pet-access-decision-heading");
    const overview = document.getElementById("place-overview-heading");
    const evidence = document.getElementById("pet-access-evidence-heading");
    const sources = document.getElementById("source-trust-heading");
    const technical = document.getElementById("place-technical-heading");

    if (!decision || !overview || !evidence || !sources || !technical) return null;

    return [decision, overview, evidence, sources, technical].map(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
  });

  expect(hierarchy).not.toBeNull();
  expect(hierarchy?.[0] ?? Number.POSITIVE_INFINITY).toBeLessThan(hierarchy?.[1] ?? 0);
  expect(hierarchy?.[1] ?? Number.POSITIVE_INFINITY).toBeLessThan(hierarchy?.[2] ?? 0);
  expect(hierarchy?.[2] ?? Number.POSITIVE_INFINITY).toBeLessThan(hierarchy?.[3] ?? 0);
  expect(hierarchy?.[3] ?? Number.POSITIVE_INFINITY).toBeLessThan(hierarchy?.[4] ?? 0);
});

test("keeps technical assessment and trust metadata in accessible disclosures", async ({
  page,
}) => {
  await page.goto("/places/3004?contentTypeId=38&region=busan");

  const assessmentButton = page.locator(
    'button[aria-controls^="pet-access-technical-"]',
  );
  const trustButton = page.locator(
    'button[aria-controls^="source-trust-technical-"]',
  );

  await expect(assessmentButton).toHaveAccessibleName("동반 평가 기술 정보 펼치기");
  await expect(trustButton).toHaveAccessibleName("신뢰도 산정 기술 정보 펼치기");
  await expect(assessmentButton).toHaveAttribute("aria-expanded", "false");
  await expect(trustButton).toHaveAttribute("aria-expanded", "false");

  const assessmentPanelId = await assessmentButton.getAttribute("aria-controls");
  const trustPanelId = await trustButton.getAttribute("aria-controls");
  expect(assessmentPanelId).toBeTruthy();
  expect(trustPanelId).toBeTruthy();

  const assessmentPanel = page.locator(`#${assessmentPanelId}`);
  const trustPanel = page.locator(`#${trustPanelId}`);
  await expect(assessmentPanel).toBeHidden();
  await expect(trustPanel).toBeHidden();

  await assessmentButton.focus();
  await assessmentButton.press("Enter");
  await expect(assessmentButton).toHaveAttribute("aria-expanded", "true");
  await expect(assessmentButton).toHaveAccessibleName("동반 평가 기술 정보 접기");
  await expect(assessmentPanel).toBeVisible();
  await expect(assessmentPanel.getByText(/규칙 버전:/u)).toBeVisible();
  await expect(assessmentButton).toBeFocused();

  await trustButton.focus();
  await trustButton.press("Space");
  await expect(trustButton).toHaveAttribute("aria-expanded", "true");
  await expect(trustButton).toHaveAccessibleName("신뢰도 산정 기술 정보 접기");
  await expect(trustPanel).toBeVisible();
  await expect(trustPanel.getByText(/근거 신뢰 점수:/u)).toBeVisible();
  await expect(trustButton).toBeFocused();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 720 },
]) {
  test(`keeps the flattened detail usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/places/3004?contentTypeId=38&region=busan");

    await expect(page.getByRole("heading", { name: "반려동물 동반 안내" })).toBeVisible();
    await expect(page.getByRole("button", { name: "동반 평가 기술 정보 펼치기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "신뢰도 산정 기술 정보 펼치기" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("replaces a failed provider image with an accessible fallback", async ({
  page,
}) => {
  await page.goto("/places/3014?contentTypeId=38&region=busan");
  await expect(
    page.getByRole("img", { name: "이미지 오류 관광지 이미지 불러오기 실패" }),
  ).toBeVisible();
  await expect(page.getByText("이미지를 불러올 수 없어요")).toBeVisible();
});
