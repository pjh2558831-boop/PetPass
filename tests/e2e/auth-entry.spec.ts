import { expect, test } from "@playwright/test";

test("separates login and signup entry while Kakao is unavailable", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "반려견 여행을 이어가세요" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "카카오 로그인 준비 중" }),
  ).toBeDisabled();
  await expect(
    page.getByText("카카오 로그인은 잠시 사용할 수 없어요."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeEnabled();

  const signupLink = page.getByRole("link", { name: "회원가입" });
  if (!(await signupLink.isVisible())) {
    await page.getByRole("button", { name: "메뉴 열기" }).click();
  }
  await signupLink.click();

  await expect(page).toHaveURL(/\/login\?mode=signup$/u);
  await expect(
    page.getByRole("heading", { name: "새 계정으로 여행을 시작하세요" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google로 회원가입" }),
  ).toBeEnabled();
});
