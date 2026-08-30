import { describe, expect, it, vi } from "vitest";
import { createHomepageCompletionHandler } from "@/app/api/homepage/places/completion/handler";
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
  it("serves a successful public completion without a Cookie header", async () => {
    const loadCompletion = vi.fn().mockResolvedValue(snapshot);
    const response = await createHomepageCompletionHandler({ loadCompletion })(new Request(url()));
    expect(response.status).toBe(200);
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toContain("max-age=300");
    expect(response.headers.get("Server-Timing")).toContain("serialize");
    expect(loadCompletion).toHaveBeenCalledTimes(1);
  });

  it("serves the same public completion with an arbitrary Cookie header", async () => {
    const loadCompletion = vi.fn().mockResolvedValue(snapshot);
    const response = await createHomepageCompletionHandler({ loadCompletion })(new Request(url(), {
      headers: { Cookie: "_vercel_sso_nonce=opaque; arbitrary=value" },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toContain("max-age=300");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(await response.json()).toMatchObject({ ok: true, data: snapshot });
    expect(loadCompletion).toHaveBeenCalledTimes(1);
  });

  it("continues to reject an Authorization header and makes the error uncacheable", async () => {
    const loadCompletion = vi.fn();
    const response = await createHomepageCompletionHandler({ loadCompletion })(new Request(url(), {
      headers: { Authorization: "Bearer private" },
    }));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loadCompletion).not.toHaveBeenCalled();
  });

  it("continues to reject Authorization when Cookie is also present", async () => {
    const loadCompletion = vi.fn();
    const response = await createHomepageCompletionHandler({ loadCompletion })(new Request(url(), {
      headers: {
        Authorization: "Bearer private",
        Cookie: "_vercel_sso_nonce=opaque",
      },
    }));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loadCompletion).not.toHaveBeenCalled();
  });

  it("validates an invalid payload normally when Cookie is present", async () => {
    const loadCompletion = vi.fn();
    const requestUrl = new URL(url());
    requestUrl.searchParams.set("dataset", "not-supported");
    const response = await createHomepageCompletionHandler({ loadCompletion })(new Request(requestUrl, {
      headers: { Cookie: "_vercel_sso_nonce=opaque" },
    }));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loadCompletion).not.toHaveBeenCalled();
  });

  it("preserves repeated-request behavior without cookie-derived security state", async () => {
    const loadCompletion = vi.fn().mockResolvedValue(snapshot);
    const handler = createHomepageCompletionHandler({ loadCompletion });
    const first = await handler(new Request(url(), { headers: { Cookie: "first=opaque" } }));
    const second = await handler(new Request(url(), { headers: { Cookie: "second=opaque" } }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(firstBody.data).toEqual(secondBody.data);
    expect(JSON.stringify([firstBody, secondBody])).not.toContain("opaque");
    expect(first.headers.get("Set-Cookie")).toBeNull();
    expect(second.headers.get("Set-Cookie")).toBeNull();
    expect(loadCompletion).toHaveBeenCalledTimes(2);
  });
});
