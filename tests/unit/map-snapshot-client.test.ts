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
    const raw = JSON.stringify({ ok: true, data: seoulSnapshot });
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

    expect(snapshot).toMatchObject({ region: "seoul", totalCount: 1 });
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
