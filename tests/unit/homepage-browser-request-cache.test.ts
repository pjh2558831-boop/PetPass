import { describe, expect, it, vi } from "vitest";
import { createHomepageBrowserRequestCache } from "@/lib/homepage/browser-request-cache";

describe("homepage browser request cache", () => {
  it("deduplicates successful region loads and retries failed responses", async () => {
    const success = { ok: true as const, data: { region: "seoul" }, requestId: "test" };
    const failure = {
      ok: false as const,
      error: { code: "UPSTREAM_ERROR" as const, message: "failed", retryable: true },
      requestId: "test",
    };
    const request = vi.fn()
      .mockResolvedValueOnce(success)
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(success);
    const cache = createHomepageBrowserRequestCache(request);

    await Promise.all([cache.load("seoul"), cache.load("seoul")]);
    await cache.load("seoul");
    expect(request).toHaveBeenCalledTimes(1);

    await cache.load("busan");
    await cache.load("busan");
    expect(request).toHaveBeenCalledTimes(3);
  });
});
