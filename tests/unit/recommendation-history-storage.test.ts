import { describe, expect, it } from "vitest";
import { loadRecommendationHistory, saveRecommendationHistory } from "@/lib/storage/recommendation-history-storage";
import type { StorageLike } from "@/lib/storage/versioned-storage";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("regional recommendation exposure history", () => {
  it("survives reload and a changed request context without mixing regions", () => {
    const storage = memoryStorage();
    expect(saveRecommendationHistory("busan", {
      recentRouteSignatures: ["tour:1>tour:2"],
      recentlySelectedCandidateIds: ["tour:1", "tour:2"],
      historyContextKey: "a".repeat(64),
    }, storage)).toBe(true);
    const reloaded = loadRecommendationHistory("busan", storage)!;
    expect(saveRecommendationHistory("busan", {
      ...reloaded, historyContextKey: "b".repeat(64),
      recentRouteSignatures: [...reloaded.recentRouteSignatures, "tour:2>tour:3"],
      recentlySelectedCandidateIds: [...reloaded.recentlySelectedCandidateIds, "tour:2", "tour:3"],
    }, storage)).toBe(true);
    expect(loadRecommendationHistory("busan", storage)).toEqual({
      recentRouteSignatures: ["tour:1>tour:2", "tour:2>tour:3"],
      recentlySelectedCandidateIds: ["tour:1", "tour:2", "tour:2", "tour:3"],
      historyContextKey: "b".repeat(64),
    });
    expect(loadRecommendationHistory("seoul", storage)).toBeNull();
  });

  it("keeps only the last 12 routes and 30 exposures, preserving frequency", () => {
    const storage = memoryStorage();
    saveRecommendationHistory("busan", {
      recentRouteSignatures: Array.from({ length: 15 }, (_, i) => `route:${i}`),
      recentlySelectedCandidateIds: Array.from({ length: 35 }, (_, i) => `tour:${i % 6}`),
    }, storage);
    const loaded = loadRecommendationHistory("busan", storage)!;
    expect(loaded.recentRouteSignatures).toHaveLength(12);
    expect(loaded.recentRouteSignatures[0]).toBe("route:3");
    expect(loaded.recentlySelectedCandidateIds).toHaveLength(30);
    expect(loaded.recentlySelectedCandidateIds[0]).toBe("tour:5");
  });

  it("fails safely for corrupt, future-version or blocked storage", () => {
    const storage = memoryStorage();
    const key = "petpass:recommendation-history:busan";
    storage.setItem(key, "{broken");
    expect(loadRecommendationHistory("busan", storage)).toBeNull();
    storage.setItem(key, JSON.stringify({ version: 99, data: {} }));
    expect(loadRecommendationHistory("busan", storage)).toBeNull();
    expect(saveRecommendationHistory("busan", { recentRouteSignatures: [], recentlySelectedCandidateIds: ["x".repeat(129)] }, storage)).toBe(false);
    expect(loadRecommendationHistory("busan", null)).toBeNull();
    expect(saveRecommendationHistory("busan", { recentRouteSignatures: [], recentlySelectedCandidateIds: [] }, null)).toBe(false);
  });
});
