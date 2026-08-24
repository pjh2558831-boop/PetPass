import { describe, expect, it, vi } from "vitest";
import { createHomepageCompletionHandler } from "@/app/api/homepage/places/completion/route";
import type { HomepageCompletionSnapshot } from "@/types/homepage-completion";
import type { HomepageDatasetContinuationV1 } from "@/types/homepage-completion";

const generationId = "g1-0123456789abcdef";
const continuation = [{
  datasetId: "default-kakao",
  layer: "kakao",
  provider: "kakao",
  kind: "pet_travel_candidate",
  loadedItemCount: 200,
  expectedTotalCount: 200,
  nextCursor: 200,
  complete: true,
  generationId,
}] satisfies HomepageDatasetContinuationV1[];
const snapshot: HomepageCompletionSnapshot = {
  contractVersion: 1,
  region: "busan",
  scope: "default",
  dataset: "default-map",
  baseDataVersion: "v1-0123456789abcdef",
  generationId,
  generatedAt: "2026-08-24T00:00:00.000Z",
  returnedItemCount: 0,
  expectedTotalCount: 200,
  complete: true,
  freshness: { status: "fresh" },
  continuations: continuation,
  categoryCounts: [],
  markers: [],
};

function url() {
  return `http://localhost/api/homepage/places/completion?${new URLSearchParams({
    version: "1",
    region: "busan",
    scope: "default",
    dataset: "default-map",
    base: snapshot.baseDataVersion,
    generation: generationId,
    continuations: JSON.stringify(continuation),
  })}`;
}

describe("homepage completion route", () => {
  it("serves a successful public completion with reviewed cache headers", async () => {
    const loadCompletion = vi.fn().mockResolvedValue(snapshot);
    const response = await createHomepageCompletionHandler({ loadCompletion })(new Request(url()));
    expect(response.status).toBe(200);
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toContain("max-age=300");
    expect(response.headers.get("Server-Timing")).toContain("serialize");
    expect(loadCompletion).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["authorization", "Bearer private"],
    ["cookie", "session=private"],
  ] as const)("rejects %s-bearing requests and makes the error uncacheable", async (name, value) => {
    const loadCompletion = vi.fn();
    const response = await createHomepageCompletionHandler({ loadCompletion })(new Request(url(), { headers: { [name]: value } }));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loadCompletion).not.toHaveBeenCalled();
  });
});
