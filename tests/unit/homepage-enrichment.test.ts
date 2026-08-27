import { describe, expect, it, vi } from "vitest";
import { createHomepageEnrichmentHandler } from "@/app/api/homepage/places/enrichment/handler";
import {
  collectHomepageEnrichment,
  createHomepageEnrichmentLoader,
} from "@/lib/homepage/homepage-enrichment";
import type { TourPlaceService } from "@/lib/tour-api/service";
import type { TourHomepageSnapshot } from "@/types/homepage";

const NOW = "2026-08-24T03:00:00.000Z";
const service = { listPlaces: vi.fn(), getPlaceDetail: vi.fn() } as unknown as TourPlaceService;

function official(): TourHomepageSnapshot {
  const summary = {
    contentId: "100",
    contentTypeId: "12" as const,
    providerContentTypeId: "12" as const,
    category: "attraction" as const,
    title: "공식 동반 가능 장소",
    address: "부산광역시 중구",
    detailAddress: null,
    longitude: 129.1,
    latitude: 35.1,
    phone: "051-000-0000",
    thumbnailUrl: "https://example.com/official.jpg",
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime: null,
    legalRegionCode: "26",
    legalDistrictCode: "110",
    classificationCodes: {
      primary: null,
      secondary: null,
      tertiary: null,
      largeCategory: null,
      middleCategory: null,
      smallCategory: null,
    },
    providerVisibility: {
      status: "exposed" as const,
      providerField: "showflag" as const,
      providerValue: "1",
      checkedAt: NOW,
      reasonCodes: [],
    },
    source: {
      provider: "Korea Tourism Organization" as const,
      operation: "areaBasedList2" as const,
      retrievedAt: NOW,
    },
  };
  return {
    catalog: {
      places: [summary],
      page: 1,
      pageSize: 1,
      totalCount: 1,
      source: summary.source,
    },
    featured: {
      state: "ready",
      places: [{
        summary,
        assessment: {
          rulesetVersion: "1",
          verdict: "allowed",
          evaluationState: "complete",
          confidence: "high",
          reasonCodes: ["explicit_allowance"],
          summary: "동반 가능",
          permittedScopes: ["whole_place"],
          restrictedScopes: [],
          conditions: [],
          evidence: [],
          conflicts: [],
          verificationItems: [],
          evaluatedAt: NOW,
          providerModifiedTime: null,
          sources: [],
          warnings: [],
        },
        source: {
          provider: "Korea Tourism Organization",
          operation: "detailCommon2",
          contentId: "100",
          retrievedAt: NOW,
        },
      }],
      assessedCount: 1,
      failedCount: 0,
    },
  };
}

describe("homepage KTO enrichment", () => {
  it("returns only verified official card enrichment with fixed public provenance", async () => {
    const collectOfficial = vi.fn(async () => official());
    const result = await collectHomepageEnrichment({ service, collectOfficial });

    expect(collectOfficial).toHaveBeenCalledWith(expect.objectContaining({ service }));
    expect(result).toMatchObject({
      contractVersion: 1,
      region: "busan",
      scope: "featured",
      featuredState: "ready",
      freshness: { status: "fresh" },
      cards: [{
        id: "tour:100",
        layer: "official",
        isAllowed: true,
        sourceLabel: "한국관광공사",
      }],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("assessment");
    expect(serialized).not.toContain("evidence");
    expect(serialized).not.toContain("user");
    expect(serialized).not.toContain("session");
  });

  it("collapses generation and marks the last valid result stale after refresh failure", async () => {
    let nowMs = 0;
    const fresh = await collectHomepageEnrichment({
      service,
      collectOfficial: async () => official(),
    });
    const collect = vi.fn()
      .mockResolvedValueOnce(fresh)
      .mockRejectedValueOnce(new Error("KTO unavailable"));
    const load = createHomepageEnrichmentLoader({
      collect,
      now: () => nowMs,
      freshMs: 100,
      staleIfErrorMs: 1_000,
    });

    const [first, concurrent] = await Promise.all([load(), load()]);
    expect(first).toBe(concurrent);
    expect(collect).toHaveBeenCalledOnce();
    nowMs = 101;
    await expect(load()).resolves.toMatchObject({
      cards: first.cards,
      freshness: { status: "stale" },
    });
  });
});

describe("GET /api/homepage/places/enrichment", () => {
  const query = "version=1&region=busan&scope=featured";

  it("returns shared public caching without cookies", async () => {
    const snapshot = await collectHomepageEnrichment({
      service,
      collectOfficial: async () => official(),
    });
    const loadEnrichment = vi.fn(async () => snapshot);
    const response = await createHomepageEnrichmentHandler({ loadEnrichment })(
      new Request(`http://localhost/api/homepage/places/enrichment?${query}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    expect(response.headers.get("cdn-cache-control")).toContain("max-age=300");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("server-timing")).toMatch(/serialize;dur=/u);
    expect(loadEnrichment).toHaveBeenCalledWith(expect.any(Function));
  });

  it.each([
    "region=busan&scope=featured",
    "version=2&region=busan&scope=featured",
    "version=1&region=jeju&scope=featured",
    "version=1&region=busan&scope=other",
    "version=1&region=busan&scope=featured&user=1",
  ])("rejects non-canonical or personalized query as no-store: %s", async (parameters) => {
    const loadEnrichment = vi.fn();
    const response = await createHomepageEnrichmentHandler({ loadEnrichment })(
      new Request(`http://localhost/api/homepage/places/enrichment?${parameters}`),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(loadEnrichment).not.toHaveBeenCalled();
  });

  it("returns no-store when KTO enrichment fails", async () => {
    const response = await createHomepageEnrichmentHandler({
      loadEnrichment: async () => { throw new Error("KTO unavailable"); },
    })(new Request(`http://localhost/api/homepage/places/enrichment?${query}`));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
