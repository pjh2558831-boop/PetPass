import { describe, expect, it } from "vitest";
import { POPULARITY_V1_CONFIG } from "@/lib/recommendation/config/popularity-v1";
import {
  calculatePopularityV1,
  type PopularityEvent,
} from "@/lib/recommendation/popularity/popularity-calculator";
import { NoDataPopularityRepository } from "@/lib/recommendation/popularity/popularity-repository";

const AS_OF = "2026-08-12T00:00:00.000Z";

function event(
  eventId: string,
  type: PopularityEvent["type"],
  ageDays = 0,
  trafficClassification: PopularityEvent["trafficClassification"] = "human",
): PopularityEvent {
  return {
    eventId,
    type,
    occurredAt: new Date(Date.parse(AS_OF) - ageDays * 86_400_000).toISOString(),
    trafficClassification,
  };
}

describe("popularity-v1", () => {
  it("pins every first-party event weight in the versioned configuration", () => {
    expect(POPULARITY_V1_CONFIG.eventWeights).toEqual({
      detail_view: 1,
      favorite: 4,
      itinerary_add: 5,
      route_start: 6,
      route_complete: 10,
      share: 3,
      itinerary_remove: -2,
    });
  });

  it("uses exact event weights and 90-day/14-day half lives", () => {
    const quality = calculatePopularityV1({
      events: [event("quality", "favorite", 90)],
      asOf: AS_OF,
    });
    const trend = calculatePopularityV1({
      events: [event("trend", "route_start", 14)],
      asOf: AS_OF,
    });
    expect(quality.qualityComponent).toBeCloseTo(1 - Math.exp(-2 / 20), 6);
    expect(quality.trendComponent).toBe(0);
    expect(trend.trendComponent).toBeCloseTo(1 - Math.exp(-3 / 10), 6);
    expect(trend.qualityComponent).toBe(0);
    expect(quality.sampleWeight).toBe(0.5);
    expect(trend.sampleWeight).toBe(0.5);
  });

  it("uses effective event count, not business weight, for sufficiency", () => {
    const twoCompletes = calculatePopularityV1({
      events: [
        event("complete-1", "route_complete"),
        event("complete-2", "route_complete"),
      ],
      asOf: AS_OF,
    });
    expect(twoCompletes.sampleWeight).toBe(2);
    expect(twoCompletes).toMatchObject({
      score: 0.5,
      status: "insufficient_data",
    });
    const twenty = calculatePopularityV1({
      events: Array.from({ length: 20 }, (_, index) =>
        event(`view-${index}`, "detail_view"),
      ),
      asOf: AS_OF,
    });
    expect(twenty.sampleWeight).toBe(20);
    expect(twenty.status).toBe("sufficient_data");
    expect(twenty.score).not.toBe(0.5);
  });

  it("lets a removal reduce quality but never makes saturation negative", () => {
    const favoriteOnly = calculatePopularityV1({
      events: Array.from({ length: 20 }, (_, index) =>
        event(`favorite-${index}`, "favorite"),
      ),
      asOf: AS_OF,
    });
    const withRemoval = calculatePopularityV1({
      events: [
        ...Array.from({ length: 20 }, (_, index) =>
          event(`favorite-${index}`, "favorite"),
        ),
        ...Array.from({ length: 20 }, (_, index) =>
          event(`remove-${index}`, "itinerary_remove"),
        ),
      ],
      asOf: AS_OF,
    });
    const removalOnly = calculatePopularityV1({
      events: Array.from({ length: 20 }, (_, index) =>
        event(`remove-${index}`, "itinerary_remove"),
      ),
      asOf: AS_OF,
    });
    expect(withRemoval.qualityComponent).toBeLessThan(
      favoriteOnly.qualityComponent,
    );
    expect(removalOnly.qualityComponent).toBe(0);
  });

  it("applies Bayesian smoothing to sufficient observations", () => {
    const result = calculatePopularityV1({
      events: Array.from({ length: 20 }, (_, index) =>
        event(`complete-${index}`, "route_complete"),
      ),
      categoryPrior: 0.25,
      asOf: AS_OF,
    });
    const quality = 1 - Math.exp(-200 / POPULARITY_V1_CONFIG.qualityScale);
    const observed = 0.7 * quality;
    const expected = (20 * observed + 20 * 0.25) / 40;
    expect(result.score).toBeCloseTo(expected, 6);
  });

  it("filters automated/test/provider/abusive traffic, future events, and replayed IDs", () => {
    const events: PopularityEvent[] = [
      event("human", "route_complete"),
      event("bot", "route_complete", 0, "automated"),
      event("test", "route_complete", 0, "test"),
      event("refresh", "route_complete", 0, "provider_refresh"),
      event("abuse", "route_complete", 0, "abusive"),
      event("human", "route_complete"),
      { ...event("future", "route_complete"), occurredAt: "2026-08-13T00:00:00.000Z" },
    ];
    const result = calculatePopularityV1({ events, asOf: AS_OF });
    expect(result.sampleWeight).toBe(1);
    expect(result.qualityComponent).toBeCloseTo(1 - Math.exp(-10 / 20), 6);
  });

  it("drops all records sharing a conflicting event ID", () => {
    const result = calculatePopularityV1({
      events: [event("collision", "favorite"), event("collision", "route_complete")],
      asOf: AS_OF,
    });
    expect(result).toMatchObject({
      score: 0.5,
      status: "insufficient_data",
      qualityComponent: 0,
      sampleWeight: 0,
    });
  });

  it("is independent of event input order", () => {
    const events = [
      event("view", "detail_view", 3),
      event("favorite", "favorite", 20),
      event("add", "itinerary_add", 7),
      event("start", "route_start", 1),
      event("complete", "route_complete", 10),
      event("share", "share", 5),
      event("remove", "itinerary_remove", 2),
    ];
    expect(calculatePopularityV1({ events, asOf: AS_OF })).toEqual(
      calculatePopularityV1({ events: [...events].reverse(), asOf: AS_OF }),
    );
  });

  it("requires explicit valid snapshot time and normalized category prior", () => {
    expect(() => calculatePopularityV1({ events: [], asOf: "bad" })).toThrow(
      RangeError,
    );
    expect(() =>
      calculatePopularityV1({ events: [], asOf: AS_OF, categoryPrior: 1.1 }),
    ).toThrow(RangeError);
  });

  it("provides a deterministic neutral batch repository without N+1 reads", async () => {
    const repository = new NoDataPopularityRepository();
    const snapshot = await repository.getPopularitySnapshot({
      contentIds: ["b", "a", "b"],
      categoriesByContentId: { a: "food", b: "attraction" },
      asOf: AS_OF,
    });
    expect([...snapshot.keys()]).toEqual(["a", "b"]);
    expect([...snapshot.values()]).toEqual([
      {
        score: 0.5,
        status: "insufficient_data",
        qualityComponent: 0,
        trendComponent: 0,
        sampleWeight: 0,
        version: "popularity-v1",
      },
      {
        score: 0.5,
        status: "insufficient_data",
        qualityComponent: 0,
        trendComponent: 0,
        sampleWeight: 0,
        version: "popularity-v1",
      },
    ]);
  });
});
