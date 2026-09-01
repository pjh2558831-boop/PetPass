import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductState } from "@/components/ui/product-state";

function source(...segments: string[]) {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

function optionalSource(...segments: string[]) {
  const path = join(process.cwd(), ...segments);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function quotedTechnicalCopy(value: string): string[] {
  return [...value.matchAll(/(["'`])([^\r\n]*?(?:Kakao|geometry)[^\r\n]*?)\1/gu)]
    .map((match) => match[2] ?? "");
}

describe("all-routes visual and navigation contracts", () => {
  it("targets one global main landmark without changing protected homepage upper selectors", () => {
    const layout = source("app", "layout.tsx");
    const skipLink = source("components", "home", "homepage-skip-link.tsx");
    const hero = source("components", "home", "weekendoog-hero.tsx");
    const heroPhoto = source("components", "home", "hero-photo-carousel.tsx");
    const launcher = source("components", "home", "hero-planner-launcher.tsx");
    const planner = source("components", "planner", "unified-planner-form.tsx");

    expect(layout).toMatch(/<main\s+id="main-content"/u);
    expect(skipLink).toContain('href="#main-content"');
    expect(skipLink).toContain('getElementById("main-content")');

    expect(hero).toContain('className="weekendoog-hero"');
    expect(hero).toContain('id="weekendoog-hero-heading"');
    expect(heroPhoto).toContain('className="weekendoog-hero-photo-frame"');
    expect(launcher).toContain('className="hero-planner-launcher"');
    expect(planner).not.toContain("<main");
  });

  it("keeps programmatically focused planner step headings visibly outlined", () => {
    const styles = source("app", "weekendog-globals.css");

    expect(styles).not.toMatch(
      /\.planner-step-header h2:focus\s*\{[^}]*outline:\s*none/iu,
    );
  });

  it("keeps only live public navigation branches and exposes current-page semantics", () => {
    const header = source("components", "layout", "site-header.tsx");
    const mobile = source("components", "layout", "mobile-navigation.tsx");
    const activeLink = optionalSource("components", "layout", "site-navigation-link.tsx");
    const navigationSource = `${header}\n${mobile}\n${activeLink}`;

    expect(navigationSource).not.toContain('kind: "future"');
    expect(navigationSource).not.toContain("site-header-future");
    expect(navigationSource).not.toContain("site-mobile-menu-future");
    expect(navigationSource).not.toContain("site-mobile-account-future");
    expect(navigationSource).not.toContain("준비 중");
    expect(navigationSource).toContain("aria-current");
  });

  it("uses open auth and account layouts instead of dashboard card grammar", () => {
    const login = source("app", "login", "page.tsx");
    const onboarding = source("app", "onboarding", "page.tsx");
    const account = source("app", "account", "page.tsx");
    const profile = source("app", "account", "profile", "page.tsx");
    const petEditor = source("components", "account", "pet-editor-form.tsx");

    for (const routeSource of [login, onboarding, account, profile, petEditor]) {
      expect(routeSource).not.toContain("surface-card");
      expect(routeSource).not.toContain("surface-panel");
    }
    expect(`${login}\n${account}\n${profile}`).not.toContain("WEEKENDOG 계정");
  });

  it("uses the shared open ProductState grammar for loading, error, and not-found", () => {
    const loading = source("app", "loading.tsx");
    const error = source("app", "error.tsx");
    const notFound = source("app", "not-found.tsx");

    for (const stateSource of [loading, error, notFound]) {
      expect(stateSource).toContain("ProductState");
      expect(stateSource).not.toContain("surface-card");
      expect(stateSource).not.toContain("surface-panel");
    }
    expect(`${loading}\n${error}\n${notFound}`).not.toMatch(
      /Supabase|환경 변수|stack trace|데모 장소/u,
    );
  });

  it("names live product states once through their visible heading", () => {
    const html = renderToStaticMarkup(createElement(ProductState, {
      status: "alert",
      title: "장소 정보를 불러오지 못했어요.",
      description: "잠시 후 다시 시도해 주세요.",
      headingProps: { id: "test-product-state-heading" },
    }));

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-labelledby="test-product-state-heading"');
    expect(html).toContain('aria-describedby="test-product-state-heading-description"');
    expect(html).not.toContain('aria-label="장소 정보를 불러오지 못했어요."');
  });

  it("flattens saved itinerary presentation and removes provider engineering prose", () => {
    const itineraryPage = source("app", "itinerary", "page.tsx");
    const itineraryEditor = source("components", "itinerary", "itinerary-editor.tsx");
    const recommendation = source("components", "itinerary", "recommendation-planner.tsx");
    const savedViews = source("components", "itinerary", "saved-itinerary-view.tsx");
    const savedRecommendation = savedViews.slice(
      0,
      savedViews.indexOf("export function LegacyItineraryView"),
    );

    expect(itineraryPage).not.toContain("PlannerProgress");
    expect(savedRecommendation).not.toContain("surface-card");
    expect(savedRecommendation).not.toContain("sm:grid-cols-2 lg:grid-cols-4");
    expect(quotedTechnicalCopy(`${itineraryEditor}\n${recommendation}`)).toEqual([]);
  });

  it("keeps implementation and demo terminology out of public support and fallback copy", () => {
    const informationReport = source(
      "components",
      "places",
      "information-report-draft-panel.tsx",
    );
    const notFound = source("app", "not-found.tsx");

    expect(informationReport).not.toContain("Supabase");
    expect(notFound).not.toContain("데모");
  });

  it("renders the valid demo detail without a missing-image state or a misleading itinerary link", () => {
    const detail = source("app", "places", "[contentId]", "page.tsx");

    expect(detail).not.toContain("MissingImage");
    expect(detail).not.toContain('href="/itinerary"');
    expect(detail).not.toContain("이 장소가 담긴 일정 보기");
    expect(detail).toContain("getDemoPlace(contentId)");
  });

  it("keeps itinerary and place-detail touch actions at least 44px high", () => {
    const provenance = source("components", "itinerary", "recommendation-stop-provenance.tsx");
    const petAccess = source("components", "itinerary", "pet-access-details.tsx");
    const assessment = source("components", "pet-access", "assessment-panel.tsx");

    expect(provenance).toMatch(/aria-label=\{`\$\{stop\.title\} 자동 장소 바꾸기`\}[\s\S]*?className="[^"]*min-h-11/gu);
    expect(petAccess).toMatch(/<summary className="[^"]*min-h-11/gu);
    expect(assessment).toMatch(/href=\{assessment\.contactAction\.href\}[\s\S]*?className="[^"]*min-h-11/gu);
  });

  it("only labels a map as an itinerary route when route coordinates exist", () => {
    const mapPanel = source("components", "map", "map-panel.tsx");

    expect(mapPanel).toContain('routeCoordinates.length >= 2 ? "지도 · 실제 장소와 이동 경로" : "지도 · 실제 장소"');
    expect(mapPanel).not.toContain('<div className="map-watermark">지도 · 실제 장소와 이동 경로</div>');
  });

  it("keeps provider and parser diagnostics out of the public place-detail error", () => {
    const detail = source("components", "places", "live-place-detail.tsx");

    expect(detail).toContain("PublicDetailLoadError");
    expect(detail).toContain('case "NOT_FOUND"');
    expect(detail).toContain('case "UPSTREAM_TIMEOUT"');
    expect(detail).not.toContain("body.error.message");
    expect(detail).not.toContain("loadError instanceof Error");
  });

  it("keeps provider and configuration diagnostics out of departure search", () => {
    const departureSearch = source("components", "planner", "departure-search.tsx");

    expect(departureSearch).toContain("PublicDepartureSearchError");
    expect(departureSearch).toContain("출발지 검색 제공처 연결을 확인하지 못했습니다.");
    expect(departureSearch).not.toContain("typeof error?.message");
    expect(departureSearch).not.toContain("error instanceof Error");
  });
});
