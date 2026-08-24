import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SOURCE_MARKER_ASSETS, SOURCE_MARKER_SOURCES } from "@/lib/kakao/marker-assets";

describe("source-aware map marker assets", () => {
  it("maps every source to one local SVG with shared geometry and anchor", () => {
    expect(SOURCE_MARKER_SOURCES).toHaveLength(4);
    const definitions = SOURCE_MARKER_SOURCES.map((source) => SOURCE_MARKER_ASSETS[source]);
    for (const definition of definitions) {
      expect(definition.path).toMatch(/^\/map-pins\/[a-z-]+\.svg$/u);
      expect(definition.path).not.toMatch(/^https?:/u);
      expect(definition.normal).toEqual({ width: 42, height: 51, anchorX: 21, anchorY: 50 });
      expect(definition.selected).toEqual({ width: 46, height: 56, anchorX: 23, anchorY: 55 });
      expect(definition.selected.width / definition.normal.width).toBeCloseTo(1.095, 2);
    }
  });

  it("ships transparent standalone SVGs without remote images, emoji, or ring effects", () => {
    for (const source of SOURCE_MARKER_SOURCES) {
      const asset = SOURCE_MARKER_ASSETS[source];
      const svg = readFileSync(resolve(process.cwd(), "public", asset.path.slice(1)), "utf8");
      expect(svg).toContain("<title>");
      expect(svg).not.toContain("<image");
      expect(svg).not.toMatch(/(?:href|src)=/u);
      expect(svg).not.toMatch(/animation|animate|filter=|radar|halo|ring/iu);
      expect(svg).not.toMatch(/[😀-🙏]/u);
    }
  });
});
