import { describe, expect, it, vi } from "vitest";
import { createHomepageOptionalHandler } from "@/app/api/homepage/places/optional/handler";
import { TourHomepageOptionalDatasetError } from "@/lib/tour-api/homepage-optional-dataset";
import {
  homepageOptionalDataHash,
  isHomepageOptionalSnapshot,
  type HomepageOptionalSnapshot,
} from "@/types/homepage-optional";

const snapshot: HomepageOptionalSnapshot = {
  contractVersion: 1,
  region: "busan",
  scope: "optional",
  providers: "kakao",
  dataset: "optional-veterinary",
  status: "complete_empty",
  generatedAt: "2026-08-24T00:00:00.000Z",
  retrievedAt: "2026-08-24T00:00:00.000Z",
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
  integrity: {
    dataHash: "",
    expectedItemCount: 0,
    returnedItemCount: 0,
    providerTotalCount: 0,
    visibilityTotalCount: null,
    pageCount: 1,
    visibilityPageCount: null,
    pageSize: 200,
    nextCursor: null,
    traversalComplete: true,
  },
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
snapshot.integrity.dataHash = homepageOptionalDataHash(snapshot);

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
  ] as const)("returns the same public DTO for %s-bearing requests", async (name, value) => {
    const loadOptional = vi.fn().mockResolvedValue(snapshot);
    const response = await createHomepageOptionalHandler({ loadOptional })(
      new Request(url, { headers: { [name]: value } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect((await response.json()).data).toEqual(snapshot);
    expect(loadOptional).toHaveBeenCalledWith(
      expect.objectContaining({ region: "busan", dataset: "optional-veterinary" }),
      expect.any(Function),
    );
  });

  it("rejects a capability-disabled region without loading", async () => {
    const loadOptional = vi.fn();
    const response = await createHomepageOptionalHandler({ loadOptional })(new Request(url.replace("region=busan", "region=jeju")));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loadOptional).not.toHaveBeenCalled();
  });

  it.each([
    `${url}&unknown=value`,
    `${url}&dataset=optional-veterinary`,
    url.replace("dataset=optional-veterinary", "dataset=optional-kto-shopping").replace("region=busan", "region=jeju"),
  ])("rejects non-canonical or unsupported requests before loading", async (invalidUrl) => {
    const loadOptional = vi.fn();
    const response = await createHomepageOptionalHandler({ loadOptional })(new Request(invalidUrl));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loadOptional).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "partial"] as const)(
    "returns an explicit uncached %s failure without masquerading as empty",
    async (datasetStatus) => {
      const loadOptional = vi.fn().mockRejectedValue(
        new TourHomepageOptionalDatasetError(datasetStatus, "provider failed"),
      );
      const response = await createHomepageOptionalHandler({ loadOptional })(new Request(url));
      const body = await response.json();
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(body).toMatchObject({
        ok: false,
        error: { datasetStatus, code: "UPSTREAM_ERROR" },
      });
      expect(JSON.stringify(body)).not.toContain("complete_empty");
    },
  );

  it("contains no user, session, cookie, credential, or provider secret fields", async () => {
    const response = await createHomepageOptionalHandler({
      loadOptional: vi.fn().mockResolvedValue(snapshot),
    })(new Request(url, { headers: { Cookie: "session=private" } }));
    const serialized = await response.text();
    expect(serialized).not.toMatch(/session|cookie|credential|service.?key|secret|authorization/iu);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("rejects hash, generation, and incomplete traversal mismatches before caching", async () => {
    expect(isHomepageOptionalSnapshot(snapshot)).toBe(true);
    const hashMismatch = {
      ...snapshot,
      markers: [["kakao:changed", "변조", "veterinary", "veterinary", "중구", 35.1, 129.1, "unknown", "확인 필요"]],
      markerCount: 1,
    };
    const generationMismatch = {
      ...snapshot,
      continuations: [{ ...snapshot.continuations[0], generationId: "g1-ffffffffffffffff" }],
    };
    const incompleteCursor = {
      ...snapshot,
      integrity: { ...snapshot.integrity, nextCursor: 1 },
      continuations: [{ ...snapshot.continuations[0], nextCursor: 1 }],
    };
    expect(isHomepageOptionalSnapshot(hashMismatch)).toBe(false);
    expect(isHomepageOptionalSnapshot(generationMismatch)).toBe(false);
    expect(isHomepageOptionalSnapshot(incompleteCursor)).toBe(false);
  });
});
