import { describe, expect, it, vi } from "vitest";
import { createTourHomepageHandler } from "@/app/api/tour/homepage/route";
import { TourProviderError } from "@/lib/tour-api/errors";
import type { TourPlaceService } from "@/lib/tour-api/service";
import type { TourHomepageSnapshot } from "@/types/homepage";

const NOW = "2026-08-14T04:05:06.000Z";

const service = {
  listPlaces: vi.fn(),
  getPlaceDetail: vi.fn(),
} as unknown as TourPlaceService;

const snapshot: TourHomepageSnapshot = {
  catalog: {
    places: [],
    page: 1,
    pageSize: 0,
    totalCount: 0,
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt: NOW,
    },
  },
  featured: {
    state: "empty",
    places: [],
    assessedCount: 0,
    failedCount: 0,
  },
};

const allow = () => ({
  allowed: true,
  limit: 30,
  remaining: 29,
  retryAfterSeconds: 60,
});

describe("GET /api/tour/homepage", () => {
  it("returns the injected snapshot with no-store and forwards the clock", async () => {
    const now = () => new Date(NOW);
    const loadSnapshot = vi.fn(async () => snapshot);
    const response = await createTourHomepageHandler({
      service,
      now,
      rateLimit: allow,
      loadSnapshot,
    })(new Request("http://localhost/api/tour/homepage"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(loadSnapshot).toHaveBeenCalledWith({ service, now });
    expect(await response.json()).toMatchObject({ ok: true, data: snapshot });
  });

  it("rejects every query parameter without loading provider data", async () => {
    const loadSnapshot = vi.fn(async () => snapshot);
    const response = await createTourHomepageHandler({
      service,
      rateLimit: allow,
      loadSnapshot,
    })(new Request("http://localhost/api/tour/homepage?regionCode=26"));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", retryable: false },
    });
  });

  it("uses the injected rate limiter and returns retry headers", async () => {
    const rateLimit = vi.fn(() => ({
      allowed: false,
      limit: 30,
      remaining: 0,
      retryAfterSeconds: 17,
    }));
    const loadSnapshot = vi.fn(async () => snapshot);
    const response = await createTourHomepageHandler({
      service,
      rateLimit,
      loadSnapshot,
    })(
      new Request("http://localhost/api/tour/homepage", {
        headers: { "x-forwarded-for": "203.0.113.7" },
      }),
    );

    expect(rateLimit).toHaveBeenCalledWith(
      "tour-homepage",
      "203.0.113.7",
      { limit: 30, windowMs: 60_000 },
    );
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("17");
  });

  it("preserves provider error mapping and adds no-store", async () => {
    const response = await createTourHomepageHandler({
      service,
      rateLimit: allow,
      loadSnapshot: async () => {
        throw new TourProviderError("TIMEOUT", "upstream timed out", {
          retryable: true,
        });
      },
    })(new Request("http://localhost/api/tour/homepage"));

    expect(response.status).toBe(504);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "UPSTREAM_TIMEOUT", retryable: true },
    });
  });
});
