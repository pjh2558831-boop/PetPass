import { describe, expect, it, vi } from "vitest";
import {
  assembleHomepageCompletion,
  createHomepageCompletionLoader,
  homepageCompletionCacheKey,
} from "@/lib/homepage/homepage-completion";
import {
  mergeHomepageCompletion,
  projectHomepageInitialSnapshot,
} from "@/lib/homepage/homepage-progressive";
import type {
  HomepageCompletionRequest,
  HomepageCompletionSnapshot,
} from "@/types/homepage-completion";
import type { HomepageInitialPlacesSnapshot } from "@/types/homepage-initial";
import type { PublicMapPlaceDTO, PublicMapPlacePage } from "@/types/public-map-place";

const generationId = "g1-0123456789abcdef";
const dataVersion = "v1-0123456789abcdef";

function place(id: number): PublicMapPlaceDTO {
  return {
    id: `kakao:${id}`,
    provider: "kakao",
    providerPlaceId: String(id),
    name: `카카오 장소 ${id}`,
    kind: "pet_travel_candidate",
    category: id % 2 === 0 ? "cafe" : "shopping",
    district: { code: "110", name: "중구" },
    address: `부산 주소 ${id}`,
    coordinates: { latitude: 35 + id / 100_000, longitude: 129 + id / 100_000 },
    phone: null,
    imageUrl: null,
    contentTypeId: null,
    placeUrl: `https://place.map.kakao.com/${id}`,
    source: "kakao_search_candidate",
    petAccessVerdict: "unknown",
    reviewStatus: "unreviewed",
    publicLabel: "방문 전 확인 필요",
    categoryGroupCode: null,
    lastSeenAt: "2026-08-24T00:00:00.000Z",
    matchedQueryCount: 1,
    categoryQueryAgreementCount: 1,
  };
}

const request: HomepageCompletionRequest = {
  version: 1,
  region: "busan",
  scope: "default",
  dataset: "default-map",
  baseDataVersion: dataVersion,
  generationId,
  continuations: [{
    datasetId: "default-kakao",
    layer: "kakao",
    provider: "kakao",
    kind: "pet_travel_candidate",
    loadedItemCount: 200,
    expectedTotalCount: 500,
    nextCursor: 200,
    complete: false,
    generationId,
  }],
};

function page(afterId: number): PublicMapPlacePage {
  const remaining = 500 - afterId;
  const count = Math.min(200, remaining);
  const items = Array.from({ length: count }, (_, index) => place(afterId + index + 1));
  return {
    region: { id: "busan", displayName: "부산" },
    items,
    page: 1,
    pageSize: 200,
    totalCount: 500,
    hasNext: afterId + count < 500,
    nextCursor: afterId + count,
  };
}

function initial(): HomepageInitialPlacesSnapshot {
  return {
    contractVersion: 1,
    region: "busan",
    scope: "default",
    providers: "default",
    generatedAt: "2026-08-24T00:00:00.000Z",
    dataVersion,
    generationId,
    totalCount: 500,
    markerCount: 200,
    freshness: { status: "fresh" },
    layers: {
      tourism: { state: "empty", count: 0, markerCount: 0 },
      kakao: { state: "ready", count: 500, markerCount: 200 },
      veterinary: { state: "deferred", count: null, markerCount: null },
      pet_shop: { state: "deferred", count: null, markerCount: null },
    },
    categoryCounts: [["kakao", "cafe", 100], ["kakao", "shopping", 100]],
    markers: Array.from({ length: 200 }, (_, index) => {
      const item = place(index + 1);
      return [item.id, item.name, "kakao", item.category === "cafe" ? "cafe" : "shopping", "중구", item.coordinates.latitude, item.coordinates.longitude, "unknown", item.publicLabel] as const;
    }),
    cardDetails: [],
    continuations: request.continuations,
  };
}

describe("homepage default completion", () => {
  it("walks only cursor pages after the initial subset and returns every remaining record", async () => {
    const queryCatalog = vi.fn(async (input: { afterId?: number }) => page(input.afterId ?? 0));
    const completion = await assembleHomepageCompletion(request, { queryCatalog: queryCatalog as never });
    expect(queryCatalog.mock.calls.map(([input]) => input.afterId)).toEqual([200, 400]);
    expect(completion.returnedItemCount).toBe(300);
    expect(completion.complete).toBe(true);
    expect(completion.markers[0][0]).toBe("kakao:201");
    const merged = mergeHomepageCompletion(projectHomepageInitialSnapshot(initial()), completion, initial(), "busan");
    expect(merged.markers).toHaveLength(500);
    expect(new Set(merged.markers.map(({ id }) => id)).size).toBe(500);
  });

  it("rejects changed totals rather than mixing catalog generations", async () => {
    const queryCatalog = vi.fn(async (input: { afterId?: number }) => ({ ...page(input.afterId ?? 0), totalCount: 501 }));
    await expect(assembleHomepageCompletion(request, { queryCatalog: queryCatalog as never }))
      .rejects.toThrow(/generation/iu);
  });

  it("rejects mismatched hashes and cross-region responses", () => {
    const completion: HomepageCompletionSnapshot = {
      contractVersion: 1,
      region: "busan",
      scope: "default",
      dataset: "default-map",
      baseDataVersion: dataVersion,
      generationId,
      generatedAt: "2026-08-24T00:01:00.000Z",
      returnedItemCount: 0,
      expectedTotalCount: 500,
      complete: false,
      freshness: { status: "fresh" },
      continuations: request.continuations,
      categoryCounts: [],
      markers: [],
    };
    const base = projectHomepageInitialSnapshot(initial());
    expect(() => mergeHomepageCompletion(base, { ...completion, baseDataVersion: "v1-fedcba9876543210" }, initial(), "busan"))
      .toThrow(/generation/iu);
    expect(() => mergeHomepageCompletion(base, { ...completion, region: "jeju" }, initial(), "busan"))
      .toThrow(/region|scope/iu);
  });

  it("collapses Strict Mode style duplicate completion loads and preserves initial data on failure", async () => {
    let reject!: (reason?: unknown) => void;
    const pending = new Promise<HomepageCompletionSnapshot>((_resolve, rejectPromise) => { reject = rejectPromise; });
    const assemble = vi.fn(() => pending);
    const load = createHomepageCompletionLoader({ assemble: assemble as never });
    const first = load(request);
    const second = load(request);
    expect(assemble).toHaveBeenCalledTimes(1);
    reject(new Error("offline"));
    await expect(first).rejects.toThrow("offline");
    await expect(second).rejects.toThrow("offline");
    expect(projectHomepageInitialSnapshot(initial()).markers).toHaveLength(200);
  });

  it("includes every representation dimension in the completion cache key", () => {
    const key = homepageCompletionCacheKey(request);
    expect(key).toContain("1:busan:default:default-map");
    expect(key).toContain("default-kakao:kakao:all");
    expect(homepageCompletionCacheKey({ ...request, baseDataVersion: "v1-fedcba9876543210" })).not.toBe(key);
  });
});
