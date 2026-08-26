import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadSnapshotWithFallback,
  requestMapPlacesSnapshot,
} from "@/lib/map-places/snapshot-client";

const seoulSnapshot = {
  contractVersion: 1,
  region: "seoul",
  scope: "default",
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
    placeUrl: "/places/3800001?region=seoul&contentTypeId=38",
    petAccessVerdict: "unknown",
    publicLabel: "동반 정보 확인 필요",
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
      new AbortController().signal,
      request as typeof fetch,
    )).rejects.toThrow(/지역 계약/iu);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
