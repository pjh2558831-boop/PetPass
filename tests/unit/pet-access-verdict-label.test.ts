import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/pet-access/status-badge";
import { tourPetAccessVerdictLabel } from "@/lib/pet-access/tourism/verdict-label";

describe("tourPetAccessVerdictLabel", () => {
  it("uses one access label for every registered-place legacy verdict and region", () => {
    for (const region of ["busan", "jeju", "seoul"] as const) {
      for (const verdict of ["allowed", "conditional", "not_allowed", "unknown"] as const) {
        expect(tourPetAccessVerdictLabel(verdict, region)).toBe("반려동물 동반 가능");
      }
    }
  });

  it("renders no ambiguous status badge for a registered place", () => {
    for (const status of ["AVAILABLE", "CONDITIONAL", "NEEDS_CONFIRMATION", "NOT_MATCHED"] as const) {
      const html = renderToStaticMarkup(createElement(StatusBadge, { status }));
      expect(html).toContain("반려동물 동반 가능");
      expect(html).not.toMatch(/조건부|확인 필요|조건 불일치/u);
    }
  });

  it("keeps ambiguous access labels out of user-facing components", () => {
    const source = [
      "components/pet-access/status-badge.tsx",
      "components/places/pet-access-assessment-panel.tsx",
      "components/itinerary/pet-access-details.tsx",
      "components/home/home-selected-itinerary-tray.tsx",
      "components/home/official-place-carousel.tsx",
      "components/home/public-data-trust-card.tsx",
      "lib/homepage/editorial-content.ts",
    ].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");

    expect(source).not.toMatch(
      /조건부 동반|동반 정보 확인 필요|동반 여부 확인 필요|동반 가능 여부 확인 필요|이용 조건 확인|근거 확인 필요|검증 필요|검증 대기/u,
    );
  });
});
