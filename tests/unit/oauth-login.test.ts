import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OAuthLoginButtons } from "@/components/auth/oauth-login-buttons";

const signInWithOAuth = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
vi.mock("@/lib/supabase/auth-client", () => ({
  createAuthBrowserClient: () => ({ auth: { signInWithOAuth } }),
}));

it("offers Kakao by default and requests only supported profile consent with a PKCE callback", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  try {
    await act(async () => root.render(createElement(OAuthLoginButtons)));
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("카카오"));
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "kakao",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { scope: "profile_nickname profile_image" },
      },
    });
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
