import { describe, expect, it, vi } from "vitest";
import { createMapPlacesSnapshotHandler } from "@/app/api/map/places/snapshot/route";
import {
  assembleMapPlacesSnapshot,
  createMapPlacesSnapshotLoader,
} from "@/lib/map-places/snapshot";
import { isMapPlacesSnapshot } from "@/types/map-places-snapshot";
import type { PublicMapPlaceDTO, PublicMapPlacePage } from "@/types/public-map-place";
import type { RegionId } from "@/types/region";

function place(
  provider: "tour" | "kakao",
  region: RegionId,
  id: string,
  category: PublicMapPlaceDTO["category"] = "attraction",
): PublicMapPlaceDTO {
  const isTour = provider === "tour";
  return {
    id: `${provider}:${id}`,
    provider,
    providerPlaceId: id,
    name: `${region}-${provider}-${id}`,
    kind: isTour ? "tourism_place" : "pet_travel_candidate",
    category,
    district: { code: "110", name: region === "jeju" ? "제주시" : "중구" },
    address: region === "jeju" ? "제주특별자치도 제주시" : "부산광역시 중구",
    coordinates: region === "jeju"
      ? { latitude: 33.49, longitude: 126.53 }
      : { latitude: 35.1, longitude: 129.03 },
    phone: "051-000-0000",
    imageUrl: isTour ? "https://example.com/official.jpg" : null,
    contentTypeId: isTour ? "12" : null,
    placeUrl: isTour
      ? `/places/${id}?region=${region}&contentTypeId=12`
      : `https://place.map.kakao.com/${id}`,
    source: isTour ? "kto_official" : "kakao_search_candidate",
    petAccessVerdict: isTour ? "conditional" : "unknown",
    reviewStatus: isTour ? "confirmed" : "unreviewed",
    publicLabel: isTour ? "동반 조건 확인 필요" : "동반 여부 확인 필요",
    categoryGroupCode: null,
    lastSeenAt: "2026-08-24T00:00:00.000Z",
    matchedQueryCount: isTour ? 0 : 2,
    categoryQueryAgreementCount: isTour ? 0 : 2,
  };
}

function page(
  region: RegionId,
  items: PublicMapPlaceDTO[],
  totalCount = items.length,
  hasNext = false,
  nextCursor: number | null = null,
): PublicMapPlacePage {
  return {
    region: { id: region, displayName: region === "jeju" ? "제주" : "부산" },
    items,
    page: 1,
    pageSize: 200,
    totalCount,
    hasNext,
    nextCursor,
  };
}

const request = (region: RegionId) => ({ version: 1 as const, region, scope: "default" as const });

describe("public map snapshot assembly", () => {
  it("walks the bounded catalog once and preserves compact provider/category semantics", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(page("busan", [place("kakao", "busan", "1", "cafe")], 2, true, 41))
      .mockResolvedValueOnce(page("busan", [place("tour", "busan", "2", "attraction")], 2));

    const snapshot = await assembleMapPlacesSnapshot(request("busan"), {
      query,
      now: () => new Date("2026-08-24T01:00:00.000Z"),
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenNthCalledWith(1, expect.objectContaining({
      regionId: "busan",
      providers: ["tour", "kakao"],
      kinds: ["tourism_place", "pet_travel_candidate"],
      page: 1,
      pageSize: 200,
    }));
    expect(query).toHaveBeenNthCalledWith(2, expect.objectContaining({ afterId: 41, page: 2 }));
    expect(snapshot).toMatchObject({
      contractVersion: 1,
      region: "busan",
      scope: "default",
      totalCount: 2,
      providerCounts: { tour: 1, kakao: 1 },
      categoryCounts: { attraction: 1, cafe: 1 },
      freshness: { status: "fresh" },
      items: [
        { regionId: "busan", layer: "kakao", category: "cafe", petAccessVerdict: "unknown" },
        { regionId: "busan", layer: "tourism", category: "attraction", petAccessVerdict: "conditional" },
      ],
    });
    expect(snapshot.dataVersion).toMatch(/^v1-[a-f0-9]{16}$/u);
    expect(snapshot.items[0]).not.toHaveProperty("phone");
    expect(isMapPlacesSnapshot(snapshot)).toBe(true);
  });

  it("rejects cross-region and visibly partial catalog results", async () => {
    await expect(assembleMapPlacesSnapshot(request("busan"), {
      query: vi.fn(async () => page("jeju", [place("tour", "jeju", "1")])),
    })).rejects.toThrow(/region|지역/iu);

    await expect(assembleMapPlacesSnapshot(request("busan"), {
      query: vi.fn(async () => page("busan", [place("kakao", "busan", "1")], 2, false)),
    })).rejects.toThrow(/partial|완전|count|개수/iu);
  });

  it("validates version, region, and every compact item", async () => {
    const valid = await assembleMapPlacesSnapshot(request("jeju"), {
      query: vi.fn(async () => page("jeju", [place("tour", "jeju", "9", "accommodation")])),
    });
    expect(isMapPlacesSnapshot(valid)).toBe(true);
    expect(isMapPlacesSnapshot({ ...valid, contractVersion: 2 })).toBe(false);
    expect(isMapPlacesSnapshot({ ...valid, items: [{ ...valid.items[0], regionId: "busan" }] })).toBe(false);
    expect(isMapPlacesSnapshot({ ...valid, totalCount: 2 })).toBe(false);
    expect(isMapPlacesSnapshot({ ...valid, providerCounts: { tour: 0, kakao: 1 } })).toBe(false);
  });
});

describe("public map snapshot cache", () => {
  it("separates Busan and Jeju keys and collapses concurrent generation", async () => {
    let resolveBusan!: (value: Awaited<ReturnType<typeof assembleMapPlacesSnapshot>>) => void;
    const busanPromise = new Promise<Awaited<ReturnType<typeof assembleMapPlacesSnapshot>>>((resolve) => {
      resolveBusan = resolve;
    });
    const assemble = vi.fn(async (input: ReturnType<typeof request>) => {
      if (input.region === "busan") return busanPromise;
      return assembleMapPlacesSnapshot(input, {
        query: vi.fn(async () => page("jeju", [place("tour", "jeju", "9")])),
      });
    });
    const load = createMapPlacesSnapshotLoader({ assemble });

    const first = load(request("busan"));
    const second = load(request("busan"));
    const jeju = load(request("jeju"));
    resolveBusan(await assembleMapPlacesSnapshot(request("busan"), {
      query: vi.fn(async () => page("busan", [place("kakao", "busan", "1")])),
    }));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    await expect(jeju).resolves.toMatchObject({ region: "jeju" });
    expect(assemble).toHaveBeenCalledTimes(2);
    await load(request("busan"));
    await load(request("jeju"));
    expect(assemble).toHaveBeenCalledTimes(2);
  });

  it("returns the last valid value as stale when refresh fails", async () => {
    let nowMs = Date.parse("2026-08-24T00:00:00.000Z");
    const fresh = await assembleMapPlacesSnapshot(request("busan"), {
      query: vi.fn(async () => page("busan", [place("kakao", "busan", "1")])),
      now: () => new Date(nowMs),
    });
    const assemble = vi.fn()
      .mockResolvedValueOnce(fresh)
      .mockRejectedValueOnce(new Error("temporary Supabase failure"));
    const load = createMapPlacesSnapshotLoader({
      assemble,
      now: () => nowMs,
      freshMs: 60_000,
      staleIfErrorMs: 300_000,
    });

    const first = await load(request("busan"));
    nowMs += 61_000;
    const stale = await load(request("busan"));
    const throttledStale = await load(request("busan"));

    expect(first.freshness.status).toBe("fresh");
    expect(stale).toMatchObject({
      dataVersion: first.dataVersion,
      generatedAt: first.generatedAt,
      freshness: { status: "stale" },
    });
    expect(throttledStale.freshness.status).toBe("stale");
    expect(assemble).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/map/places/snapshot", () => {
  it("returns explicit public CDN headers for a valid versioned request", async () => {
    const snapshot = await assembleMapPlacesSnapshot(request("busan"), {
      query: vi.fn(async () => page("busan", [place("kakao", "busan", "1")])),
    });
    const loadSnapshot = vi.fn(async () => snapshot);
    const response = await createMapPlacesSnapshotHandler({ loadSnapshot })(
      new Request("http://localhost/api/map/places/snapshot?version=1&region=busan&scope=default"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    expect(response.headers.get("cdn-cache-control")).toContain("stale-while-revalidate");
    expect(response.headers.get("vercel-cdn-cache-control")).toContain("max-age=300");
    await expect(response.json()).resolves.toMatchObject({ data: { contractVersion: 1, region: "busan" } });
    expect(loadSnapshot).toHaveBeenCalledWith(request("busan"));
  });

  it.each([
    "region=busan&scope=default",
    "version=2&region=busan&scope=default",
    "version=1&region=unknown&scope=default",
    "version=1&region=busan&scope=optional",
    "version=1&region=busan&scope=default&district=110",
    "version=1&version=1&region=busan&scope=default",
  ])("rejects an invalid snapshot query without loading: %s", async (parameters) => {
    const loadSnapshot = vi.fn();
    const response = await createMapPlacesSnapshotHandler({ loadSnapshot })(
      new Request(`http://localhost/api/map/places/snapshot?${parameters}`),
    );
    expect(response.status).toBe(400);
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
