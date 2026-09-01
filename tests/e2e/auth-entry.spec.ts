import { expect, test } from "@playwright/test";

test("keeps login and signup compact while omitting the unavailable Kakao entry", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "반려견 여행을 이어가세요" }),
  ).toBeVisible();
  await expect(page.getByText(/카카오/u)).toHaveCount(0);
  await expect(page.locator(".surface-card, .surface-panel")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeEnabled();

  const signupLink = page
    .getByRole("main")
    .getByRole("link", { name: "회원가입" });
  await signupLink.click();

  await expect(page).toHaveURL(/\/login\?mode=signup$/u);
  await expect(
    page.getByRole("heading", { name: "새 계정으로 여행을 시작하세요" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google로 회원가입" }),
  ).toBeEnabled();
  await expect(page.getByText(/카카오/u)).toHaveCount(0);
  await expect(page.locator(".surface-card, .surface-panel")).toHaveCount(0);
});

test("moves focus to a truthful OAuth callback error", async ({ page }) => {
  await page.goto("/login?error=oauth");

  const alert = page.locator("#login-oauth-error");
  await expect(alert).toContainText("소셜 로그인을 완료하지 못했습니다.");
  await expect(alert).toBeFocused();
});
