import { describe, expect, it, vi } from "vitest";
import { POST as directionsRoute } from "@/app/api/kakao/directions/route";
import {
  createDirectionsRequest,
  createDirectionsRequestLoader,
} from "@/lib/kakao/directions-client";
import { getDirections } from "@/lib/kakao/directions";
import type { KakaoDirectionsRequest } from "@/types/kakao";

const request: KakaoDirectionsRequest = {
  origin: { name: "출발지", x: 129.16, y: 35.15 },
  destination: { name: "도착지", x: 129.19, y: 35.16 },
  waypoints: [{ name: "경유지", x: 129.17, y: 35.155 }],
};

function successfulProviderResponse() {
  return Response.json({
    routes: [
      {
        result_code: 0,
        summary: {
          distance: 4_820,
          duration: 1_680,
          fare: { taxi: 8_000, toll: 0 },
        },
        sections: [
          {
            distance: 4_820,
            duration: 1_680,
            roads: [
              {
                vertexes: [129.16, 35.15, 129.17, 35.155, 129.19, 35.16],
              },
            ],
          },
        ],
      },
    ],
  });
}

describe("Kakao Mobility directions", () => {
  it("rejects invalid coordinates before calling the provider", async () => {
    const response = await directionsRoute(
      new Request("http://localhost/api/kakao/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...request,
          origin: { ...request.origin, y: 91 },
        }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", retryable: false },
    });
  });

  it("rejects an empty route and an identical origin and destination", async () => {
    const empty = await directionsRoute(
      new Request("http://localhost/api/kakao/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waypoints: [] }),
      }),
    );
    expect(empty.status).toBe(400);

    const identical = await directionsRoute(
      new Request("http://localhost/api/kakao/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: request.origin,
          destination: request.origin,
          waypoints: [],
        }),
      }),
    );
    expect(identical.status).toBe(400);
  });

  it("normalizes distance, duration, fares, sections and route geometry", async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("waypoints")).toContain("129.17,35.155");
      expect(init?.headers).toEqual({ Authorization: "KakaoAK test-key" });
      return successfulProviderResponse();
    }) as unknown as typeof fetch;

    const result = await getDirections(request, {
      apiKey: "test-key",
      fetchImpl,
    });
    expect(result).toEqual({
      totalDistanceMeters: 4_820,
      totalDurationSeconds: 1_680,
      taxiFareWon: 8_000,
      tollFareWon: 0,
      coordinates: [
        { longitude: 129.16, latitude: 35.15 },
        { longitude: 129.17, latitude: 35.155 },
        { longitude: 129.19, latitude: 35.16 },
      ],
      sections: [{ distanceMeters: 4_820, durationSeconds: 1_680 }],
    });
  });

  it("sanitizes upstream failures and reports timeouts", async () => {
    const failedFetch = vi.fn(
      async () => new Response("provider private details", { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(
      getDirections(request, { apiKey: "test-key", fetchImpl: failedFetch }),
    ).rejects.toThrow("500 상태로 실패했습니다");

    const timeoutFetch = vi.fn(async () => {
      throw new DOMException("timed out", "AbortError");
    }) as unknown as typeof fetch;
    await expect(
      getDirections(request, { apiKey: "test-key", fetchImpl: timeoutFetch }),
    ).rejects.toThrow("요청 시간이 초과되었습니다");
  });

  it("deduplicates concurrent client requests", async () => {
    const fetchImpl = vi.fn(async () => {
      await Promise.resolve();
      return Response.json({
        ok: true,
        data: {
          totalDistanceMeters: 100,
          totalDurationSeconds: 60,
          coordinates: [
            { latitude: 35.15, longitude: 129.16 },
            { latitude: 35.16, longitude: 129.19 },
          ],
          sections: [{ distanceMeters: 100, durationSeconds: 60 }],
        },
        requestId: "test-request",
      });
    }) as unknown as typeof fetch;
    const load = createDirectionsRequestLoader(fetchImpl);

    const [first, second] = await Promise.all([load(request), load(request)]);
    expect(first).toEqual(second);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses routes with more than five waypoints", () => {
    expect(() =>
      createDirectionsRequest(
        Array.from({ length: 8 }, (_, index) => ({
          id: String(index),
          name: `장소 ${index}`,
          address: "부산",
          coordinates: { latitude: 35.15, longitude: 129.16 + index / 100 },
        })),
      ),
    ).toThrow("최대 7곳");
  });
});
