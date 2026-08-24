import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvatarField } from "@/components/auth/avatar-field";
import { OAuthLoginButtons } from "@/components/auth/oauth-login-buttons";

describe("auth UI", () => {
  it("shows Kakao before Google and gives both providers a logo", () => {
    const html = renderToStaticMarkup(createElement(OAuthLoginButtons));
    const kakaoIndex = html.indexOf("카카오로 계속하기");
    const googleIndex = html.indexOf("Google로 계속하기");

    expect(kakaoIndex).toBeGreaterThan(-1);
    expect(googleIndex).toBeGreaterThan(kakaoIndex);
    expect(html.match(/<svg/g)).toHaveLength(2);
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
