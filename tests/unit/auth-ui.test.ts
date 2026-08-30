import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvatarField } from "@/components/auth/avatar-field";
import { OAuthLoginButtons } from "@/components/auth/oauth-login-buttons";
import { SiteHeaderAccount } from "@/components/layout/site-header-account";

describe("auth UI", () => {
  it("makes the unavailable Kakao provider explicit and keeps Google usable", () => {
    const html = renderToStaticMarkup(createElement(OAuthLoginButtons, {
      mode: "login",
      kakaoEnabled: false,
    }));
    const kakaoIndex = html.indexOf("카카오 로그인 준비 중");
    const googleIndex = html.indexOf("Google로 계속하기");

    expect(kakaoIndex).toBeGreaterThan(-1);
    expect(googleIndex).toBeGreaterThan(kakaoIndex);
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).toContain("카카오 로그인은 잠시 사용할 수 없어요");
    expect(html).toMatch(/<button[^>]+disabled[^>]*>[^]*카카오 로그인 준비 중/);
  });

  it("uses distinct signup copy and a distinct signup URL", () => {
    const oauthHtml = renderToStaticMarkup(createElement(OAuthLoginButtons, {
      mode: "signup",
      kakaoEnabled: false,
    }));
    const headerHtml = renderToStaticMarkup(createElement(SiteHeaderAccount, {
      navigationItems: [],
    }));

    expect(oauthHtml).toContain("Google로 회원가입");
    expect(headerHtml).toContain('href="/login?mode=signup"');
  });

  it("uses a person silhouette instead of the WD initials for an empty avatar", () => {
    const html = renderToStaticMarkup(createElement(AvatarField, {
      userId: "9f791b6b-44dd-40ae-984a-503a275605eb",
      initialUrl: null,
    }));

    expect(html).not.toContain(">WD<");
    expect(html).toContain("lucide-user-round");
  });
});
