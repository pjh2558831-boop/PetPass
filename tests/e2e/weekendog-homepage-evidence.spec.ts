import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const CAPTURE_EVIDENCE = process.env.CAPTURE_WEEKENDOG_EVIDENCE === "1";
const EVIDENCE_DIRECTORY = path.resolve(
  process.cwd(),
  "verification-evidence",
  "weekendog-homepage-hero-trust-fine-tune-2026-08-15",
);
const EVIDENCE_FILES = [
  "homepage-1440-full.png",
  "hero-1440-close.png",
  "trust-1440-close.png",
  "homepage-768.png",
  "homepage-390.png",
  "homepage-320-overflow.png",
] as const;

function evidencePath(fileName: (typeof EVIDENCE_FILES)[number]) {
  return path.join(EVIDENCE_DIRECTORY, fileName);
}

async function installDeterministicKakaoMap(page: Page) {
  await page.addInitScript(() => {
    type Listener = (...args: unknown[]) => void;
    const listeners = new WeakMap<object, Map<string, Set<Listener>>>();
    const addListener = (target: object, name: string, handler: Listener) => {
      const targetListeners =
        listeners.get(target) ?? new Map<string, Set<Listener>>();
      const values = targetListeners.get(name) ?? new Set<Listener>();
      values.add(handler);
      targetListeners.set(name, values);
      listeners.set(target, targetListeners);
    };

    class LatLng {
      constructor(
        private readonly latitude: number,
        private readonly longitude: number,
      ) {}
      getLat() {
        return this.latitude;
      }
      getLng() {
        return this.longitude;
      }
    }

    class Bounds {
      extend() {}
      getNorthEast() {
        return new LatLng(35.3, 129.3);
      }
      getSouthWest() {
        return new LatLng(35, 129);
      }
    }

    class FakeMap {
      private center: LatLng;

      constructor(
        readonly container: HTMLElement,
        options: { center: LatLng },
      ) {
        this.center = options.center;
        container.dataset.fakeMapReady = "true";
      }
      getBounds() {
        return new Bounds();
      }
      getCenter() {
        return this.center;
      }
      panTo(value: LatLng) {
        this.center = value;
      }
      relayout() {}
      setBounds() {}
    }

    class Marker {
      setImage() {}
      setMap() {}
      setPosition() {}
      setZIndex() {}
    }

    class Overlay {
      constructor(
        private readonly options: { map: FakeMap; content: HTMLElement },
      ) {
        options.map.container.append(options.content);
      }
      setMap(map: FakeMap | null) {
        if (!map) this.options.content.remove();
      }
    }

    class Polyline {
      setMap() {}
    }

    class Clusterer {
      addMarkers() {}
      clear() {}
    }

    window.kakao = {
      maps: {
        load: (callback: () => void) => callback(),
        event: {
          addListener,
          removeListener(target: object, name: string, handler: Listener) {
            listeners.get(target)?.get(name)?.delete(handler);
          },
        },
        LatLng,
        LatLngBounds: Bounds,
        Map: FakeMap,
        CustomOverlay: Overlay,
        Marker,
        MarkerImage: class {},
        MarkerClusterer: Clusterer,
        Point: class {},
        Polyline,
        Size: class {},
      } as unknown as NonNullable<Window["kakao"]>["maps"],
    };
  });
}

async function settlePage(page: Page) {
  await page.addStyleTag({
    content:
      "nextjs-portal, [data-next-badge-root] { display: none !important; } body > header { position: static !important; }",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }),
    );
    window.scrollTo(0, 0);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBe(0);
}

async function captureHomepage(
  page: Page,
  width: number,
  height: number,
  fileName: (typeof EVIDENCE_FILES)[number],
) {
  await page.setViewportSize({ width, height });
  await settlePage(page);
  await page.screenshot({
    path: evidencePath(fileName),
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
}

test.describe("WEEKENDOG hero and trust-section visual evidence", () => {
  test.skip(
    !CAPTURE_EVIDENCE,
    "Set CAPTURE_WEEKENDOG_EVIDENCE=1 to write visual evidence.",
  );
  test.skip(({ isMobile }) => Boolean(isMobile), "Capture once in desktop Chromium.");

  test("writes the six requested fine-tune views", async ({ page }) => {
    test.setTimeout(120_000);
    await rm(EVIDENCE_DIRECTORY, { recursive: true, force: true });
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });

    await installDeterministicKakaoMap(page);
    await page.setViewportSize({ width: 1_440, height: 1_000 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "반려견과 함께, 어디로 떠나볼까요?",
      }),
    ).toBeVisible();
    await expect(page.locator(".homepage-live-ready")).toBeVisible({
      timeout: 30_000,
    });
    await settlePage(page);

    await page.screenshot({
      path: evidencePath("homepage-1440-full.png"),
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    });
    await page.locator(".weekendoog-hero").screenshot({
      path: evidencePath("hero-1440-close.png"),
      animations: "disabled",
      caret: "hide",
    });

    const trustSection = page.locator(".weekendoog-trust-section");
    await trustSection.scrollIntoViewIfNeeded();
    await expect(trustSection.locator("img")).toHaveCount(3);
    await expect
      .poll(() =>
        trustSection.locator("img").evaluateAll((images) =>
          images.every(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0,
          ),
        ),
      )
      .toBe(true);
    await trustSection.screenshot({
      path: evidencePath("trust-1440-close.png"),
      animations: "disabled",
      caret: "hide",
    });

    await captureHomepage(page, 768, 1_024, "homepage-768.png");
    await captureHomepage(page, 390, 844, "homepage-390.png");
    await captureHomepage(page, 320, 720, "homepage-320-overflow.png");

    const pngFiles = (await readdir(EVIDENCE_DIRECTORY))
      .filter((fileName) => fileName.endsWith(".png"))
      .sort();
    expect(pngFiles).toEqual([...EVIDENCE_FILES].sort());
  });
});
