import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KakaoMapsSdk } from "@/lib/kakao/maps";

const originalMapKey = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;
const originalRestKey = process.env.KAKAO_REST_API_KEY;

function fullMaps(load: KakaoMapsSdk["load"] = (callback) => callback()) {
  return {
    load,
    Map: class FakeMap {},
    LatLng: class FakeLatLng {},
    Marker: class FakeMarker {},
    MarkerClusterer: class FakeMarkerClusterer {},
  } as unknown as KakaoMapsSdk;
}

function setMaps(maps: Partial<KakaoMapsSdk>) {
  window.kakao = {
    maps: maps as KakaoMapsSdk,
  };
}

function sdkScripts() {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[src*="dapi.kakao.com/v2/maps/sdk.js"]',
    ),
  );
}

beforeEach(() => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY = "javascript-test-key";
  process.env.KAKAO_REST_API_KEY = "rest-test-key";
  sdkScripts().forEach((script) => script.remove());
  delete window.kakao;
});

afterEach(() => {
  vi.restoreAllMocks();
  sdkScripts().forEach((script) => script.remove());
  delete window.kakao;
  if (originalMapKey === undefined) {
    delete process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;
  } else {
    process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY = originalMapKey;
  }
  if (originalRestKey === undefined) delete process.env.KAKAO_REST_API_KEY;
  else process.env.KAKAO_REST_API_KEY = originalRestKey;
});

describe("canonical Kakao Maps SDK loader", () => {
  it("builds one stable URL with autoload, services and clusterer only", async () => {
    const { getKakaoMapsSdkUrl } = await import("@/lib/kakao/sdk-loader");
    const urlString = getKakaoMapsSdkUrl("javascript-test-key");
    const url = new URL(urlString);

    expect(urlString).toContain("libraries=services,clusterer");
    expect(url.searchParams.get("autoload")).toBe("false");
    expect(url.searchParams.get("libraries")).toBe("services,clusterer");
    expect(url.searchParams.getAll("libraries")).toHaveLength(1);
    expect(url.searchParams.get("appkey")).toBe("javascript-test-key");
    expect(urlString).not.toContain("rest-test-key");
  });

  it("shares one promise and one script across concurrent consumers", async () => {
    const { loadKakaoMapsSdk } = await import("@/lib/kakao/sdk-loader");
    const first = loadKakaoMapsSdk();
    const second = loadKakaoMapsSdk();

    expect(second).toBe(first);
    expect(sdkScripts()).toHaveLength(1);

    let loadCallback: (() => void) | undefined;
    const load = vi.fn((callback: () => void) => {
      loadCallback = callback;
    });
    setMaps({ load });
    sdkScripts()[0].dispatchEvent(new Event("load"));
    expect(load).toHaveBeenCalledTimes(1);

    let settled = false;
    void first.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    const readyMaps = fullMaps(load);
    setMaps(readyMaps);
    loadCallback?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      readyMaps,
      readyMaps,
    ]);
  });

  it("survives a Strict Mode style double invocation without reloading", async () => {
    const { loadKakaoMapsSdk } = await import("@/lib/kakao/sdk-loader");
    const firstEffect = loadKakaoMapsSdk();
    const load = vi.fn<(callback: () => void) => void>();
    let callback: (() => void) | undefined;
    load.mockImplementation((next) => {
      callback = next;
    });
    setMaps({ load });
    sdkScripts()[0].dispatchEvent(new Event("load"));

    const secondEffect = loadKakaoMapsSdk();
    expect(secondEffect).toBe(firstEffect);
    expect(sdkScripts()).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(1);

    setMaps(fullMaps(load));
    callback?.();
    await expect(secondEffect).resolves.toMatchObject({
      MarkerClusterer: expect.any(Function),
    });
  });

  it("reuses an existing fully loaded SDK without inserting a script", async () => {
    const readyMaps = fullMaps();
    setMaps(readyMaps);
    const { loadKakaoMapsSdk } = await import("@/lib/kakao/sdk-loader");

    await expect(loadKakaoMapsSdk()).resolves.toBe(readyMaps);
    expect(sdkScripts()).toHaveLength(0);
  });

  it("detects an existing base SDK without MarkerClusterer and does not call load again", async () => {
    const load = vi.fn<(callback: () => void) => void>();
    const baseMaps = fullMaps(load) as unknown as Record<string, unknown>;
    delete baseMaps.MarkerClusterer;
    setMaps(baseMaps as Partial<KakaoMapsSdk>);
    const script = document.createElement("script");
    script.src =
      "https://dapi.kakao.com/v2/maps/sdk.js?appkey=javascript-test-key&autoload=false&libraries=services,clusterer";
    document.head.appendChild(script);
    const { loadKakaoMapsSdk } = await import("@/lib/kakao/sdk-loader");

    await expect(loadKakaoMapsSdk()).rejects.toMatchObject({
      code: "CLUSTERER_UNAVAILABLE",
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects a conflicting active SDK instead of creating a reload loop", async () => {
    setMaps(fullMaps() as unknown as Partial<KakaoMapsSdk>);
    delete (window.kakao?.maps as unknown as Record<string, unknown>)
      .MarkerClusterer;
    const script = document.createElement("script");
    script.src =
      "https://dapi.kakao.com/v2/maps/sdk.js?appkey=javascript-test-key&autoload=false&libraries=services";
    document.head.appendChild(script);
    const { loadKakaoMapsSdk } = await import("@/lib/kakao/sdk-loader");

    await expect(loadKakaoMapsSdk()).rejects.toMatchObject({
      code: "CONFLICTING_SDK_CONFIGURATION",
    });
    expect(sdkScripts()).toEqual([script]);
  });

  it("safely replaces an incomplete script before any map is initialized", async () => {
    const incomplete = document.createElement("script");
    incomplete.src =
      "https://dapi.kakao.com/v2/maps/sdk.js?appkey=javascript-test-key&autoload=false&libraries=services";
    document.head.appendChild(incomplete);
    const { loadKakaoMapsSdk } = await import("@/lib/kakao/sdk-loader");
    const loading = loadKakaoMapsSdk();

    expect(incomplete.isConnected).toBe(false);
    expect(sdkScripts()).toHaveLength(1);
    expect(new URL(sdkScripts()[0].src).searchParams.get("libraries")).toBe(
      "services,clusterer",
    );

    let callback: (() => void) | undefined;
    const load = vi.fn((next: () => void) => {
      callback = next;
    });
    setMaps({ load });
    sdkScripts()[0].dispatchEvent(new Event("load"));
    const readyMaps = fullMaps(load);
    setMaps(readyMaps);
    callback?.();
    await expect(loading).resolves.toBe(readyMaps);
  });

  it("distinguishes request and domain authorization failures", async () => {
    const requestModule = await import("@/lib/kakao/sdk-loader");
    const requestFailure = requestModule.loadKakaoMapsSdk();
    sdkScripts()[0].dispatchEvent(new Event("error"));
    await expect(requestFailure).rejects.toMatchObject({
      code: "SCRIPT_REQUEST_FAILED",
    });

    vi.resetModules();
    sdkScripts().forEach((script) => script.remove());
    delete window.kakao;
    const domainModule = await import("@/lib/kakao/sdk-loader");
    const domainFailure = domainModule.loadKakaoMapsSdk();
    sdkScripts()[0].dispatchEvent(new Event("load"));
    await expect(domainFailure).rejects.toMatchObject({
      code: "DOMAIN_AUTHORIZATION_FAILED",
    });
  });
});
