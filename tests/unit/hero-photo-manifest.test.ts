import { access, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HERO_AUTOPLAY_INTERVAL_MS,
  HERO_CROSSFADE_DURATION_MS,
  HERO_PHOTOS,
} from "@/lib/homepage/hero-photo-manifest";

describe("homepage hero photo manifest", () => {
  it("keeps all eleven supplied originals in stable order with meaningful responsive metadata", async () => {
    expect(HERO_PHOTOS).toHaveLength(11);
    expect(new Set(HERO_PHOTOS.map(({ src }) => src)).size).toBe(11);
    expect(HERO_PHOTOS[0].src).toBe("/images/home/hero/01-corgi-tulips.png");
    expect(HERO_PHOTOS.at(-1)?.src).toBe("/images/home/hero/11-poodle-yellow-field.png");
    for (const photo of HERO_PHOTOS) {
      expect(photo.alt.length).toBeGreaterThan(15);
      expect(photo.objectPositionDesktop).toMatch(/^\d+% \d+%$/u);
      expect(photo.objectPositionMobile).toMatch(/^\d+% \d+%$/u);
      const localPath = path.join(process.cwd(), "public", photo.src.slice(1));
      await access(localPath);
      expect((await stat(localPath)).size).toBeGreaterThan(100_000);
    }
  });

  it("uses the approved six-second cadence and 600–900ms crossfade window", () => {
    expect(HERO_AUTOPLAY_INTERVAL_MS).toBe(6_000);
    expect(HERO_CROSSFADE_DURATION_MS).toBeGreaterThanOrEqual(600);
    expect(HERO_CROSSFADE_DURATION_MS).toBeLessThanOrEqual(900);
  });
});
