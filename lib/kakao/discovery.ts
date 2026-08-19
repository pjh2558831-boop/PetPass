import "server-only";

import { createKakaoDiscoveryCandidate } from "@/lib/kakao/candidates";
import {
  searchKakaoPlacePage,
  type KakaoKeywordSearchInput,
} from "@/lib/kakao/local";
import { KAKAO_DISTRICT_RADIUS_METERS } from "@/lib/kakao/search-area";
import { createKakaoSourceRecord, createTourismSourceRecord } from "@/lib/places/source-records";
import { findBestProviderLink } from "@/lib/places/source-linking";
import { deriveRegionLabel } from "@/lib/regions/label";
import { BUSAN_REGION_CONFIG } from "@/lib/regions/config";
import { BUSAN_REGION } from "@/lib/tour-api/catalog";
import { collectTourCatalog } from "@/lib/tour-api/catalog-service";
import { getDefaultTourService } from "@/lib/tour-api/service";
import type { Coordinates, TourContentTypeId, TourPlaceSummary } from "@/types/place";
import type {
  KakaoDiscoveryCategory,
  KakaoDiscoveryExactExistingPlaceLink,
  KakaoDiscoveryRectangle,
  KakaoDiscoveryResponse,
  KakaoDiscoveryStoppingReason,
  KakaoPlaceSearchPage,
  KakaoPlaceSearchResult,
} from "@/types/kakao";

export const KAKAO_DISCOVERY_KEYWORDS = [
  "애견동반",
  "반려견 동반",
  "반려동물 동반",
] as const;

export const KAKAO_DISCOVERY_LIMITS = {
  pageSize: 15,
  pageableDocuments: 45,
  maxPagesPerLane: 3,
  maxDepth: 2,
  maxRectangles: 9,
  maxExternalCalls: 24,
  minimumRectangleEdgeMeters: 500,
  maximumViewportDiagonalMeters: 20_000,
} as const;

export const BUSAN_DISCOVERY_BOUNDS =
  BUSAN_REGION_CONFIG.mapBounds satisfies KakaoDiscoveryRectangle;

const CATEGORY_GROUP_CODES = {
  attraction: ["AT4"],
  culture: ["CT1"],
  leisure: [undefined],
  accommodation: ["AD5"],
  food: ["FD6", "CE7"],
} as const satisfies Record<KakaoDiscoveryCategory, readonly (string | undefined)[]>;

const CONTENT_TYPE_BY_CATEGORY = {
  attraction: "12",
  culture: "14",
  leisure: "28",
  accommodation: "32",
  food: "39",
} as const satisfies Record<KakaoDiscoveryCategory, TourContentTypeId>;

const LEISURE_CATEGORY_TERMS = [
  "공원",
  "산책로",
  "둘레길",
  "등산로",
  "해수욕장",
  "캠핑장",
  "오토캠핑장",
  "반려동물놀이터",
] as const;

const EXCLUDED_CATEGORY_TERMS = [
  "동물병원",
  "동물약국",
  "애견미용",
  "반려동물미용",
  "반려동물용품",
  "애견용품",
  "동물용품",
  "펫샵",
  "약국",
  "대형마트",
  "슈퍼마켓",
  "편의점",
  "백화점",
  "쇼핑센터",
] as const;

const STOPPING_REASON_ORDER: readonly KakaoDiscoveryStoppingReason[] = [
  "external_call_budget",
  "maximum_depth",
  "maximum_rectangles",
  "minimum_rectangle_size",
  "provider_partial_failure",
  "catalog_linking_unavailable",
];

const EARTH_RADIUS_METERS = 6_371_000;

export interface KakaoDiscoveryInput {
  category: KakaoDiscoveryCategory;
  mode: "district" | "viewport";
  rectangle: KakaoDiscoveryRectangle;
  district?: { code: string; name: string };
  center?: Coordinates;
}

export interface KakaoDiscoveryDependencies {
  searchPage?: (
    input: KakaoKeywordSearchInput,
  ) => Promise<KakaoPlaceSearchPage>;
  loadExistingPlaces?: (
    category: KakaoDiscoveryCategory,
    districtCode?: string,
  ) => Promise<TourPlaceSummary[]>;
  now?: () => Date;
}

interface SearchLane {
  keyword: (typeof KAKAO_DISCOVERY_KEYWORDS)[number];
  categoryGroupCode?: string;
}

interface LaneState extends SearchLane {
  done: boolean;
  documentsSeen: number;
  saturated: boolean;
}

interface SearchState {
  externalCallCount: number;
  successfulCallCount: number;
  upstreamDocumentCount: number;
  rawResults: KakaoPlaceSearchResult[];
  failures: unknown[];
  saturated: boolean;
  stoppingReasons: Set<KakaoDiscoveryStoppingReason>;
}

interface SearchCell {
  rectangle: KakaoDiscoveryRectangle;
  depth: number;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function degrees(radiansValue: number): number {
  return (radiansValue * 180) / Math.PI;
}

export function distanceMeters(left: Coordinates, right: Coordinates): number {
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const fromLatitude = radians(left.latitude);
  const toLatitude = radians(right.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function rectangleDimensionsMeters(rectangle: KakaoDiscoveryRectangle) {
  const midpointLatitude = (rectangle.south + rectangle.north) / 2;
  const midpointLongitude = (rectangle.west + rectangle.east) / 2;
  return {
    width: distanceMeters(
      { latitude: midpointLatitude, longitude: rectangle.west },
      { latitude: midpointLatitude, longitude: rectangle.east },
    ),
    height: distanceMeters(
      { latitude: rectangle.south, longitude: midpointLongitude },
      { latitude: rectangle.north, longitude: midpointLongitude },
    ),
    diagonal: distanceMeters(
      { latitude: rectangle.south, longitude: rectangle.west },
      { latitude: rectangle.north, longitude: rectangle.east },
    ),
  };
}

export function rectangleFromCenter(
  center: Coordinates,
  radiusMeters = KAKAO_DISTRICT_RADIUS_METERS,
): KakaoDiscoveryRectangle {
  const latitudeDelta = degrees(radiusMeters / EARTH_RADIUS_METERS);
  const longitudeDelta = degrees(
    radiusMeters /
      (EARTH_RADIUS_METERS * Math.max(0.1, Math.cos(radians(center.latitude)))),
  );
  return {
    west: Math.max(BUSAN_DISCOVERY_BOUNDS.west, center.longitude - longitudeDelta),
    south: Math.max(BUSAN_DISCOVERY_BOUNDS.south, center.latitude - latitudeDelta),
    east: Math.min(BUSAN_DISCOVERY_BOUNDS.east, center.longitude + longitudeDelta),
    north: Math.min(BUSAN_DISCOVERY_BOUNDS.north, center.latitude + latitudeDelta),
  };
}

export function containsCoordinates(
  rectangle: KakaoDiscoveryRectangle,
  coordinates: Coordinates,
): boolean {
  return (
    coordinates.longitude >= rectangle.west &&
    coordinates.longitude <= rectangle.east &&
    coordinates.latitude >= rectangle.south &&
    coordinates.latitude <= rectangle.north
  );
}

function splitRectangle(
  rectangle: KakaoDiscoveryRectangle,
): KakaoDiscoveryRectangle[] {
  const middleLongitude = (rectangle.west + rectangle.east) / 2;
  const middleLatitude = (rectangle.south + rectangle.north) / 2;
  return [
    {
      west: rectangle.west,
      south: middleLatitude,
      east: middleLongitude,
      north: rectangle.north,
    },
    {
      west: middleLongitude,
      south: middleLatitude,
      east: rectangle.east,
      north: rectangle.north,
    },
    {
      west: rectangle.west,
      south: rectangle.south,
      east: middleLongitude,
      north: middleLatitude,
    },
    {
      west: middleLongitude,
      south: rectangle.south,
      east: rectangle.east,
      north: middleLatitude,
    },
  ];
}

function createLanes(category: KakaoDiscoveryCategory): SearchLane[] {
  return KAKAO_DISCOVERY_KEYWORDS.flatMap((keyword) =>
    CATEGORY_GROUP_CODES[category].map((categoryGroupCode) => ({
      keyword,
      categoryGroupCode,
    })),
  );
}

async function searchCell(
  cell: SearchCell,
  category: KakaoDiscoveryCategory,
  searchPage: NonNullable<KakaoDiscoveryDependencies["searchPage"]>,
  state: SearchState,
): Promise<boolean> {
  const lanes: LaneState[] = createLanes(category).map((lane) => ({
    ...lane,
    done: false,
    documentsSeen: 0,
    saturated: false,
  }));
  let budgetStopped = false;

  for (
    let page = 1;
    page <= KAKAO_DISCOVERY_LIMITS.maxPagesPerLane;
    page += 1
  ) {
    const active = lanes.filter(({ done }) => !done);
    if (active.length === 0) break;
    const remainingBudget =
      KAKAO_DISCOVERY_LIMITS.maxExternalCalls - state.externalCallCount;
    const selected = active.slice(0, Math.max(0, remainingBudget));
    if (selected.length < active.length) {
      state.stoppingReasons.add("external_call_budget");
      budgetStopped = true;
    }
    if (selected.length === 0) break;

    state.externalCallCount += selected.length;
    const settled = await Promise.allSettled(
      selected.map((lane) =>
        searchPage({
          query: lane.keyword,
          page,
          size: KAKAO_DISCOVERY_LIMITS.pageSize,
          categoryGroupCode: lane.categoryGroupCode,
          rectangle: cell.rectangle,
        }),
      ),
    );

    settled.forEach((result, index) => {
      const lane = selected[index];
      if (result.status === "rejected") {
        lane.done = true;
        state.failures.push(result.reason);
        state.stoppingReasons.add("provider_partial_failure");
        return;
      }

      state.successfulCallCount += 1;
      state.upstreamDocumentCount += result.value.results.length;
      state.rawResults.push(...result.value.results);
      lane.documentsSeen += result.value.results.length;
      lane.saturated ||=
        result.value.pageableCount >= KAKAO_DISCOVERY_LIMITS.pageableDocuments ||
        result.value.totalCount > result.value.pageableCount ||
        (page === KAKAO_DISCOVERY_LIMITS.maxPagesPerLane &&
          !result.value.isEnd);
      lane.done =
        result.value.isEnd ||
        lane.documentsSeen >= result.value.pageableCount ||
        page === KAKAO_DISCOVERY_LIMITS.maxPagesPerLane;
    });

    if (budgetStopped) break;
  }

  return lanes.some(({ saturated }) => saturated);
}

function isBusanAddress(result: KakaoPlaceSearchResult): boolean {
  const label = deriveRegionLabel({
    roadAddress: result.roadAddress,
    lotNumberAddress: result.address,
  });
  return label === "부산" || label.startsWith("부산 · ");
}

function isDistrictAddress(
  result: KakaoPlaceSearchResult,
  districtName: string,
): boolean {
  return (
    deriveRegionLabel({
      roadAddress: result.roadAddress,
      lotNumberAddress: result.address,
    }) === `부산 · ${districtName}`
  );
}

function isAllowedCategory(
  result: KakaoPlaceSearchResult,
  category: KakaoDiscoveryCategory,
): boolean {
  const categoryText = result.categoryName?.trim() ?? "";
  if (!categoryText) return false;
  if (EXCLUDED_CATEGORY_TERMS.some((term) => categoryText.includes(term))) {
    return false;
  }
  if (category === "leisure") {
    const segments = categoryText.split(">").map((segment) => segment.trim());
    return segments.some((segment) =>
      LEISURE_CATEGORY_TERMS.some((term) => segment.includes(term)),
    );
  }
  return CATEGORY_GROUP_CODES[category].includes(
    result.categoryGroupCode as never,
  );
}

function compareResults(
  center: Coordinates | undefined,
  left: KakaoPlaceSearchResult,
  right: KakaoPlaceSearchResult,
): number {
  const byDistance = center
    ? distanceMeters(center, left.coordinates) -
      distanceMeters(center, right.coordinates)
    : 0;
  return (
    byDistance ||
    left.name.localeCompare(right.name, "ko") ||
    (left.roadAddress ?? left.address).localeCompare(
      right.roadAddress ?? right.address,
      "ko",
    ) ||
    left.id.localeCompare(right.id)
  );
}

async function defaultLoadExistingPlaces(
  category: KakaoDiscoveryCategory,
  districtCode?: string,
): Promise<TourPlaceSummary[]> {
  const catalog = await collectTourCatalog(getDefaultTourService(), {
    regionCode: BUSAN_REGION.code,
    ...(districtCode ? { districtCode: districtCode as never } : {}),
    contentTypeId: CONTENT_TYPE_BY_CATEGORY[category],
  });
  return catalog.places;
}

function exactExistingLink(
  result: KakaoPlaceSearchResult,
  retrievedAt: string,
  existingPlaces: readonly TourPlaceSummary[],
): KakaoDiscoveryExactExistingPlaceLink | undefined {
  const candidateRecord = createKakaoSourceRecord(result, retrievedAt);
  const records = existingPlaces.map((place) => ({
    place,
    record: createTourismSourceRecord(place),
  }));
  const link = findBestProviderLink(
    candidateRecord,
    records.map(({ record }) => record),
  );
  if (link?.classification !== "exact") return undefined;
  const existingRecordId = link.sourceRecordIds.find(
    (recordId) => recordId !== candidateRecord.recordId,
  );
  const match = records.find(({ record }) => record.recordId === existingRecordId);
  if (!match) return undefined;
  return {
    classification: "exact",
    contentId: match.place.contentId,
    title: match.place.title ?? "이름 미확인",
  };
}

export async function discoverKakaoPlaces(
  input: KakaoDiscoveryInput,
  dependencies: KakaoDiscoveryDependencies = {},
): Promise<KakaoDiscoveryResponse> {
  const searchPage = dependencies.searchPage ?? searchKakaoPlacePage;
  const state: SearchState = {
    externalCallCount: 0,
    successfulCallCount: 0,
    upstreamDocumentCount: 0,
    rawResults: [],
    failures: [],
    saturated: false,
    stoppingReasons: new Set(),
  };
  const queue: SearchCell[] = [{ rectangle: input.rectangle, depth: 0 }];
  let rectanglesProcessed = 0;

  while (queue.length > 0) {
    if (state.externalCallCount >= KAKAO_DISCOVERY_LIMITS.maxExternalCalls) {
      state.stoppingReasons.add("external_call_budget");
      break;
    }
    const cell = queue.shift();
    if (!cell) break;
    rectanglesProcessed += 1;
    const saturated = await searchCell(cell, input.category, searchPage, state);
    if (!saturated) continue;
    state.saturated = true;

    if (cell.depth >= KAKAO_DISCOVERY_LIMITS.maxDepth) {
      state.stoppingReasons.add("maximum_depth");
      continue;
    }
    const children = splitRectangle(cell.rectangle);
    if (
      children.some(({ west, south, east, north }) => {
        const dimensions = rectangleDimensionsMeters({ west, south, east, north });
        return (
          dimensions.width < KAKAO_DISCOVERY_LIMITS.minimumRectangleEdgeMeters ||
          dimensions.height < KAKAO_DISCOVERY_LIMITS.minimumRectangleEdgeMeters
        );
      })
    ) {
      state.stoppingReasons.add("minimum_rectangle_size");
      continue;
    }
    if (
      rectanglesProcessed + queue.length + children.length >
      KAKAO_DISCOVERY_LIMITS.maxRectangles
    ) {
      state.stoppingReasons.add("maximum_rectangles");
      continue;
    }
    queue.push(
      ...children.map((rectangle) => ({
        rectangle,
        depth: cell.depth + 1,
      })),
    );
  }

  if (state.successfulCallCount === 0 && state.failures.length > 0) {
    throw state.failures[0];
  }

  let outOfRegionRemovalCount = 0;
  let excludedCategoryCount = 0;
  const regionFiltered = state.rawResults.filter((result) => {
    const valid =
      isBusanAddress(result) &&
      (!input.district || isDistrictAddress(result, input.district.name)) &&
      containsCoordinates(BUSAN_DISCOVERY_BOUNDS, result.coordinates) &&
      containsCoordinates(input.rectangle, result.coordinates);
    if (!valid) outOfRegionRemovalCount += 1;
    return valid;
  });
  const categoryFiltered = regionFiltered.filter((result) => {
    const valid = isAllowedCategory(result, input.category);
    if (!valid) excludedCategoryCount += 1;
    return valid;
  });
  const unique = new Map<string, KakaoPlaceSearchResult>();
  for (const result of categoryFiltered) {
    if (!unique.has(result.id)) unique.set(result.id, result);
  }
  const duplicateCount = categoryFiltered.length - unique.size;
  const ordered = [...unique.values()].sort((left, right) =>
    compareResults(input.center, left, right),
  );

  let existingPlaces: TourPlaceSummary[] = [];
  if (ordered.length > 0) {
    try {
      existingPlaces = await (
        dependencies.loadExistingPlaces ?? defaultLoadExistingPlaces
      )(input.category, input.district?.code);
    } catch {
      state.stoppingReasons.add("catalog_linking_unavailable");
    }
  }

  const retrievedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  let exactExistingPlaceLinkCount = 0;
  const candidates = ordered.map((result) => {
    const exactLink = exactExistingLink(result, retrievedAt, existingPlaces);
    if (exactLink) exactExistingPlaceLinkCount += 1;
    return createKakaoDiscoveryCandidate(result, input.category, exactLink);
  });
  const stoppingReasons = STOPPING_REASON_ORDER.filter((reason) =>
    state.stoppingReasons.has(reason),
  );

  return {
    candidates,
    searchArea: {
      mode: input.mode,
      rectangle: input.rectangle,
      center: input.center ?? null,
    },
    district: input.district ?? null,
    category: input.category,
    metadata: {
      externalCallCount: state.externalCallCount,
      upstreamDocumentCount: state.upstreamDocumentCount,
      duplicateCount,
      outOfRegionRemovalCount,
      excludedCategoryCount,
      exactExistingPlaceLinkCount,
      verificationRequiredCandidateCount: candidates.length,
      saturated: state.saturated,
      partial: stoppingReasons.length > 0,
      stoppingReasons,
    },
  };
}
