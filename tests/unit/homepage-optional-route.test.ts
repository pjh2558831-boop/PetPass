import { describe, expect, it, vi } from "vitest";
import { createHomepageOptionalHandler } from "@/app/api/homepage/places/optional/route";
import type { HomepageOptionalSnapshot } from "@/types/homepage-optional";

const snapshot: HomepageOptionalSnapshot = {
  contractVersion: 1,
  region: "busan",
  scope: "optional",
  providers: "kakao",
  dataset: "optional-veterinary",
  generatedAt: "2026-08-24T00:00:00.000Z",
  dataVersion: "v1-0123456789abcdef",
  generationId: "g1-0123456789abcdef",
  totalCount: 0,
  markerCount: 0,
  freshness: { status: "fresh" },
  layers: {
    tourism: { state: "deferred", count: null, markerCount: null },
    kakao: { state: "deferred", count: null, markerCount: null },
    veterinary: { state: "empty", count: 0, markerCount: 0 },
    pet_shop: { state: "deferred", count: null, markerCount: null },
  },
  categoryCounts: [],
  markers: [],
  cardDetails: [],
  continuations: [{
    datasetId: "optional-veterinary",
    layer: "veterinary",
    provider: "kakao",
    kind: "veterinary",
    loadedItemCount: 0,
    expectedTotalCount: 0,
    nextCursor: null,
    complete: true,
    generationId: "g1-0123456789abcdef",
  }],
};

const url = "http://localhost/api/homepage/places/optional?version=1&region=busan&scope=optional&dataset=optional-veterinary";

describe("homepage optional route", () => {
  it("caches only a successful public dataset", async () => {
    const loadOptional = vi.fn().mockResolvedValue(snapshot);
    const response = await createHomepageOptionalHandler({ loadOptional })(new Request(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toContain("max-age=300");
    expect(loadOptional).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["authorization", "Bearer private"],
    ["cookie", "session=private"],
  ] as const)("rejects %s-bearing requests with no-store", async (name, value) => {
    const loadOptional = vi.fn();
    const response = await createHomepageOptionalHandler({ loadOptional })(
      new Request(url, { headers: { [name]: value } }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loadOptional).not.toHaveBeenCalled();
  });

  it("rejects a capability-disabled region without loading", async () => {
    const loadOptional = vi.fn();
    const response = await createHomepageOptionalHandler({ loadOptional })(new Request(url.replace("region=busan", "region=jeju")));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loadOptional).not.toHaveBeenCalled();
  });
});
