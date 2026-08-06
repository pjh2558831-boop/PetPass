import { existsSync } from "node:fs";
import { getKakaoRestApiKey } from "@/lib/kakao/server-config";
import { listTourCatalog } from "@/lib/tour-api/catalog-service";
import { getDefaultTourService } from "@/lib/tour-api/service";
import type { TourPlaceSummary } from "@/types/place";

const CENTER = { longitude: 129.174, latitude: 35.159 } as const;
const RADIUS_METERS = 20_000;
const PAGE_SIZE = 15;
const MAX_PAGES_PER_QUERY = 3;
const MAX_KAKAO_CALLS = 27;
const OVERLAP_DISTANCE_METERS = 100;

const QUERIES = [
  { query: "반려동물 동반 카페", kind: "pet", expected: /카페/u },
  { query: "반려견 동반 식당", kind: "pet", expected: /음식점|식당|카페/u },
  { query: "반려동물 동반 숙소", kind: "pet", expected: /숙박|호텔|펜션|리조트/u },
  { query: "애견펜션", kind: "pet", expected: /숙박|호텔|펜션|리조트/u },
  { query: "반려견 운동장", kind: "pet", expected: /반려동물|공원|운동/u },
  { query: "동물병원", kind: "generic", expected: /동물병원/u },
  { query: "카페", kind: "generic", expected: /카페/u },
  { query: "음식점", kind: "generic", expected: /음식점/u },
  { query: "숙박", kind: "generic", expected: /숙박|호텔|펜션|리조트/u },
] as const;

if (!process.env.KAKAO_REST_API_KEY && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
if (!process.env.TOUR_API_SERVICE_KEY && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

interface KakaoDocument {
  id: string;
  place_name: string;
  category_name: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  place_url: string;
  x: string;
  y: string;
}

interface KakaoResponse {
  meta: { total_count: number; pageable_count: number; is_end: boolean };
  documents: KakaoDocument[];
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/\([^)]*\)/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = radians(right.latitude - left.latitude);
  const dLng = radians(right.longitude - left.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(left.latitude)) *
      Math.cos(radians(right.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function coordinates(document: KakaoDocument) {
  const longitude = Number(document.x);
  const latitude = Number(document.y);
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? { longitude, latitude }
    : null;
}

function broadCategory(document: KakaoDocument): "attractions" | "food_cafes" | "accommodations" | "other" {
  const value = `${document.category_name} ${document.place_name}`;
  if (/숙박|호텔|펜션|리조트/u.test(value)) return "accommodations";
  if (/음식점|식당|카페/u.test(value)) return "food_cafes";
  if (/관광|공원|운동장|체험/u.test(value)) return "attractions";
  return "other";
}

function overlapsTourism(document: KakaoDocument, places: TourPlaceSummary[]): boolean {
  const documentCoordinates = coordinates(document);
  const documentName = normalize(document.place_name);
  const documentAddress = normalize(document.road_address_name || document.address_name);
  return places.some((place) => {
    const sameName = documentName !== "" && documentName === normalize(place.title);
    const sameAddress =
      documentAddress !== "" &&
      documentAddress === normalize([place.address, place.detailAddress].filter(Boolean).join(" "));
    const near =
      documentCoordinates !== null &&
      place.latitude !== null &&
      place.longitude !== null &&
      distanceMeters(documentCoordinates, {
        latitude: place.latitude,
        longitude: place.longitude,
      }) <= OVERLAP_DISTANCE_METERS;
    return sameAddress || (sameName && near);
  });
}

async function main() {
  if (process.env.CI) throw new Error("LIVE_AUDIT_DISABLED_IN_CI");
  const apiKey = getKakaoRestApiKey();
  let kakaoCalls = 0;
  const uniqueDocuments = new Map<string, KakaoDocument>();
  const documentClasses = new Map<
    string,
    "verified_pet_friendly" | "provider_claimed_pet_friendly" | "keyword_candidate" | "generic_place" | "not_relevant"
  >();

  const tourismPlaces: TourPlaceSummary[] = [];
  for (const contentTypeId of ["12", "14", "15", "28", "32", "39"] as const) {
    const list = await listTourCatalog(getDefaultTourService(), {
      regionCode: "26",
      contentTypeId,
      page: 1,
      pageSize: 50,
    });
    tourismPlaces.push(...list.places);
  }

  for (const definition of QUERIES) {
    const documents: KakaoDocument[] = [];
    let totalCount = 0;
    let pageableCount = 0;
    let pagesFetched = 0;
    for (let page = 1; page <= MAX_PAGES_PER_QUERY; page += 1) {
      if (kakaoCalls >= MAX_KAKAO_CALLS) throw new Error("KAKAO_CALL_LIMIT_REACHED");
      kakaoCalls += 1;
      const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
      url.searchParams.set("query", definition.query);
      url.searchParams.set("page", String(page));
      url.searchParams.set("size", String(PAGE_SIZE));
      url.searchParams.set("x", String(CENTER.longitude));
      url.searchParams.set("y", String(CENTER.latitude));
      url.searchParams.set("radius", String(RADIUS_METERS));
      url.searchParams.set("sort", "distance");
      const response = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `KakaoAK ${apiKey}` },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`KAKAO_HTTP_${response.status}`);
      const parsed = (await response.json()) as KakaoResponse;
      if (
        !parsed.meta ||
        !Array.isArray(parsed.documents) ||
        !Number.isInteger(parsed.meta.total_count)
      ) {
        throw new Error("INVALID_KAKAO_RESPONSE");
      }
      pagesFetched += 1;
      totalCount = parsed.meta.total_count;
      pageableCount = parsed.meta.pageable_count;
      documents.push(...parsed.documents);
      if (parsed.meta.is_end || documents.length >= pageableCount) break;
    }

    const unique = new Map(documents.map((document) => [document.id, document]));
    let relevant = 0;
    for (const document of unique.values()) {
      uniqueDocuments.set(document.id, document);
      const isRelevant = definition.expected.test(
        `${document.category_name} ${document.place_name}`,
      );
      const classification = !isRelevant
        ? "not_relevant"
        : definition.kind === "pet"
          ? "keyword_candidate"
          : "generic_place";
      if (isRelevant) relevant += 1;
      const existing = documentClasses.get(document.id);
      if (!existing || existing === "generic_place" || existing === "not_relevant") {
        documentClasses.set(document.id, classification);
      }
    }

    console.log(
      `KAKAO_AUDIT_QUERY=${JSON.stringify({
        query: definition.query,
        queryKind: definition.kind,
        totalCount,
        pageableCount,
        pagesFetched,
        returnedDocuments: documents.length,
        uniquePlaces: unique.size,
        validCoordinates: [...unique.values()].filter((document) => coordinates(document)).length,
        relevantByCategory: relevant,
        notRelevantByCategory: unique.size - relevant,
        addressAvailable: [...unique.values()].filter(
          (document) => document.road_address_name || document.address_name,
        ).length,
        phoneAvailable: [...unique.values()].filter((document) => document.phone.trim()).length,
        placeUrlAvailable: [...unique.values()].filter((document) => document.place_url.trim()).length,
        tourismOverlap: [...unique.values()].filter((document) =>
          overlapsTourism(document, tourismPlaces),
        ).length,
      })}`,
    );
  }

  const classifications = [
    "verified_pet_friendly",
    "provider_claimed_pet_friendly",
    "keyword_candidate",
    "generic_place",
    "not_relevant",
  ] as const;
  const unique = [...uniqueDocuments.values()];
  const overlap = unique.filter((document) => overlapsTourism(document, tourismPlaces));
  console.log(
    `KAKAO_AUDIT_TOTAL=${JSON.stringify({
      boundedUniquePlaces: unique.length,
      validCoordinates: unique.filter((document) => coordinates(document)).length,
      classifications: Object.fromEntries(
        classifications.map((classification) => [
          classification,
          [...documentClasses.values()].filter((value) => value === classification).length,
        ]),
      ),
      broadCategories: Object.fromEntries(
        ["attractions", "food_cafes", "accommodations", "other"].map(
          (category) => [
            category,
            unique.filter((document) => broadCategory(document) === category).length,
          ],
        ),
      ),
      overlapBroadCategories: Object.fromEntries(
        ["attractions", "food_cafes", "accommodations", "other"].map(
          (category) => [
            category,
            overlap.filter((document) => broadCategory(document) === category).length,
          ],
        ),
      ),
      tourismDefaultCatalog: tourismPlaces.length,
      tourismOverlap: overlap.length,
      potentialCombinedCandidatePool: tourismPlaces.length + unique.length - overlap.length,
      searchCenter: "Haeundae",
      radiusMeters: RADIUS_METERS,
      evidenceRule: "Kakao keyword/category matches remain unverified candidates",
    })}`,
  );
  console.log(`KAKAO_AUDIT_PROVIDER_CALLS=${kakaoCalls}`);
  console.log("KAKAO_AUDIT_STATUS=success");
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  console.error(`KAKAO_AUDIT_STATUS=failed:${code.slice(0, 120)}`);
  process.exitCode = 1;
});
