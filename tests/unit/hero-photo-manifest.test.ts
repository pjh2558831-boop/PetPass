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

  it("keeps the documentary Busan city photograph separate from the ten originals", async () => {
    expect(HERO_PHOTOS).not.toContain(HERO_FEATURED_PHOTO);
    expect(HERO_FEATURED_PHOTO.src).toBe(
      "/images/home/hero/weekendog-busan-city-ver2.webp",
    );
    expect(HERO_FEATURED_PHOTO.alt).toMatch(/부산.*해변.*도심/u);

    const localPath = path.join(
      process.cwd(),
      "public",
      HERO_FEATURED_PHOTO.src.slice(1),
    );
    await access(localPath);
    expect((await stat(localPath)).size).toBeGreaterThan(100_000);
  });
});
