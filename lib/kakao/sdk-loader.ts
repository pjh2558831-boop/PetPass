import { ConfigurationRequiredError } from "@/lib/shared/errors";
import type { KakaoMapsSdk } from "@/lib/kakao/maps";

const KAKAO_SDK_SCRIPT_ID = "kakao-maps-sdk";
const KAKAO_SDK_SELECTOR =
  'script[src*="dapi.kakao.com/v2/maps/sdk.js"]';
const REQUIRED_LIBRARIES = ["services", "clusterer"] as const;
const SDK_LOAD_TIMEOUT_MS = 15_000;

export type KakaoMapsSdkLoadErrorCode =
  | "BROWSER_ENVIRONMENT_REQUIRED"
  | "SCRIPT_REQUEST_FAILED"
  | "DOMAIN_AUTHORIZATION_FAILED"
  | "CONFLICTING_SDK_CONFIGURATION"
  | "LIBRARY_READINESS_FAILED"
  | "CLUSTERER_UNAVAILABLE";

export class KakaoMapsSdkLoadError extends Error {
  constructor(
    readonly code: KakaoMapsSdkLoadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "KakaoMapsSdkLoadError";
  }
}

let sdkLoadPromise: Promise<KakaoMapsSdk> | null = null;
let mapsLoadInvoked = false;

export function getKakaoMapJavaScriptKey(): string {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY?.trim();
  if (!key) {
    throw new ConfigurationRequiredError(
      "NEXT_PUBLIC_KAKAO_MAP_JS_KEY가 설정되지 않았습니다.",
    );
  }
  return key;
}

export function getKakaoMapsSdkUrl(key: string): string {
  return (
    "https://dapi.kakao.com/v2/maps/sdk.js" +
    `?appkey=${encodeURIComponent(key)}` +
    "&autoload=false" +
    "&libraries=services,clusterer"
  );
}

type PartialKakaoMapsSdk = Partial<KakaoMapsSdk>;
type KakaoBaseMapsSdk = PartialKakaoMapsSdk &
  Pick<KakaoMapsSdk, "Map" | "LatLng" | "Marker">;

function getMaps(): PartialKakaoMapsSdk | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window.kakao?.maps as PartialKakaoMapsSdk | undefined);
}

export function isKakaoBaseMapsReady(
  maps: PartialKakaoMapsSdk | undefined = getMaps(),
): maps is KakaoBaseMapsSdk {
  return Boolean(maps?.Map && maps.LatLng && maps.Marker);
}

export function isKakaoMapsReady(
  maps: PartialKakaoMapsSdk | undefined = getMaps(),
): maps is KakaoMapsSdk {
  return Boolean(
    isKakaoBaseMapsReady(maps) && maps.MarkerClusterer,
  );
}

export function isClustererOnlySdkFailure(error: unknown): boolean {
  return (
    error instanceof KakaoMapsSdkLoadError &&
    error.code === "CLUSTERER_UNAVAILABLE"
  );
}

export function getKakaoMapsPublicError(error: unknown): string {
  if (error instanceof ConfigurationRequiredError) return error.message;
  if (!(error instanceof KakaoMapsSdkLoadError)) {
    return "카카오 지도를 초기화하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  switch (error.code) {
    case "DOMAIN_AUTHORIZATION_FAILED":
      return "카카오 지도 JavaScript 도메인 설정을 확인해 주세요.";
    case "CONFLICTING_SDK_CONFIGURATION":
      return "카카오 지도 SDK 설정이 충돌했습니다. 페이지를 새로고침해 주세요.";
    case "SCRIPT_REQUEST_FAILED":
      return "카카오 지도 SDK를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.";
    default:
      return "카카오 지도 SDK를 완전히 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

function scriptHasCanonicalConfiguration(
  script: HTMLScriptElement,
  expectedKey: string,
): boolean {
  try {
    const url = new URL(script.src, window.location.href);
    const libraries = new Set(
      (url.searchParams.get("libraries") ?? "")
        .split(",")
        .map((library) => library.trim())
        .filter(Boolean),
    );
    return (
      url.origin === "https://dapi.kakao.com" &&
      url.pathname === "/v2/maps/sdk.js" &&
      url.searchParams.get("appkey") === expectedKey &&
      url.searchParams.get("autoload") === "false" &&
      REQUIRED_LIBRARIES.every((library) => libraries.has(library))
    );
  } catch {
    return false;
  }
}

function hasActiveMapInstance(): boolean {
  return (
    isKakaoBaseMapsReady() ||
    Boolean(document.querySelector('[data-kakao-map-initialized="true"]'))
  );
}

function readinessError(): KakaoMapsSdkLoadError {
  if (isKakaoBaseMapsReady() && !getMaps()?.MarkerClusterer) {
    return new KakaoMapsSdkLoadError(
      "CLUSTERER_UNAVAILABLE",
      "Kakao Maps base constructors are ready, but MarkerClusterer is unavailable.",
    );
  }
  return new KakaoMapsSdkLoadError(
    "LIBRARY_READINESS_FAILED",
    "Kakao Maps load callback completed without every required constructor.",
  );
}

export function loadKakaoMapsSdk(): Promise<KakaoMapsSdk> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(
      new KakaoMapsSdkLoadError(
        "BROWSER_ENVIRONMENT_REQUIRED",
        "Kakao Maps SDK can only be loaded in a browser.",
      ),
    );
  }

  if (isKakaoMapsReady()) {
    sdkLoadPromise ??= Promise.resolve(getMaps() as KakaoMapsSdk);
    return sdkLoadPromise;
  }
  if (sdkLoadPromise) return sdkLoadPromise;

  let key: string;
  try {
    key = getKakaoMapJavaScriptKey();
  } catch (error) {
    return Promise.reject(error);
  }

  const expectedUrl = getKakaoMapsSdkUrl(key);
  sdkLoadPromise = new Promise<KakaoMapsSdk>((resolve, reject) => {
    let settled = false;
    const timeoutRef: { current?: number } = {};

    const finish = (maps: KakaoMapsSdk) => {
      if (settled) return;
      settled = true;
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
      }
      resolve(maps);
    };
    const fail = (error: KakaoMapsSdkLoadError) => {
      if (settled) return;
      settled = true;
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
      }
      reject(error);
    };

    const runMapsLoad = () => {
      const maps = getMaps();
      if (isKakaoMapsReady(maps)) {
        finish(maps);
        return;
      }
      if (isKakaoBaseMapsReady(maps)) {
        fail(readinessError());
        return;
      }
      if (typeof maps?.load !== "function") {
        fail(
          new KakaoMapsSdkLoadError(
            "DOMAIN_AUTHORIZATION_FAILED",
            `Kakao Maps SDK loaded without its bootstrap API for hostname ${window.location.hostname}.`,
          ),
        );
        return;
      }
      if (mapsLoadInvoked) return;
      mapsLoadInvoked = true;
      try {
        maps.load(() => {
          const loadedMaps = getMaps();
          if (isKakaoMapsReady(loadedMaps)) finish(loadedMaps);
          else fail(readinessError());
        });
      } catch {
        fail(
          new KakaoMapsSdkLoadError(
            "LIBRARY_READINESS_FAILED",
            "Kakao Maps load callback could not be started.",
          ),
        );
      }
    };

    const scripts = Array.from(
      document.querySelectorAll<HTMLScriptElement>(KAKAO_SDK_SELECTOR),
    );
    const canonicalScripts = scripts.filter((script) =>
      scriptHasCanonicalConfiguration(script, key),
    );
    const conflictingScripts = scripts.filter(
      (script) => !canonicalScripts.includes(script),
    );

    if (conflictingScripts.length > 0) {
      if (hasActiveMapInstance()) {
        fail(
          new KakaoMapsSdkLoadError(
            "CONFLICTING_SDK_CONFIGURATION",
            "An active Kakao map uses an SDK script without every required library.",
          ),
        );
        return;
      }
      scripts.forEach((script) => script.remove());
      delete window.kakao;
      canonicalScripts.length = 0;
    }

    const script = canonicalScripts[0] ?? document.createElement("script");
    canonicalScripts.slice(1).forEach((duplicate) => duplicate.remove());

    const onLoad = () => {
      script.dataset.kakaoSdkStatus = "loaded";
      runMapsLoad();
    };
    const onError = () => {
      script.dataset.kakaoSdkStatus = "failed";
      fail(
        new KakaoMapsSdkLoadError(
          "SCRIPT_REQUEST_FAILED",
          "Kakao Maps SDK script request failed.",
        ),
      );
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    timeoutRef.current = window.setTimeout(() => {
      if (isKakaoBaseMapsReady()) fail(readinessError());
      else if (script.dataset.kakaoSdkStatus === "loaded") {
        fail(
          new KakaoMapsSdkLoadError(
            "DOMAIN_AUTHORIZATION_FAILED",
            `Kakao Maps SDK did not expose its bootstrap API for hostname ${window.location.hostname}.`,
          ),
        );
      } else {
        fail(
          new KakaoMapsSdkLoadError(
            "SCRIPT_REQUEST_FAILED",
            "Kakao Maps SDK script request timed out.",
          ),
        );
      }
    }, SDK_LOAD_TIMEOUT_MS);

    if (canonicalScripts.length === 0) {
      script.id = KAKAO_SDK_SCRIPT_ID;
      script.async = true;
      script.src = expectedUrl;
      script.dataset.kakaoSdkStatus = "loading";
      document.head.appendChild(script);
    } else if (typeof getMaps()?.load === "function") {
      runMapsLoad();
    }
  });

  const attempt = sdkLoadPromise;
  void attempt.catch((error: unknown) => {
    if (sdkLoadPromise !== attempt || !(error instanceof KakaoMapsSdkLoadError) ||
      error.code !== "SCRIPT_REQUEST_FAILED" || hasActiveMapInstance()) return;
    document.querySelectorAll<HTMLScriptElement>(KAKAO_SDK_SELECTOR).forEach((script) => script.remove());
    mapsLoadInvoked = false;
    sdkLoadPromise = null;
  });
  return attempt;
}
