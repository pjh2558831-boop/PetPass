import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FormErrorMessage } from "@/components/ui/form-error-message";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("FormErrorMessage", () => {
  it("announces a form-level error and moves focus without blaming one field", async () => {
    await act(async () => {
      root.render(
        createElement(
          FormErrorMessage,
          { id: "profile-error" },
          "프로필을 저장하지 못했습니다.",
        ),
      );
    });

    const error = container.querySelector<HTMLElement>("#profile-error");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(error);
  });
});
