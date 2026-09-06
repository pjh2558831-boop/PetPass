import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OnboardingSubmitButton } from "@/components/auth/onboarding-submit-button";

it("shows pending feedback and prevents repeat submits until the form action settles", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let finish!: () => void;
  const action = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  try {
    await act(async () => root.render(createElement("form", { action }, createElement(OnboardingSubmitButton))));
    const button = container.querySelector("button")!;
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.textContent).toBe("프로필 저장 중…");
    await act(async () => button.click());
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("프로필 확인 및 시작하기");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
