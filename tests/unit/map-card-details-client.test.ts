import { afterEach, expect, it, vi } from "vitest";

function page(url: string, publicationVersion = "p1-test") {
  const params = new URL(url, "http://localhost").searchParams;
  const items = params.get("ids")!.split(",").map((id) => ({ id, address: "부산", phone: null, imageUrl: null, placeUrl: null, contentTypeId: null }));
  return { contractVersion: 1, region: params.get("region"), dataset: params.get("dataset"), publicationVersion, items, page: 1, pageSize: 12, totalCount: items.length };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("reuses a recent card page across region revisits, but expires and isolates it", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const request = vi.fn(async (url: string) => Response.json({ ok: true, data: page(url) }));
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

it("shares one request while canceling subscribers independently", async () => {
  vi.resetModules();
  let finish!: (response: Response) => void;
  let transportSignal!: AbortSignal;
  let requestUrl = "";
  const fetcher = vi.fn((url: string, init: RequestInit) => {
    requestUrl = url;
    transportSignal = init.signal!;
    return new Promise<Response>((resolve) => { finish = resolve; });
  });
  vi.stubGlobal("fetch", fetcher);
  const { requestMapPlaceCardDetails: load } = await import("@/lib/map-places/card-details-client");
  const first = new AbortController();
  const second = new AbortController();
  const pending = load("busan", "core", ["tour:1"], first.signal);
  const active = load("busan", "core", ["tour:1"], second.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  first.abort();
  finish(Response.json({ ok: true, data: page(requestUrl) }));
  await rejected;
  expect(transportSignal.aborted).toBe(false);
  expect((await active).items[0].id).toBe("tour:1");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("aborts an unobserved request and allows a fresh subscriber immediately", async () => {
  vi.resetModules();
  const signals: AbortSignal[] = [];
  const fetcher = vi.fn((url: string, init: RequestInit) => {
    signals.push(init.signal!);
    if (signals.length > 1) return Promise.resolve(Response.json({ ok: true, data: page(url) }));
    return new Promise<Response>((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true }));
  });
  vi.stubGlobal("fetch", fetcher);
  const { requestMapPlaceCardDetails: load } = await import("@/lib/map-places/card-details-client");
  const controller = new AbortController();
  const pending = load("busan", "core", ["tour:1"], controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await load("busan", "core", ["tour:1"], new AbortController().signal);
  await rejected;
  expect(signals[0].aborted).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("isolates snapshot publication caches while accepting provider-scoped versions and rejecting malformed pages", async () => {
  vi.resetModules();
  let version = "p1-old";
  let malformed = false;
  const fetcher = vi.fn(async (url: string) => {
    const data = page(url, version);
    return Response.json({ ok: true, data: malformed ? { ...data, items: [{ id: "tour:1" }] } : data });
  });
  vi.stubGlobal("fetch", fetcher);
  const { requestMapPlaceCardDetails: load } = await import("@/lib/map-places/card-details-client");
  const signal = new AbortController().signal;
  await load("busan", "core", ["tour:1"], signal, "p1-old");
  expect((await load("busan", "core", ["tour:1"], signal, "p1-new")).publicationVersion).toBe("p1-old");
  version = "p1-new";
  malformed = true;
  await expect(load("busan", "core", ["tour:1"], signal, "p1-latest")).rejects.toThrow();
  malformed = false;
  expect((await load("busan", "core", ["tour:1"], signal, "p1-latest")).publicationVersion).toBe("p1-new");
  expect(fetcher).toHaveBeenCalledTimes(4);
});
