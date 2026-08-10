import { existsSync } from "node:fs";
import { getDirections } from "@/lib/kakao/directions";
import { searchKakaoPlacePage } from "@/lib/kakao/local";
import { parseKakaoPlaceUrl } from "@/lib/kakao/place-url";

const MAX_PROVIDER_CALLS = 3;
const BUSAN_CENTER = { latitude: 35.1796, longitude: 129.0756 } as const;

interface KakaoPlaceUrlShapeCounts {
  values: number;
  http: number;
  https: number;
  otherScheme: number;
  exactHost: number;
  numericPath: number;
  port: number;
  credentials: number;
  query: number;
  fragment: number;
  officialExactForm: number;
  accepted: number;
  normalized: number;
  rejected: number;
  malformed: number;
}

function emptyPlaceUrlShapeCounts(): KakaoPlaceUrlShapeCounts {
  return {
    values: 0,
    http: 0,
    https: 0,
    otherScheme: 0,
    exactHost: 0,
    numericPath: 0,
    port: 0,
    credentials: 0,
    query: 0,
    fragment: 0,
    officialExactForm: 0,
    accepted: 0,
    normalized: 0,
    rejected: 0,
    malformed: 0,
  };
}

function recordPlaceUrlShape(
  counts: KakaoPlaceUrlShapeCounts,
  value: unknown,
): void {
  if (typeof value !== "string" || value.length === 0) {
    counts.malformed += 1;
    return;
  }
  counts.values += 1;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    counts.malformed += 1;
    counts.rejected += 1;
    return;
  }

  if (url.protocol === "http:") counts.http += 1;
  else if (url.protocol === "https:") counts.https += 1;
  else counts.otherScheme += 1;
  if (url.hostname === "place.map.kakao.com") counts.exactHost += 1;
  if (/^\/\d+$/u.test(url.pathname)) counts.numericPath += 1;

  const authority = value.includes("://")
    ? value.slice(value.indexOf("://") + 3).split(/[/?#]/u, 1)[0]
    : "";
  const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1);
  if (/:[0-9]+$/u.test(hostAndPort)) counts.port += 1;
  if (url.username !== "" || url.password !== "") counts.credentials += 1;
  if (url.search !== "") counts.query += 1;
  if (url.hash !== "") counts.fragment += 1;
  if (/^http:\/\/place\.map\.kakao\.com\/\d+$/u.test(value)) {
    counts.officialExactForm += 1;
  }

  const canonical = parseKakaoPlaceUrl(value);
  if (canonical) {
    counts.accepted += 1;
    if (canonical !== value) counts.normalized += 1;
  } else {
    counts.rejected += 1;
  }
}

if (!process.env.KAKAO_REST_API_KEY && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main() {
  if (process.env.CI) throw new Error("LIVE_VERIFICATION_DISABLED_IN_CI");
  if (!process.env.KAKAO_REST_API_KEY) {
    throw new Error("CONFIGURATION_REQUIRED");
  }

  let providerCalls = 0;
  const placeUrlShapes = emptyPlaceUrlShapeCounts();
  const boundedFetch: typeof fetch = async (input, init) => {
    if (providerCalls >= MAX_PROVIDER_CALLS) {
      throw new Error("PROVIDER_CALL_LIMIT_REACHED");
    }
    providerCalls += 1;
    const response = await fetch(input, init);
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const parsedRequestUrl = new URL(requestUrl);
    if (
      parsedRequestUrl.hostname === "dapi.kakao.com" &&
      parsedRequestUrl.pathname === "/v2/local/search/keyword.json"
    ) {
      const body = (await response.clone().json()) as { documents?: unknown[] };
      for (const document of body.documents ?? []) {
        recordPlaceUrlShape(
          placeUrlShapes,
          document && typeof document === "object"
            ? (document as { place_url?: unknown }).place_url
            : undefined,
        );
      }
    }
    return response;
  };

  const search = await searchKakaoPlacePage(
    {
      query: "부산시민공원",
      page: 1,
      size: 5,
      center: { ...BUSAN_CENTER, radiusMeters: 20_000 },
    },
    { fetchImpl: boundedFetch },
  );
  if (search.results.length === 0) throw new Error("EMPTY_LIVE_SEARCH");
  const destination = search.results[0]!;
  const canonicalPlaceUrl = parseKakaoPlaceUrl(destination.placeUrl);
  if (!canonicalPlaceUrl) throw new Error("MISSING_CANONICAL_PLACE_URL");
  const placeLinkResponse = await boundedFetch(canonicalPlaceUrl, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: { accept: "text/html" },
  });
  if (placeLinkResponse.status < 200 || placeLinkResponse.status >= 400) {
    throw new Error("CANONICAL_PLACE_URL_UNREACHABLE");
  }
  const route = await getDirections(
    {
      origin: {
        x: BUSAN_CENTER.longitude,
        y: BUSAN_CENTER.latitude,
        name: "부산 중심",
      },
      destination: {
        x: destination.coordinates.longitude,
        y: destination.coordinates.latitude,
        name: "실제 검색 장소",
      },
      waypoints: [],
    },
    { fetchImpl: boundedFetch },
  );

  const finiteGeometry = route.coordinates.every(
    (point) =>
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      point.latitude >= -90 &&
      point.latitude <= 90 &&
      point.longitude >= -180 &&
      point.longitude <= 180,
  );
  if (
    !Number.isFinite(route.totalDistanceMeters) ||
    route.totalDistanceMeters <= 0 ||
    !Number.isFinite(route.totalDurationSeconds) ||
    route.totalDurationSeconds <= 0 ||
    route.coordinates.length < 2 ||
    !finiteGeometry
  ) {
    throw new Error("INVALID_LIVE_ROUTE");
  }

  const canonicalLinks = search.results.filter(
    (place) => place.placeUrl && parseKakaoPlaceUrl(place.placeUrl),
  ).length;
  const absentLinks = search.results.filter((place) => !place.placeUrl).length;

  console.log(`LIVE_KAKAO_PROVIDER_CALLS=${providerCalls}`);
  console.log(`LIVE_KAKAO_CALL_LIMIT=${MAX_PROVIDER_CALLS}`);
  console.log(`LIVE_KAKAO_CANDIDATES=${search.results.length}`);
  console.log(`LIVE_KAKAO_VALID_COORDINATES=${search.results.length}`);
  console.log(`LIVE_KAKAO_CANONICAL_LINKS=${canonicalLinks}`);
  console.log(`LIVE_KAKAO_ABSENT_LINKS=${absentLinks}`);
  console.log(`LIVE_KAKAO_PLACE_URL_VALUES=${placeUrlShapes.values}`);
  console.log(`LIVE_KAKAO_PLACE_URL_HTTP=${placeUrlShapes.http}`);
  console.log(`LIVE_KAKAO_PLACE_URL_HTTPS=${placeUrlShapes.https}`);
  console.log(`LIVE_KAKAO_PLACE_URL_OTHER_SCHEME=${placeUrlShapes.otherScheme}`);
  console.log(`LIVE_KAKAO_PLACE_URL_EXACT_HOST=${placeUrlShapes.exactHost}`);
  console.log(`LIVE_KAKAO_PLACE_URL_NUMERIC_PATH=${placeUrlShapes.numericPath}`);
  console.log(`LIVE_KAKAO_PLACE_URL_PORT=${placeUrlShapes.port}`);
  console.log(`LIVE_KAKAO_PLACE_URL_CREDENTIALS=${placeUrlShapes.credentials}`);
  console.log(`LIVE_KAKAO_PLACE_URL_QUERY=${placeUrlShapes.query}`);
  console.log(`LIVE_KAKAO_PLACE_URL_FRAGMENT=${placeUrlShapes.fragment}`);
  console.log(`LIVE_KAKAO_PLACE_URL_OFFICIAL_EXACT=${placeUrlShapes.officialExactForm}`);
  console.log(`LIVE_KAKAO_PLACE_URL_ACCEPTED=${placeUrlShapes.accepted}`);
  console.log(`LIVE_KAKAO_PLACE_URL_NORMALIZED=${placeUrlShapes.normalized}`);
  console.log(`LIVE_KAKAO_PLACE_URL_REJECTED=${placeUrlShapes.rejected}`);
  console.log(`LIVE_KAKAO_PLACE_URL_MALFORMED=${placeUrlShapes.malformed}`);
  console.log("LIVE_KAKAO_CANONICAL_LINK_REACHABLE=true");
  console.log(`LIVE_KAKAO_DISTANCE_METERS=${route.totalDistanceMeters}`);
  console.log(`LIVE_KAKAO_DURATION_SECONDS=${route.totalDurationSeconds}`);
  console.log(`LIVE_KAKAO_GEOMETRY_POINTS=${route.coordinates.length}`);
  console.log(`LIVE_KAKAO_SECTIONS=${route.sections.length}`);
  console.log("LIVE_KAKAO_STATUS=success");
}

main().catch((error: unknown) => {
  const category = error instanceof Error ? error.name : "UNKNOWN_ERROR";
  console.error(`LIVE_KAKAO_STATUS=failed:${category}`);
  process.exitCode = 1;
});
