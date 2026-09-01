import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMapPlacesSnapshotBrowserClient,
  loadSnapshotWithFallback,
  requestMapPlacesSnapshot,
} from "@/lib/map-places/snapshot-client";

const seoulSnapshot = {
  contractVersion: 1,
  region: "seoul",
  scope: "default",
  dataset: "shopping",
  generatedAt: "2026-08-26T00:00:00.000Z",
  publicationVersion: "p1-0123456789abcdef",
  dataVersion: "v1-0123456789abcdef",
  totalCount: 1,
  providerCounts: { tour: 1, kakao: 0 },
  categoryCounts: { shopping: 1 },
  freshness: { status: "fresh" },
  items: [{
    id: "tour:3800001",
    regionId: "seoul",
    providerPlaceId: "3800001",
    name: "서울 공식 쇼핑 장소",
    dataset: "shopping",
    layer: "tourism",
    category: "shopping",
    districtCode: "110",
    districtName: "종로구",
    address: "서울특별시 종로구",
    coordinates: { latitude: 37.57, longitude: 126.98 },
    imageUrl: null,
    placeUrl: null,
    petAccessVerdict: "unknown",
    publicLabel: "반려동물 동반 정보 확인 필요",
    sourceLabel: "한국관광공사",
  }],
} as const;

afterEach(() => {
  delete document.documentElement.dataset.mapSnapshotRequestCount;
  delete document.documentElement.dataset.mapSnapshotRawBytes;
  delete document.documentElement.dataset.mapSnapshotCompressedBytes;
});

describe("map snapshot browser fallback", () => {
  it("uses the paged fallback only after snapshot validation fails", async () => {
    const events: string[] = [];
    const fallback = vi.fn(async () => {
      events.push("fallback");
      return ["legacy"];
    });
    const result = await loadSnapshotWithFallback({
      requestSnapshot: async () => {
        events.push("snapshot");
        throw new Error("invalid snapshot");
      },
      requestFallback: fallback,
    });

    expect(result).toEqual({ source: "fallback", items: ["legacy"] });
    expect(events).toEqual(["snapshot", "fallback"]);
  });

  it("does not activate fallback for an aborted snapshot", async () => {
    const fallback = vi.fn();
    await expect(loadSnapshotWithFallback({
      requestSnapshot: async () => { throw new DOMException("Aborted", "AbortError"); },
      requestFallback: fallback,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("accepts one validated Seoul snapshot and records browser-side measurements", async () => {
    const sourceMarker = seoulSnapshot.items[0];
    const wireMarker = {
      id: sourceMarker.id,
      name: sourceMarker.name,
      layer: sourceMarker.layer,
      category: sourceMarker.category,
      districtCode: sourceMarker.districtCode,
      coordinates: sourceMarker.coordinates,
      petAccessVerdict: sourceMarker.petAccessVerdict,
      publicLabel: sourceMarker.publicLabel,
    };
    const raw = JSON.stringify({
      ok: true,
      data: { ...seoulSnapshot, items: [wireMarker] },
    });
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(raw, {
        status: 200,
        headers: { "Content-Type": "application/json", "Content-Length": "321" },
      });
    });

    const snapshot = await requestMapPlacesSnapshot(
      "seoul",
      "shopping",
      new AbortController().signal,
      request as typeof fetch,
    );

    expect(snapshot).toMatchObject({
      region: "seoul",
      totalCount: 1,
      items: [{
        regionId: "seoul",
        providerPlaceId: "3800001",
        dataset: "shopping",
        sourceLabel: "한국관광공사",
      }],
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0]?.[0])).toContain("region=seoul");
    expect(document.documentElement.dataset).toMatchObject({
      mapSnapshotRequestCount: "1",
      mapSnapshotRawBytes: String(new TextEncoder().encode(raw).byteLength),
      mapSnapshotCompressedBytes: "321",
    });
  });

  it("rejects a structurally valid cross-provider Seoul snapshot", async () => {
    const kakaoSnapshot = {
      ...seoulSnapshot,
      providerCounts: { tour: 0, kakao: 1 },
      items: [{
        ...seoulSnapshot.items[0],
        id: "kakao:3800001",
        layer: "kakao",
        sourceLabel: "카카오 검색 후보",
        placeUrl: "https://place.map.kakao.com/3800001",
      }],
    };
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({ ok: true, data: kakaoSnapshot });
    });

    await expect(requestMapPlacesSnapshot(
      "seoul",
      "shopping",
      new AbortController().signal,
      request as typeof fetch,
    )).rejects.toThrow(/스냅샷|지역 계약/iu);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("collapses concurrent identical requests and serves a warm off/on selection from memory", async () => {
    let resolveResponse!: (response: Response) => void;
    const request = vi.fn()
      .mockImplementationOnce(async () => new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }))
      .mockResolvedValueOnce(Response.json({ ok: true, data: seoulSnapshot }));
    const client = createMapPlacesSnapshotBrowserClient({ request: request as typeof fetch });
    const first = client.load("seoul", "shopping", new AbortController().signal);
    const second = client.load("seoul", "shopping", new AbortController().signal);

    expect(request).toHaveBeenCalledTimes(1);
    resolveResponse(Response.json({ ok: true, data: seoulSnapshot }));
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    await expect(client.load("seoul", "shopping", new AbortController().signal))
      .resolves.toMatchObject({ dataset: "shopping" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reconstructs a conditional Kakao marker from the compact snapshot payload", async () => {
    const wireMarker = {
      id: "kakao:condition-1",
      name: "조건부 동반 카페",
      layer: "kakao",
      category: "cafe",
      districtCode: "500",
      coordinates: { latitude: 35.1456, longitude: 129.1131 },
      petAccessVerdict: "conditional",
      petConditions: "테라스만 가능 · 이동가방 필수",
      verificationRequired: true,
      publicLabel: "동반 조건 확인 필요",
    };
    const request = vi.fn(async () => Response.json({
      ok: true,
      data: {
        ...seoulSnapshot,
        region: "busan",
        dataset: "core",
        providerCounts: { tour: 0, kakao: 1 },
        categoryCounts: { cafe: 1 },
        items: [wireMarker],
      },
    }));

    const snapshot = await requestMapPlacesSnapshot(
      "busan",
      "core",
      new AbortController().signal,
      request as typeof fetch,
    );

    expect(snapshot.items[0]).toMatchObject({
      id: "kakao:condition-1",
      providerPlaceId: "condition-1",
      petConditions: "테라스만 가능 · 이동가방 필수",
      verificationRequired: true,
    });
  });

  it("revalidates a regional dataset after the bounded browser cache expires", async () => {
    let now = 1_000;
    const request = vi.fn(async () => Response.json({ ok: true, data: seoulSnapshot }));
    const client = createMapPlacesSnapshotBrowserClient({
      request: request as typeof fetch,
      now: () => now,
      freshMs: 10,
    });
    const signal = new AbortController().signal;

    await client.load("seoul", "shopping", signal);
    now += 10;
    await client.load("seoul", "shopping", signal);
    now += 1;
    await client.load("seoul", "shopping", signal);

    expect(request).toHaveBeenCalledTimes(2);
  });

  it("isolates warm snapshot entries by both region and dataset", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const region = url.searchParams.get("region") as "incheon" | "gyeonggi";
      const dataset = url.searchParams.get("dataset") as "core" | "shopping";
      const incheon = region === "incheon";
      const category = dataset === "shopping" ? "shopping" : "attraction";
      return Response.json({
        ok: true,
        data: {
          ...seoulSnapshot,
          region,
          dataset,
          categoryCounts: { [category]: 1 },
          items: [{
            ...seoulSnapshot.items[0],
            id: `tour:${region}-${dataset}`,
            regionId: region,
            providerPlaceId: `${region}-${dataset}`,
            category,
            placeUrl: dataset === "shopping"
              ? null
              : `/places/${region}-${dataset}?region=${region}`,
            districtCode: incheon ? "185" : "110",
            districtName: incheon ? "연수구" : "수원시",
            address: incheon ? "인천광역시 연수구" : "경기도 수원시",
            coordinates: incheon
              ? { latitude: 37.41, longitude: 126.68 }
              : { latitude: 37.26, longitude: 127.03 },
          }],
        },
      });
    });
    const client = createMapPlacesSnapshotBrowserClient({ request: request as typeof fetch });
    const signal = new AbortController().signal;

    await client.load("incheon", "core", signal);
    await client.load("incheon", "shopping", signal);
    await client.load("gyeonggi", "core", signal);
    await client.load("incheon", "core", signal);

    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.map(([input]) => String(input))).toEqual([
      expect.stringMatching(/region=incheon.*dataset=core/u),
      expect.stringMatching(/region=incheon.*dataset=shopping/u),
      expect.stringMatching(/region=gyeonggi.*dataset=core/u),
    ]);
  });

  it("evicts the least-recently-used completed snapshot beyond the regional cache bound", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const region = url.searchParams.get("region") as "seoul" | "incheon" | "gyeonggi";
      return Response.json({
        ok: true,
        data: {
          ...seoulSnapshot,
          region,
          items: [{
            ...seoulSnapshot.items[0],
            id: `tour:${region}-shopping`,
            regionId: region,
            providerPlaceId: `${region}-shopping`,
            districtCode: region === "incheon" ? "185" : region === "gyeonggi" ? "110" : "110",
            districtName: region === "incheon" ? "연수구" : region === "gyeonggi" ? "수원시" : "종로구",
            address: region === "incheon" ? "인천광역시 연수구" : region === "gyeonggi" ? "경기도 수원시" : "서울특별시 종로구",
            coordinates: region === "incheon"
              ? { latitude: 37.41, longitude: 126.68 }
              : region === "gyeonggi"
                ? { latitude: 37.26, longitude: 127.03 }
                : { latitude: 37.57, longitude: 126.98 },
          }],
        },
      });
    });
    const client = createMapPlacesSnapshotBrowserClient({
      request: request as typeof fetch,
      maxCompletedEntries: 2,
    });
    const signal = new AbortController().signal;

    await client.load("seoul", "shopping", signal);
    await client.load("incheon", "shopping", signal);
    await client.load("gyeonggi", "shopping", signal);
    await client.load("incheon", "shopping", signal);
    await client.load("seoul", "shopping", signal);

    expect(request).toHaveBeenCalledTimes(4);
  });

  it("replaces a new Shopping publication without invalidating another region", async () => {
    let now = 1_000;
    const regionalCalls = new Map<string, number>();
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const region = new URL(String(input), "http://localhost").searchParams.get("region") as "seoul" | "incheon";
      const call = (regionalCalls.get(region) ?? 0) + 1;
      regionalCalls.set(region, call);
      return Response.json({
        ok: true,
        data: {
          ...seoulSnapshot,
          region,
          publicationVersion: call === 1 ? "p1-0123456789abcdef" : "p1-fedcba9876543210",
          items: [{
            ...seoulSnapshot.items[0],
            id: `tour:${region}-shopping`,
            regionId: region,
            providerPlaceId: `${region}-shopping`,
            districtCode: region === "incheon" ? "185" : "110",
            districtName: region === "incheon" ? "연수구" : "종로구",
            address: region === "incheon" ? "인천광역시 연수구" : "서울특별시 종로구",
            coordinates: region === "incheon"
              ? { latitude: 37.41, longitude: 126.68 }
              : { latitude: 37.57, longitude: 126.98 },
          }],
        },
      });
    });
    const client = createMapPlacesSnapshotBrowserClient({
      request: request as typeof fetch,
      now: () => now,
      freshMs: 50,
    });
    const signal = new AbortController().signal;

    await client.load("seoul", "shopping", signal);
    now += 40;
    await client.load("incheon", "shopping", signal);
    now += 11;
    await expect(client.load("seoul", "shopping", signal))
      .resolves.toMatchObject({ publicationVersion: "p1-fedcba9876543210" });
    await expect(client.load("incheon", "shopping", signal))
      .resolves.toMatchObject({ publicationVersion: "p1-0123456789abcdef" });

    expect(regionalCalls).toEqual(new Map([
      ["seoul", 2],
      ["incheon", 1],
    ]));
  });

  it("aborts a region request with no subscribers and never caches its late response", async () => {
    let resolveResponse!: (response: Response) => void;
    const request = vi.fn()
      .mockImplementationOnce(async () => new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }))
      .mockResolvedValueOnce(Response.json({ ok: true, data: seoulSnapshot }));
    const client = createMapPlacesSnapshotBrowserClient({ request: request as typeof fetch });
    const controller = new AbortController();
    const pending = client.load("seoul", "shopping", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    resolveResponse(Response.json({ ok: true, data: seoulSnapshot }));
    await Promise.resolve();

    const retry = client.load("seoul", "shopping", new AbortController().signal);
    expect(request).toHaveBeenCalledTimes(2);
    await expect(retry).resolves.toMatchObject({ dataset: "shopping" });
  });

  it("does not cache malformed shopping responses", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: true, data: { ...seoulSnapshot, totalCount: 2 } }))
      .mockResolvedValueOnce(Response.json({ ok: true, data: seoulSnapshot }));
    const client = createMapPlacesSnapshotBrowserClient({ request: request as typeof fetch });

    await expect(client.load("seoul", "shopping", new AbortController().signal))
      .rejects.toThrow(/스냅샷/u);
    await expect(client.load("seoul", "shopping", new AbortController().signal))
      .resolves.toMatchObject({ totalCount: 1 });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
