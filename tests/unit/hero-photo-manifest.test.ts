import { access, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HERO_FEATURED_PHOTO,
  HERO_PHOTOS,
} from "@/lib/homepage/hero-photo-manifest";

describe("homepage hero photo manifest", () => {
  it("keeps the ten approved originals after image 06 removal with meaningful responsive metadata", async () => {
    expect(HERO_PHOTOS).toHaveLength(10);
    expect(new Set(HERO_PHOTOS.map(({ src }) => src)).size).toBe(10);
    expect(HERO_PHOTOS.some(({ src }) => src.includes("/06-"))).toBe(false);
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

  it("selects one approved Busan photograph for the static hero", () => {
    expect(HERO_FEATURED_PHOTO).toBe(HERO_PHOTOS[7]);
    expect(HERO_FEATURED_PHOTO.src).toBe(
      "/images/home/hero/09-bichon-busan-overlook.png",
    );
    expect(HERO_FEATURED_PHOTO.alt).toMatch(/광안대교와 부산 도심/u);
  });
});
