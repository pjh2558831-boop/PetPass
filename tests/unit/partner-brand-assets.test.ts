import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("homepage partner brand assets", () => {
  it("keeps official downloadable marks local and records source and usage notes", async () => {
    const root = process.cwd();
    const kakao = path.join(root, "public", "brand", "partners", "kakaomap-horizontal-ko.png");
    const mois = path.join(root, "public", "brand", "partners", "mois-horizontal-ko.jpg");
    await Promise.all([access(kakao), access(mois)]);
    expect((await stat(kakao)).size).toBeGreaterThan(1_000);
    expect((await stat(mois)).size).toBeGreaterThan(1_000);

    const documentation = await readFile(
      path.join(root, "docs", "partner-brand-assets.md"),
      "utf8",
    );
    expect(documentation).toContain("https://developers.kakao.com/tool/resource/map");
    expect(documentation).toContain("https://www.mois.go.kr/frt/sub/a07/miBanner/screen.do");
    expect(documentation).toContain("한국관광공사 콘텐츠 이용안내");
    expect(documentation).toContain("neutral icon fallback");
    expect(documentation).toContain("No asset is hotlinked at runtime.");
  });
});
