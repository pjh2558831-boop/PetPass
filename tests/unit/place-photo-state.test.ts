import { act, createElement, type ImgHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceImage } from "@/components/places/place-image";
import { PlaceCardMedia } from "@/components/places/place-card-media";
import { hasRecentPhotoFailure, rememberPhotoFailure, retryPhoto } from "@/lib/places/photo-failure-cache";

vi.mock("next/image", () => ({ default: ({ fill, priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => { void fill; void priority; return createElement("img", props); } }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

for (const kind of ["detail", "card"] as const) {
  const render = (source: string | null) => act(() => root.render(kind === "detail"
    ? createElement(PlaceImage, { imageUrl: source, title: "테스트 장소", className: "reserved-photo" })
    : createElement(PlaceCardMedia, { image: source ? { kind: "provider_photo", src: source, alt: "테스트 장소" } : { kind: "category_placeholder", category: "cafe", alt: "테스트 장소 사진 준비 중" }, fallbackCategory: "cafe", className: "reserved-photo" })));
  describe(`${kind} photograph state`, () => {
    it("finishes missing photos, then distinguishes pending and loaded media", () => {
      render(null);
      expect(container.querySelector('[data-image-state="missing"]')).not.toBeNull();
      expect(container.textContent).not.toContain("준비 중");
      expect(container.querySelector("img")).toBeNull();
      render(`/state-${kind}.jpg`);
      expect(container.querySelector('[data-image-state="loading"]')).not.toBeNull();
      act(() => container.querySelector("img")!.dispatchEvent(new Event("load")));
      expect(container.querySelector('[data-image-state="loaded"]')).not.toBeNull();
    });
    it("consults URL failures on source changes and retries without activating the parent card", () => {
      const source = `/failed-${kind}.jpg`;
      render(`/before-${kind}.jpg`);
      rememberPhotoFailure(source);
      render(source);
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector('[data-image-state="failed"]')).not.toBeNull();
      const parentClick = vi.fn();
      document.addEventListener("click", parentClick);
      act(() => container.querySelector("button")!.click());
      expect(parentClick).not.toHaveBeenCalled();
      document.removeEventListener("click", parentClick);
      expect(hasRecentPhotoFailure(source)).toBe(false);
      expect(container.querySelector("img")).not.toBeNull();
      act(() => container.querySelector("img")!.dispatchEvent(new Event("error")));
      expect(container.querySelector(".reserved-photo")).not.toBeNull();
      act(() => root.render(null));
      render(source);
      expect(container.querySelector("img")).toBeNull();
      vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_001);
      act(() => root.render(null));
      render(source);
      expect(container.querySelector("img")).not.toBeNull();
      retryPhoto(source);
    });
  });
}
it("bounds failed URL memory and expires failures after one minute", () => {
  rememberPhotoFailure("oldest", 100);
  for (let i = 0; i < 128; i++) rememberPhotoFailure(`bounded-${i}`, 100);
  expect(hasRecentPhotoFailure("oldest", 101)).toBe(false);
  expect(hasRecentPhotoFailure("bounded-127", 60_099)).toBe(true);
  expect(hasRecentPhotoFailure("bounded-127", 60_100)).toBe(false);
});
