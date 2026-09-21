import { describe, expect, it, vi } from "vitest";
import { createMapPlacesSnapshotHandler } from "@/app/api/map/places/snapshot/handler";
import {
  assembleMapPlacesSnapshot,
  createMapPlacesSnapshotLoader,
  lightweightMapPlacesSnapshot,
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
  const contentTypeId = category === "shopping"
    ? "38"
    : category === "accommodation" ? "32" : category === "food" ? "39" : "12";
  return {
    id: `${provider}:${id}`,
    provider,
    providerPlaceId: id,
    name: `${region}-${provider}-${id}`,
    kind: isTour ? "tourism_place" : "pet_travel_candidate",
    category,
    district: {
      code: "110",
      name: region === "jeju" ? "제주시" : region === "seoul" ? "종로구" : "중구",
    },
    address: region === "jeju"
      ? "제주특별자치도 제주시"
      : region === "seoul" ? "서울특별시 종로구" : "부산광역시 중구",
    coordinates: region === "jeju"
      ? { latitude: 33.49, longitude: 126.53 }
      : region === "seoul"
        ? { latitude: 37.57, longitude: 126.98 }
        : { latitude: 35.1, longitude: 129.03 },
    phone: "051-000-0000",
    imageUrl: isTour ? "https://example.com/official.jpg" : null,
    contentTypeId: isTour ? contentTypeId : null,
    placeUrl: isTour && category !== "shopping"
      ? `/places/${id}?region=${region}&contentTypeId=${contentTypeId}`
      : isTour ? null : `https://place.map.kakao.com/${id}`,
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
    region: {
      id: region,
      displayName: region === "jeju" ? "제주" : region === "seoul" ? "서울" : "부산",
    },
    items,
    page: 1,
    pageSize: 200,
    totalCount,
    hasNext,
    nextCursor,
  };
}

const request = (
  region: RegionId,
  dataset: "core" | "shopping" = "core",
) => ({ version: 1 as const, region, scope: "default" as const, dataset });

describe("public map snapshot assembly", () => {
  it("retains negative and unknown verdicts in the compact marker wire DTO", async () => {
    const rows = [
      { ...place("tour", "busan", "7000"), petAccessVerdict: "not_allowed" as const },
      { ...place("kakao", "busan", "9101"), petAccessVerdict: "unknown" as const },
    ];
    const snapshot = await assembleMapPlacesSnapshot(request("busan"), { query: async () => page("busan", rows, 2) });
    const wire = lightweightMapPlacesSnapshot(snapshot);
    expect(wire.items.map(item => item.petAccessVerdict)).toEqual(["not_allowed", "unknown"]);
    expect(wire.items[0]).not.toHaveProperty("pet_evidence");
  });
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
      dataset: "core",
      publicationVersion: expect.stringMatching(/^p1-[a-f0-9]{16}$/u),
      totalCount: 2,
      providerCounts: { tour: 1, kakao: 1 },
      categoryCounts: { attraction: 1, cafe: 1 },
      freshness: { status: "fresh" },
      items: [
        { regionId: "busan", dataset: "core", layer: "kakao", category: "cafe", petAccessVerdict: "unknown" },
        { regionId: "busan", dataset: "core", layer: "tourism", category: "attraction", petAccessVerdict: "conditional" },
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
    expect(isMapPlacesSnapshot({ ...valid, providerCounts: { ...valid.providerCounts, hidden: 0 } })).toBe(false);
    expect(isMapPlacesSnapshot({ ...valid, categoryCounts: { ...valid.categoryCounts, hidden: 0 } })).toBe(false);
    expect(isMapPlacesSnapshot({
      ...valid,
      items: [{ ...valid.items[0], id: "tour:not-the-provider-id" }],
    })).toBe(false);
  });

  it("assembles every Seoul shopping record on demand without a page cap", async () => {
    const totalCount = 3_090;
    const query = vi.fn(async ({ page: pageNumber }: { page: number }) => {
      const start = (pageNumber - 1) * 200;
      const count = Math.min(200, totalCount - start);
      const items = Array.from({ length: count }, (_, index) =>
        place("tour", "seoul", String(start + index + 1), "shopping"));
      return page(
        "seoul",
        items,
        totalCount,
        start + count < totalCount,
        start + count < totalCount ? start + count : null,
      );
    });

    const queryShopping = vi.fn(async () => page(
      "seoul",
      Array.from({ length: totalCount }, (_, index) =>
        place("tour", "seoul", String(index + 1), "shopping")),
      totalCount,
    ));
    const snapshot = await assembleMapPlacesSnapshot(request("seoul", "shopping"), {
      query,
      queryShopping,
    });

    expect(query).not.toHaveBeenCalled();
    expect(queryShopping).toHaveBeenCalledTimes(1);
    expect(queryShopping).toHaveBeenCalledWith(expect.objectContaining({
      regionId: "seoul",
      providers: ["tour"],
      kinds: ["tourism_place"],
      categories: ["shopping"],
      dataset: "shopping",
    }));
    expect(snapshot.totalCount).toBe(totalCount);
    expect(snapshot.providerCounts).toEqual({ tour: totalCount, kakao: 0 });
    expect(snapshot.categoryCounts).toEqual({ shopping: totalCount });
    expect(snapshot.items.at(-1)).toMatchObject({
      regionId: "seoul",
      layer: "tourism",
      category: "shopping",
      dataset: "shopping",
      placeUrl: null,
    });
  });

  it("assembles the audited 76-record Seoul core snapshot without shopping", async () => {
    const items = [
      ...Array.from({ length: 56 }, (_, index) =>
        place("tour", "seoul", String(index + 1), "attraction")),
      ...Array.from({ length: 14 }, (_, index) =>
        place("tour", "seoul", String(index + 57), "accommodation")),
      ...Array.from({ length: 6 }, (_, index) =>
        place("tour", "seoul", String(index + 71), "food")),
    ];
    const query = vi.fn(async () => page("seoul", items, items.length, false, null));

    const snapshot = await assembleMapPlacesSnapshot(request("seoul"), { query });

    expect(query).toHaveBeenCalledTimes(1);
    expect(snapshot).toMatchObject({
      region: "seoul",
      dataset: "core",
      totalCount: 76,
      providerCounts: { tour: 76, kakao: 0 },
      categoryCounts: { attraction: 56, accommodation: 14, food: 6 },
    });
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      dataset: "core",
      categories: [
        "attraction", "park_walk", "leisure", "camping", "food", "cafe", "accommodation", "other",
      ],
    }));
    expect(snapshot.items.some(({ category }) => category === "shopping")).toBe(false);
  });

  it("rejects cursor reuse before requesting another page", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(page("seoul", [place("tour", "seoul", "1")], 2, true, 1))
      .mockResolvedValueOnce(page("seoul", [place("tour", "seoul", "2")], 2, true, 1));

    await expect(assembleMapPlacesSnapshot(request("seoul"), { query }))
      .rejects.toThrow(/cursor/iu);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects a Seoul KTO category that conflicts with its content type", async () => {
    const mismatched = {
      ...place("tour", "seoul", "38", "shopping"),
      contentTypeId: "12",
      placeUrl: null,
    } satisfies PublicMapPlaceDTO;

    await expect(assembleMapPlacesSnapshot(request("seoul"), {
      query: vi.fn(async () => page("seoul", [mismatched])),
    })).rejects.toThrow(/region/iu);
  });
});

describe("public map snapshot cache", () => {
  it("separates Busan, Jeju, and Seoul keys and collapses concurrent generation", async () => {
    let resolveBusan!: (value: Awaited<ReturnType<typeof assembleMapPlacesSnapshot>>) => void;
    const busanPromise = new Promise<Awaited<ReturnType<typeof assembleMapPlacesSnapshot>>>((resolve) => {
      resolveBusan = resolve;
    });
    const assemble = vi.fn(async (input: ReturnType<typeof request>) => {
      if (input.region === "busan") return busanPromise;
      return assembleMapPlacesSnapshot(input, {
        query: vi.fn(async () => page(input.region, [place("tour", input.region, "9")])),
      });
    });
    const resolvePublicationVersion = vi.fn(async (input: ReturnType<typeof request>) =>
      `p1-${input.region === "busan" ? "1" : input.region === "jeju" ? "2" : "3"}`.padEnd(19, "0") as `p1-${string}`);
    const load = createMapPlacesSnapshotLoader({ assemble, resolvePublicationVersion });

    const first = load(request("busan"));
    const second = load(request("busan"));
    const jeju = load(request("jeju"));
    const seoul = load(request("seoul"));
    resolveBusan(await assembleMapPlacesSnapshot(request("busan"), {
      query: vi.fn(async () => page("busan", [place("kakao", "busan", "1")])),
    }));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    await expect(jeju).resolves.toMatchObject({ region: "jeju" });
    await expect(seoul).resolves.toMatchObject({ region: "seoul" });
    expect(assemble).toHaveBeenCalledTimes(3);
    await load(request("busan"));
    await load(request("jeju"));
    await load(request("seoul"));
    expect(assemble).toHaveBeenCalledTimes(3);
    expect(resolvePublicationVersion).toHaveBeenCalledTimes(6);
  });

  it("carries a Kakao condition in the existing compact snapshot without a detail request", async () => {
    const conditional = {
      ...place("kakao", "busan", "condition-1", "cafe"),
      petAccessVerdict: "conditional" as const,
      petConditions: "테라스만 가능 · 이동가방 필수",
      verificationRequired: true,
    };
    const query = vi.fn(async () => page("busan", [conditional]));

    const snapshot = await assembleMapPlacesSnapshot(request("busan"), { query });
    const wire = lightweightMapPlacesSnapshot(snapshot);

    expect(query).toHaveBeenCalledTimes(1);
    expect(snapshot.items[0]).toMatchObject({
      petAccessVerdict: "conditional",
      petConditions: "테라스만 가능 · 이동가방 필수",
      verificationRequired: true,
    });
    expect(wire.items[0]).toMatchObject({
      petConditions: "테라스만 가능 · 이동가방 필수",
      verificationRequired: true,
    });
  });

  it("isolates cache entries by publication version and replaces only the changed regional dataset", async () => {
    let publicationVersion: `p1-${string}` = "p1-1111111111111111";
    const resolvePublicationVersion = vi.fn(async () => publicationVersion);
    const assemble = vi.fn(async (input: ReturnType<typeof request>, version: `p1-${string}`) =>
      assembleMapPlacesSnapshot(input, {
        publicationVersion: version,
        query: vi.fn(async () => page(input.region, [place("tour", input.region, version.slice(-1))])),
      }));
    const load = createMapPlacesSnapshotLoader({ assemble, resolvePublicationVersion });

    const first = await load(request("seoul"));
    await load(request("seoul"));
    publicationVersion = "p1-2222222222222222";
    const second = await load(request("seoul"));

    expect(first.publicationVersion).toBe("p1-1111111111111111");
    expect(second.publicationVersion).toBe("p1-2222222222222222");
    expect(assemble).toHaveBeenCalledTimes(2);
  });

  it("keeps the last valid publication as stale when a new publication cannot assemble", async () => {
    let publicationVersion: `p1-${string}` = "p1-1111111111111111";
    const fresh = await assembleMapPlacesSnapshot(request("seoul"), {
      publicationVersion,
      query: vi.fn(async () => page("seoul", [place("tour", "seoul", "71")])),
    });
    const assemble = vi.fn()
      .mockResolvedValueOnce(fresh)
      .mockRejectedValueOnce(new Error("temporary Supabase failure"));
    const load = createMapPlacesSnapshotLoader({
      assemble,
      resolvePublicationVersion: vi.fn(async () => publicationVersion),
      staleIfErrorMs: 300_000,
    });

    await load(request("seoul"));
    publicationVersion = "p1-2222222222222222";
    const stale = await load(request("seoul"));

    expect(stale).toMatchObject({
      publicationVersion: "p1-1111111111111111",
      dataVersion: fresh.dataVersion,
      freshness: { status: "stale" },
    });
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
      resolvePublicationVersion: vi.fn(async () => "p1-1111111111111111" as const),
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
      new Request("http://localhost/api/map/places/snapshot?version=1&region=busan&scope=default&dataset=core"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    expect(response.headers.get("cdn-cache-control")).toContain("stale-while-revalidate");
    expect(response.headers.get("vercel-cdn-cache-control")).toContain("max-age=300");
    expect(response.headers.get("vercel-cdn-cache-control")).toContain("stale-while-revalidate=86400");
    expect(response.headers.get("etag")).toBe(`"${snapshot.dataVersion}"`);
    const body = await response.json() as { data: { items: Record<string, unknown>[] } };
    expect(body).toMatchObject({ data: { contractVersion: 1, region: "busan" } });
    expect(body.data.items[0]).not.toHaveProperty("address");
    expect(body.data.items[0]).not.toHaveProperty("districtName");
    expect(body.data.items[0]).not.toHaveProperty("imageUrl");
    expect(body.data.items[0]).not.toHaveProperty("placeUrl");
    expect(loadSnapshot).toHaveBeenCalledWith(request("busan"));

    const notModified = await createMapPlacesSnapshotHandler({ loadSnapshot })(
      new Request("http://localhost/api/map/places/snapshot?version=1&region=busan&scope=default&dataset=core", {
        headers: { "If-None-Match": `"${snapshot.dataVersion}"` },
      }),
    );
    expect(notModified.status).toBe(304);
    expect(await notModified.text()).toBe("");
  });

  it("keeps stale fallback freshness distinct from a cached fresh serialization", async () => {
    const snapshot = await assembleMapPlacesSnapshot(request("busan"), {
      query: vi.fn(async () => page("busan", [place("tour", "busan", "92")])),
    });
    const staleSnapshot = {
      ...snapshot,
      freshness: { status: "stale" as const, staleAt: "2026-08-28T12:00:00.000Z" },
    };
    const loadSnapshot = vi.fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(staleSnapshot);
    const handler = createMapPlacesSnapshotHandler({ loadSnapshot });
    const url = "http://localhost/api/map/places/snapshot?version=1&region=busan&scope=default&dataset=core";

    const freshBody = await (await handler(new Request(url))).json() as {
      data: { freshness: { status: string } };
    };
    const staleBody = await (await handler(new Request(url))).json() as {
      data: { freshness: { status: string; staleAt?: string } };
    };

    expect(freshBody.data.freshness.status).toBe("fresh");
    expect(staleBody.data.freshness).toEqual(staleSnapshot.freshness);
  });

  it("returns no-store when the loader returns a malformed count contract", async () => {
    const snapshot = await assembleMapPlacesSnapshot(request("seoul"), {
      query: vi.fn(async () => page("seoul", [place("tour", "seoul", "1")])),
    });
    const response = await createMapPlacesSnapshotHandler({
      loadSnapshot: vi.fn(async () => ({ ...snapshot, totalCount: 2 })),
    })(new Request("http://localhost/api/map/places/snapshot?version=1&region=seoul&scope=default&dataset=core"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    "region=busan&scope=default",
    "version=1&region=busan&scope=default",
    "version=2&region=busan&scope=default",
    "version=1&region=unknown&scope=default&dataset=core",
    "version=1&region=busan&scope=optional&dataset=core",
    "version=1&region=busan&scope=default&dataset=shopping",
    "version=1&region=busan&scope=default&dataset=core&district=110",
    "version=1&version=1&region=busan&scope=default&dataset=core",
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
