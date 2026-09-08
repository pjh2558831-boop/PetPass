import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("reuses a recent card page across region revisits, but expires and isolates it", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const request = vi.fn(async (url: string) => {
    const params = new URL(url, "http://localhost").searchParams;
    return Response.json({ ok: true, data: {
      region: params.get("region"), dataset: params.get("dataset"),
      items: params.get("ids")!.split(",").map((id) => ({ id, imageUrl: null })),
    } });
  });
  vi.stubGlobal("fetch", request);
  const { requestMapPlaceCardDetails: load } = await import("@/lib/map-places/card-details-client");
  const signal = new AbortController().signal;
  const first = await load("busan", "core", ["tour:1", "tour:2"], signal);
  await load("jeju", "core", ["tour:1", "tour:2"], signal);
  expect(await load("busan", "core", ["tour:2", "tour:1"], signal)).toBe(first);
  expect(request).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(60_001);
  await load("busan", "core", ["tour:1", "tour:2"], signal);
  expect(request).toHaveBeenCalledTimes(3);
  const aborted = new AbortController();
  aborted.abort();
  await expect(load("busan", "core", ["tour:1", "tour:2"], aborted.signal)).rejects.toMatchObject({ name: "AbortError" });
});
