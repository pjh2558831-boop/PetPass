import { expect, test } from "@playwright/test";

test("keeps login and signup compact with both social providers", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "반려견 여행을 이어가세요" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "카카오로 계속하기" })).toBeEnabled();
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
  await expect(page.getByRole("button", { name: "카카오로 회원가입" })).toBeEnabled();
  await expect(page.locator(".surface-card, .surface-panel")).toHaveCount(0);
});

test("starts Kakao with profile consent only and preserves the PKCE callback", async ({ page }) => {
  let authorizationUrl: URL | undefined;
  await page.route("https://petpass-e2e.invalid/auth/v1/authorize**", async (route) => {
    authorizationUrl = new URL(route.request().url());
    await route.fulfill({ contentType: "text/html", body: "Kakao authorization request captured" });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "카카오로 계속하기" }).click();
  await expect(page.getByText("Kakao authorization request captured")).toBeVisible();
  expect(authorizationUrl?.searchParams.get("provider")).toBe("kakao");
  expect(authorizationUrl?.searchParams.get("scope")).toBe("profile_nickname profile_image");
  expect(authorizationUrl?.searchParams.get("redirect_to")).toBe("http://localhost:3000/auth/callback");
  expect(authorizationUrl?.searchParams.get("code_challenge")).toBeTruthy();
  expect(authorizationUrl?.searchParams.get("code_challenge_method")).toBe("s256");
});

test("moves focus to a truthful OAuth callback error", async ({ page }) => {
  await page.goto("/login?error=oauth");

  const alert = page.locator("#login-oauth-error");
  await expect(alert).toContainText("소셜 로그인을 완료하지 못했습니다.");
  await expect(alert).toBeFocused();
});
