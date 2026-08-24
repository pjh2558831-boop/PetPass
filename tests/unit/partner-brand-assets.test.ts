import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("homepage partner brand assets", () => {
  it("keeps official downloadable marks local and records source and usage notes", async () => {
    const root = process.cwd();
    const kakao = path.join(root, "public", "brand", "partners", "kakaomap-horizontal-ko.png");
    const mois = path.join(
      root,
      "public",
      "brand",
      "partners",
      "mois-horizontal-ko-transparent.png",
    );
    const moisTrimmed = path.join(
      root,
      "public",
      "brand",
      "partners",
      "mois-horizontal-ko-transparent-trimmed.png",
    );
    const tourism = path.join(
      root,
      "public",
      "brand",
      "partners",
      "kto-horizontal-ko-transparent.png",
    );
    await Promise.all([access(kakao), access(mois), access(moisTrimmed), access(tourism)]);
    expect((await stat(kakao)).size).toBeGreaterThan(1_000);
    expect((await stat(mois)).size).toBeGreaterThan(1_000);
    expect((await stat(moisTrimmed)).size).toBeGreaterThan(1_000);
    expect((await stat(tourism)).size).toBeGreaterThan(1_000);

    const documentation = await readFile(
      path.join(root, "docs", "partner-brand-assets.md"),
      "utf8",
    );
    expect(documentation).toContain("https://developers.kakao.com/tool/resource/map");
    expect(documentation).toContain("https://www.mois.go.kr/frt/sub/a07/miBanner/screen.do");
    expect(documentation).toContain("kto-horizontal-ko-transparent.png");
    expect(documentation).toContain("mois-horizontal-ko-transparent-trimmed.png");
    expect(documentation).toContain("User-provided official Korea Tourism Organization");
    expect(documentation).toContain("No asset is hotlinked at runtime.");

    const component = await readFile(
      path.join(root, "components", "home", "public-data-trust-card.tsx"),
      "utf8",
    );
    expect(component).toContain(
      '/brand/partners/kto-horizontal-ko-transparent.png',
    );
    expect(component).toContain('/brand/partners/kakaomap-horizontal-ko.png');
    expect(component).toContain(
      '/brand/partners/mois-horizontal-ko-transparent-trimmed.png',
    );
    expect(component).not.toMatch(/https?:\/\//u);

    const [tourismPng, moisPng, moisTrimmedPng] = await Promise.all([
      readFile(tourism),
      readFile(mois),
      readFile(moisTrimmed),
    ]);
    expect([
      tourismPng.readUInt32BE(16),
      tourismPng.readUInt32BE(20),
      tourismPng[25],
    ]).toEqual([710, 242, 6]);
    expect([
      moisPng.readUInt32BE(16),
      moisPng.readUInt32BE(20),
      moisPng[25],
    ]).toEqual([942, 228, 6]);
    expect([
      moisTrimmedPng.readUInt32BE(16),
      moisTrimmedPng.readUInt32BE(20),
      moisTrimmedPng[25],
    ]).toEqual([419, 108, 6]);
  });
});
