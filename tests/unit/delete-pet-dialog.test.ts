import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeletePetForm } from "@/components/account/delete-pet-form";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function buttonWithText(scope: ParentNode, label: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(window, "confirm").mockReturnValue(false);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DeletePetForm", () => {
  it("uses AppDialog instead of window.confirm while preserving the server form action", () => {
    const componentSource = readFileSync(
      join(process.cwd(), "components", "account", "delete-pet-form.tsx"),
      "utf8",
    );

    expect(componentSource).toContain("AppDialog");
    expect(componentSource).toContain("action={action}");
    expect(componentSource).not.toContain("window.confirm");
  });

  it("closes with Escape and cancel, then restores focus to the delete trigger", async () => {
    const action = vi.fn(async () => undefined);
    await act(async () => {
      root.render(createElement(DeletePetForm, { action, petName: "보리" }));
    });
    const trigger = buttonWithText(container, "삭제");
    trigger.focus();

    await click(trigger);
    let dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("보리");
    expect(window.confirm).not.toHaveBeenCalled();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await click(trigger);
    dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    await click(buttonWithText(dialog!, "취소"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(action).not.toHaveBeenCalled();
  });

  it("submits the original action only from the dialog confirmation", async () => {
    const action = vi.fn(async () => undefined);
    await act(async () => {
      root.render(createElement(DeletePetForm, { action, petName: "보리" }));
    });

    await click(buttonWithText(container, "삭제"));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const submit = [...dialog!.querySelectorAll<HTMLButtonElement>('button[type="submit"]')]
      .find((candidate) => candidate.textContent?.includes("삭제"));
    expect(submit).toBeDefined();
    await click(submit!);

    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
