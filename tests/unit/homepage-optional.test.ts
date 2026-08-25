import { describe, expect, it, vi } from "vitest";
import {
  assembleHomepageOptionalDataset,
  createHomepageOptionalLoader,
  homepageOptionalCacheKey,
} from "@/lib/homepage/homepage-optional";
import {
  mergeHomepageEnrichment,
  mergeHomepageOptionalInitial,
  projectHomepageInitialSnapshot,
} from "@/lib/homepage/homepage-progressive";
import type { HomepageEnrichmentSnapshot } from "@/types/homepage-enrichment";
import type { HomepageInitialPlacesSnapshot } from "@/types/homepage-initial";
import type { HomepageOptionalRequest, HomepageOptionalSnapshot } from "@/types/homepage-optional";
import type { PublicMapPlaceDTO, PublicMapPlaceKind, PublicMapPlacePage } from "@/types/public-map-place";

const request: HomepageOptionalRequest = {
  version: 1,
  region: "busan",
  scope: "optional",
  dataset: "optional-veterinary",
};

function place(id: number, kind: PublicMapPlaceKind = "veterinary"): PublicMapPlaceDTO {
  return {
    id: `kakao:${id}`,
    provider: "kakao",
    providerPlaceId: String(id),
    name: `${kind} ${id}`,
    kind,
    category: "other",
    district: { code: "110", name: "중구" },
    address: `부산 주소 ${id}`,
    coordinates: { latitude: 35 + id / 100_000, longitude: 129 + id / 100_000 },
    phone: "051-000-0000",
    imageUrl: null,
    contentTypeId: null,
    placeUrl: `https://place.map.kakao.com/${id}`,
    source: "kakao_search_candidate",
    petAccessVerdict: "unknown",
    reviewStatus: "unreviewed",
    publicLabel: "운영 정보 확인 필요",
    categoryGroupCode: kind === "veterinary" ? "HP8" : null,
    lastSeenAt: "2026-08-24T00:00:00.000Z",
    matchedQueryCount: 1,
    categoryQueryAgreementCount: 1,
  };
}

function page(afterId: number, total = 257): PublicMapPlacePage {
  const count = Math.min(200, total - afterId);
  const hasNext = afterId + count < total;
  return {
    region: { id: "busan", displayName: "부산" },
    items: Array.from({ length: count }, (_, index) => place(afterId + index + 1)),
    page: 1,
    pageSize: 200,
    totalCount: total,
    hasNext,
    nextCursor: hasNext ? afterId + count : null,
  };
}

function baseInitial(): HomepageInitialPlacesSnapshot {
  return {
    contractVersion: 1,
    region: "busan",
    scope: "default",
    providers: "default",
    generatedAt: "2026-08-24T00:00:00.000Z",
    dataVersion: "v1-0123456789abcdef",
    generationId: "g1-0123456789abcdef",
    totalCount: 1,
    markerCount: 1,
    freshness: { status: "fresh" },
    layers: {
      tourism: { state: "ready", count: 1, markerCount: 1 },
      kakao: { state: "empty", count: 0, markerCount: 0 },
      veterinary: { state: "deferred", count: null, markerCount: null },
      pet_shop: { state: "deferred", count: null, markerCount: null },
    },
    categoryCounts: [["tourism", "attraction", 1]],
    markers: [["tour:1", "공식 장소", "tourism", "attraction", "중구", 35.1, 129.1, "allowed", "동반 가능"]],
    cardDetails: [],
    continuations: [{
      datasetId: "default-tour",
      layer: "tourism",
      provider: "tour",
      kind: "tourism_place",
      loadedItemCount: 1,
      expectedTotalCount: 1,
      nextCursor: 1,
      complete: true,
      generationId: "g1-0123456789abcdef",
    }],
  };
}

describe("capability-aware stored optional datasets", () => {
  it("loads only the selected hospital dataset and completes all bounded pages", async () => {
    const queryCatalog = vi.fn(async (input: { afterId?: number; kinds?: PublicMapPlaceKind[] }) => page(input.afterId ?? 0));
    const snapshot = await assembleHomepageOptionalDataset(request, { queryCatalog: queryCatalog as never });
    expect(queryCatalog).toHaveBeenCalledTimes(2);
    expect(queryCatalog.mock.calls.every(([input]) => input.kinds?.[0] === "veterinary")).toBe(true);
    expect(queryCatalog.mock.calls.some(([input]) => input.kinds?.[0] === "pet_shop")).toBe(false);
    expect(snapshot.markerCount).toBe(257);
    expect(snapshot.continuations[0]).toMatchObject({ complete: true, loadedItemCount: 257 });
  });

  it("collapses concurrent loads and performs no additional provider call on a warm repeat", async () => {
    const value = await assembleHomepageOptionalDataset(request, {
      queryCatalog: (async (input: { afterId?: number }) => page(input.afterId ?? 0)) as never,
    });
    let resolve!: (snapshot: HomepageOptionalSnapshot) => void;
    const pending = new Promise<HomepageOptionalSnapshot>((done) => { resolve = done; });
    const assemble = vi.fn(() => pending);
    const load = createHomepageOptionalLoader({ assemble: assemble as never });
    const first = load(request);
    const strictRepeat = load(request);
    expect(assemble).toHaveBeenCalledTimes(1);
    resolve(value);
    await expect(first).resolves.toBe(value);
    await expect(strictRepeat).resolves.toBe(value);
    await expect(load(request)).resolves.toBe(value);
    expect(assemble).toHaveBeenCalledTimes(1);
  });

  it("rejects hospital and pet-shop datasets when region capabilities do not permit them", async () => {
    const queryCatalog = vi.fn();
    await expect(assembleHomepageOptionalDataset({ ...request, region: "jeju" }, { queryCatalog }))
      .rejects.toThrow(/enabled|region/iu);
    await expect(assembleHomepageOptionalDataset({ ...request, region: "jeju", dataset: "optional-pet-shop" }, { queryCatalog }))
      .rejects.toThrow(/enabled|region/iu);
    expect(queryCatalog).not.toHaveBeenCalled();
  });

  it("keeps stored and official data usable when KTO enrichment fails", async () => {
    const optional = await assembleHomepageOptionalDataset(request, {
      queryCatalog: (async () => page(0, 1)) as never,
    });
    const merged = mergeHomepageOptionalInitial(projectHomepageInitialSnapshot(baseInitial()), optional, "busan");
    const failedKto: HomepageEnrichmentSnapshot = {
      contractVersion: 1,
      region: "busan",
      scope: "featured",
      generatedAt: "2026-08-24T01:00:00.000Z",
      dataVersion: "v1-fedcba9876543210",
      freshness: { status: "fresh" },
      featuredState: "unavailable",
      cards: [],
    };
    const afterFailure = mergeHomepageEnrichment(merged, failedKto, "busan");
    expect(afterFailure.markers.map(({ id }) => id)).toEqual(["tour:1", "kakao:1"]);
    expect(afterFailure.layers.veterinary.state).toBe("ready");
  });

  it("isolates optional cache keys by region, dataset, scope, provider, category, and contract", () => {
    const hospital = homepageOptionalCacheKey(request);
    const shop = homepageOptionalCacheKey({ ...request, dataset: "optional-pet-shop" });
    expect(hospital).toContain("1:busan:optional:optional-veterinary:kakao:veterinary");
    expect(shop).toContain("optional-pet-shop:kakao:pet_shop");
    expect(shop).not.toBe(hospital);
  });
});
