import type {
  Coordinates,
  TourContentTypeId,
  TourOperationName,
} from "@/types/place";
import type { RegionId } from "@/types/region";
import type { PublicMapPlaceCategory } from "@/types/public-map-place";

export { REGION_IDS } from "@/types/region";
export type { RegionId } from "@/types/region";

export interface RegionDistrictConfig {
  legalDongDistrictCode: string;
  name: string;
  /** Required only for regions with Kakao district discovery enabled. */
  searchCenter?: Coordinates;
}

export interface RegionBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface RegionSearchCenter {
  id: string;
  label: string;
  coordinates: Coordinates;
  radiusMeters: number;
}

export interface HomepageOptionalTourDatasetConfig {
  enabled: boolean;
  listOperation: Extract<TourOperationName, "areaBasedList2">;
  visibilityOperation: Extract<TourOperationName, "petTourSyncList2">;
  contentTypeId: TourContentTypeId;
  legalDongDistrictCode: string | null;
  providerPageSize: number;
  maxProviderPages: number;
}

export const KTO_CATALOG_CONTENT_TYPE_IDS = [
  "12",
  "14",
  "15",
  "28",
  "32",
  "39",
] as const satisfies readonly TourContentTypeId[];

export type RegionMapProvider = "tour" | "kakao";
export type RegionCatalogCategory =
  | "attraction"
  | "food"
  | "cafe"
  | "accommodation"
  | "shopping"
  | "veterinary"
  | "pet_shop";

export interface RegionMapCatalogConfig {
  defaultProviders: readonly RegionMapProvider[];
  fallbackSource: "tour_api" | "public_catalog";
  /** Null means every normalized category returned for the allowed provider set. */
  snapshotCategories: readonly PublicMapPlaceCategory[] | null;
  availableCategories: readonly RegionCatalogCategory[];
  deferredCategories: readonly RegionCatalogCategory[];
  sourceDescription: string;
  hideMissingPhoneOnDetail: boolean;
}

export interface KtoCollectionDatasetConfig {
  provider: "tour";
  listOperation: Extract<TourOperationName, "areaBasedList2">;
  acceptedContentTypeIds: readonly TourContentTypeId[];
  administrativeAddressPrefixes: readonly string[];
  collectorVersion: string;
  registryVersion: string;
  cacheNamespace: string;
  limits: {
    listPageSize: number;
    maxListPages: number;
    maxRawRecords: number;
    maxRawRecordsPerDistrict: number;
    maxAcceptedRecords: number;
  };
}

export interface RegionConfig<TId extends string = RegionId> {
  id: TId;
  displayName: string;
  providerCodes: {
    korPetTourService2: {
      legalDongRegionCode: string;
    };
    legacyTourismAreaCode: string | null;
  };
  mapEnabled: boolean;
  ktoCatalogEnabled: boolean;
  ktoCollection: KtoCollectionDatasetConfig | null;
  itineraryEnabled: boolean;
  kakaoDiscoveryEnabled: boolean;
  allowedMapProviders: readonly RegionMapProvider[];
  mapCatalog: RegionMapCatalogConfig;
  homepageFeaturedEnabled: boolean;
  homepageOptionalDatasets: {
    ktoShopping: HomepageOptionalTourDatasetConfig;
  };
  defaultMapCenter: Coordinates;
  mapBounds: RegionBounds;
  /** Accepted departure spillover around map bounds for itinerary origins. */
  itineraryOriginBorderToleranceMeters: number;
  districts: readonly RegionDistrictConfig[];
  wideSearchCenters: readonly RegionSearchCenter[];
}

const BUSAN_DISTRICT_CONFIGS = [
  { legalDongDistrictCode: "110", name: "중구", searchCenter: { latitude: 35.1063, longitude: 129.0324 } },
  { legalDongDistrictCode: "140", name: "서구", searchCenter: { latitude: 35.0979, longitude: 129.0242 } },
  { legalDongDistrictCode: "170", name: "동구", searchCenter: { latitude: 35.1293, longitude: 129.0453 } },
  { legalDongDistrictCode: "200", name: "영도구", searchCenter: { latitude: 35.0912, longitude: 129.0679 } },
  { legalDongDistrictCode: "230", name: "부산진구", searchCenter: { latitude: 35.1629, longitude: 129.0532 } },
  { legalDongDistrictCode: "260", name: "동래구", searchCenter: { latitude: 35.2048, longitude: 129.0838 } },
  { legalDongDistrictCode: "290", name: "남구", searchCenter: { latitude: 35.1366, longitude: 129.0842 } },
  { legalDongDistrictCode: "320", name: "북구", searchCenter: { latitude: 35.1972, longitude: 128.9904 } },
  { legalDongDistrictCode: "350", name: "해운대구", searchCenter: { latitude: 35.1631, longitude: 129.1636 } },
  { legalDongDistrictCode: "380", name: "사하구", searchCenter: { latitude: 35.1046, longitude: 128.9747 } },
  { legalDongDistrictCode: "410", name: "금정구", searchCenter: { latitude: 35.243, longitude: 129.0921 } },
  { legalDongDistrictCode: "440", name: "강서구", searchCenter: { latitude: 35.2122, longitude: 128.9807 } },
  { legalDongDistrictCode: "470", name: "연제구", searchCenter: { latitude: 35.1762, longitude: 129.0798 } },
  { legalDongDistrictCode: "500", name: "수영구", searchCenter: { latitude: 35.1456, longitude: 129.1131 } },
  { legalDongDistrictCode: "530", name: "사상구", searchCenter: { latitude: 35.1526, longitude: 128.9912 } },
  { legalDongDistrictCode: "710", name: "기장군", searchCenter: { latitude: 35.2446, longitude: 129.2223 } },
] as const satisfies readonly RegionDistrictConfig[];

export const BUSAN_REGION_CONFIG = {
  id: "busan",
  displayName: "부산",
  providerCodes: {
    korPetTourService2: { legalDongRegionCode: "26" },
    legacyTourismAreaCode: null,
  },
  mapEnabled: true,
  ktoCatalogEnabled: true,
  ktoCollection: null,
  itineraryEnabled: true,
  kakaoDiscoveryEnabled: true,
  allowedMapProviders: ["tour", "kakao"],
  mapCatalog: {
    defaultProviders: ["kakao"],
    fallbackSource: "tour_api",
    snapshotCategories: [
      "attraction",
      "park_walk",
      "leisure",
      "camping",
      "food",
      "cafe",
      "accommodation",
    ],
    availableCategories: [
      "attraction",
      "food",
      "cafe",
      "accommodation",
      "shopping",
      "veterinary",
      "pet_shop",
    ],
    deferredCategories: ["shopping", "veterinary", "pet_shop"],
    sourceDescription: "공식 관광 장소와 공개된 지역 후보를 함께 비교합니다.",
    hideMissingPhoneOnDetail: false,
  },
  homepageFeaturedEnabled: true,
  homepageOptionalDatasets: {
    ktoShopping: {
      enabled: true,
      listOperation: "areaBasedList2",
      visibilityOperation: "petTourSyncList2",
      contentTypeId: "38",
      legalDongDistrictCode: null,
      providerPageSize: 200,
      maxProviderPages: 20,
    },
  },
  defaultMapCenter: { latitude: 35.1796, longitude: 129.0756 },
  mapBounds: { west: 128.75, south: 34.95, east: 129.4, north: 35.5 },
  itineraryOriginBorderToleranceMeters: 500,
  districts: BUSAN_DISTRICT_CONFIGS,
  // A bounded west/central/east plan covers the MVP region without crawling pages.
  wideSearchCenters: [
    {
      id: "busan-central",
      label: "부산 중앙",
      coordinates: { latitude: 35.1796, longitude: 129.0756 },
      radiusMeters: 20_000,
    },
    {
      id: "busan-west",
      label: "부산 서부",
      coordinates: { latitude: 35.1731, longitude: 128.9468 },
      radiusMeters: 16_000,
    },
    {
      id: "busan-east",
      label: "부산 동부",
      coordinates: { latitude: 35.2446, longitude: 129.2223 },
      radiusMeters: 16_000,
    },
  ],
} as const satisfies RegionConfig;

// Phase 4 enables only the public map. Itinerary generation and Kakao
// discovery remain separate, explicitly disabled capabilities.
export const JEJU_REGION_CONFIG = {
  id: "jeju",
  displayName: "제주",
  providerCodes: {
    korPetTourService2: { legalDongRegionCode: "50" },
    legacyTourismAreaCode: "39",
  },
  mapEnabled: true,
  ktoCatalogEnabled: true,
  ktoCollection: {
    provider: "tour",
    listOperation: "areaBasedList2",
    acceptedContentTypeIds: KTO_CATALOG_CONTENT_TYPE_IDS,
    administrativeAddressPrefixes: ["제주", "제주특별자치도"],
    collectorVersion: "tour-service2-region-collector-v2",
    registryVersion: "tour-jeju-service2-v1",
    cacheNamespace: "tour-jeju-service2-v1",
    limits: {
      listPageSize: 500,
      maxListPages: 4,
      maxRawRecords: 500,
      maxRawRecordsPerDistrict: 300,
      maxAcceptedRecords: 100,
    },
  },
  itineraryEnabled: false,
  kakaoDiscoveryEnabled: false,
  allowedMapProviders: ["tour"],
  mapCatalog: {
    defaultProviders: ["tour"],
    fallbackSource: "public_catalog",
    snapshotCategories: [
      "attraction",
      "park_walk",
      "leisure",
      "camping",
      "food",
      "cafe",
      "accommodation",
    ],
    availableCategories: ["attraction", "food", "cafe", "accommodation"],
    deferredCategories: [],
    sourceDescription: "한국관광공사 공식 장소만 표시합니다.",
    hideMissingPhoneOnDetail: true,
  },
  homepageFeaturedEnabled: false,
  homepageOptionalDatasets: {
    ktoShopping: {
      enabled: false,
      listOperation: "areaBasedList2",
      visibilityOperation: "petTourSyncList2",
      contentTypeId: "38",
      legalDongDistrictCode: null,
      providerPageSize: 200,
      maxProviderPages: 20,
    },
  },
  defaultMapCenter: { latitude: 33.4996, longitude: 126.5312 },
  mapBounds: { west: 125.9, south: 33.0, east: 127.1, north: 34.0 },
  itineraryOriginBorderToleranceMeters: 500,
  districts: [
    { legalDongDistrictCode: "110", name: "제주시", searchCenter: { latitude: 33.4996, longitude: 126.5312 } },
    { legalDongDistrictCode: "130", name: "서귀포시", searchCenter: { latitude: 33.2541, longitude: 126.5601 } },
  ],
  wideSearchCenters: [],
} as const satisfies RegionConfig;

// Phase 3 enables the public KTO map only. Itinerary generation and Kakao
// discovery remain separate, explicitly disabled capabilities.
export const SEOUL_REGION_CONFIG = {
  id: "seoul",
  displayName: "서울",
  providerCodes: {
    korPetTourService2: { legalDongRegionCode: "11" },
    legacyTourismAreaCode: null,
  },
  mapEnabled: true,
  ktoCatalogEnabled: true,
  ktoCollection: {
    provider: "tour",
    listOperation: "areaBasedList2",
    acceptedContentTypeIds: KTO_CATALOG_CONTENT_TYPE_IDS,
    administrativeAddressPrefixes: ["서울", "서울특별시"],
    collectorVersion: "tour-service2-region-collector-v2",
    registryVersion: "tour-seoul-service2-v1",
    cacheNamespace: "tour-seoul-service2-v1",
    limits: {
      listPageSize: 500,
      maxListPages: 4,
      maxRawRecords: 3_500,
      maxRawRecordsPerDistrict: 500,
      maxAcceptedRecords: 100,
    },
  },
  itineraryEnabled: false,
  kakaoDiscoveryEnabled: false,
  allowedMapProviders: ["tour"],
  mapCatalog: {
    defaultProviders: ["tour"],
    fallbackSource: "public_catalog",
    snapshotCategories: null,
    availableCategories: ["attraction", "food", "cafe", "accommodation", "shopping"],
    deferredCategories: [],
    sourceDescription: "한국관광공사 공식 장소만 표시합니다.",
    hideMissingPhoneOnDetail: true,
  },
  homepageFeaturedEnabled: false,
  homepageOptionalDatasets: {
    ktoShopping: {
      enabled: false,
      listOperation: "areaBasedList2",
      visibilityOperation: "petTourSyncList2",
      contentTypeId: "38",
      legalDongDistrictCode: null,
      providerPageSize: 200,
      maxProviderPages: 20,
    },
  },
  defaultMapCenter: { latitude: 37.5665, longitude: 126.978 },
  mapBounds: { west: 126.75, south: 37.4, east: 127.2, north: 37.72 },
  itineraryOriginBorderToleranceMeters: 500,
  districts: [
    { legalDongDistrictCode: "110", name: "종로구" },
    { legalDongDistrictCode: "140", name: "중구" },
    { legalDongDistrictCode: "170", name: "용산구" },
    { legalDongDistrictCode: "200", name: "성동구" },
    { legalDongDistrictCode: "215", name: "광진구" },
    { legalDongDistrictCode: "230", name: "동대문구" },
    { legalDongDistrictCode: "260", name: "중랑구" },
    { legalDongDistrictCode: "290", name: "성북구" },
    { legalDongDistrictCode: "305", name: "강북구" },
    { legalDongDistrictCode: "320", name: "도봉구" },
    { legalDongDistrictCode: "350", name: "노원구" },
    { legalDongDistrictCode: "380", name: "은평구" },
    { legalDongDistrictCode: "410", name: "서대문구" },
    { legalDongDistrictCode: "440", name: "마포구" },
    { legalDongDistrictCode: "470", name: "양천구" },
    { legalDongDistrictCode: "500", name: "강서구" },
    { legalDongDistrictCode: "530", name: "구로구" },
    { legalDongDistrictCode: "545", name: "금천구" },
    { legalDongDistrictCode: "560", name: "영등포구" },
    { legalDongDistrictCode: "590", name: "동작구" },
    { legalDongDistrictCode: "620", name: "관악구" },
    { legalDongDistrictCode: "650", name: "서초구" },
    { legalDongDistrictCode: "680", name: "강남구" },
    { legalDongDistrictCode: "710", name: "송파구" },
    { legalDongDistrictCode: "740", name: "강동구" },
  ],
  wideSearchCenters: [],
} as const satisfies RegionConfig;

export const REGION_CONFIGS = [
  BUSAN_REGION_CONFIG,
  JEJU_REGION_CONFIG,
  SEOUL_REGION_CONFIG,
] as const satisfies readonly RegionConfig[];

export type KtoCollectionEnabledRegionConfig<TId extends string = string> =
  RegionConfig<TId> & { ktoCollection: KtoCollectionDatasetConfig };
export type SearchableRegionConfig<TId extends string = string> =
  RegionConfig<TId> & {
    districts: readonly (RegionDistrictConfig & { searchCenter: Coordinates })[];
  };

export type BusanDistrictCode =
  (typeof BUSAN_REGION_CONFIG.districts)[number]["legalDongDistrictCode"];
export function getMapEnabledRegionConfigs(
  regions: readonly RegionConfig[] = REGION_CONFIGS,
): RegionConfig[] {
  return regions.filter((region) => region.mapEnabled);
}

export function getItineraryEnabledRegionConfigs(
  regions: readonly RegionConfig[] = REGION_CONFIGS,
): RegionConfig[] {
  return regions.filter((region) => region.itineraryEnabled);
}

export function getKakaoDiscoveryEnabledRegionConfigs(
  regions: readonly RegionConfig[] = REGION_CONFIGS,
): RegionConfig[] {
  return regions.filter((region) => region.kakaoDiscoveryEnabled);
}

export function getRegionConfig(regionId: RegionId): RegionConfig;
export function getRegionConfig(
  regionId: string | null | undefined,
): RegionConfig | null;
export function getRegionConfig(
  regionId: string | null | undefined,
): RegionConfig | null {
  if (!regionId) return null;
  return REGION_CONFIGS.find((region) => region.id === regionId) ?? null;
}

export function getRegionConfigByService2LegalDongCode(
  legalDongRegionCode: string | null | undefined,
): RegionConfig | null {
  if (!legalDongRegionCode) return null;
  return REGION_CONFIGS.find(
    (region) =>
      region.providerCodes.korPetTourService2.legalDongRegionCode ===
      legalDongRegionCode,
  ) ?? null;
}

export function getKakaoDiscoveryEnabledRegionConfig(
  regionId: string | null | undefined,
): SearchableRegionConfig | null {
  const region = getRegionConfig(regionId);
  return region?.kakaoDiscoveryEnabled
    ? region as SearchableRegionConfig
    : null;
}

export function getRegionDefaultCatalogCategories(
  region: RegionConfig,
): RegionCatalogCategory[] {
  return region.mapCatalog.availableCategories.filter((category) =>
    !region.mapCatalog.deferredCategories.includes(category));
}

export function getKtoCollectionEnabledRegionConfig(
  regionId: string | null | undefined,
): KtoCollectionEnabledRegionConfig | null {
  const region = getRegionConfig(regionId);
  return region?.ktoCollection
    ? region as KtoCollectionEnabledRegionConfig
    : null;
}

export function getRegionDistrict<TId extends string>(
  region: SearchableRegionConfig<TId>,
  districtCode: string | null | undefined,
): (RegionDistrictConfig & { searchCenter: Coordinates }) | null;
export function getRegionDistrict(
  region: RegionConfig<string>,
  districtCode: string | null | undefined,
): RegionDistrictConfig | null;
export function getRegionDistrict(
  region: RegionConfig<string>,
  districtCode: string | null | undefined,
): RegionDistrictConfig | null {
  if (!districtCode) return null;
  return region.districts.find(
    ({ legalDongDistrictCode }) => legalDongDistrictCode === districtCode,
  ) ?? null;
}

export function coordinatesInRegion(
  region: RegionConfig<string>,
  coordinates: Coordinates,
): boolean {
  return Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) &&
    coordinates.latitude >= region.mapBounds.south &&
    coordinates.latitude <= region.mapBounds.north &&
    coordinates.longitude >= region.mapBounds.west &&
    coordinates.longitude <= region.mapBounds.east;
}

export function coordinatesInItineraryOriginScope(
  region: RegionConfig<string>,
  coordinates: Coordinates,
): boolean {
  if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) {
    return false;
  }
  const latitudePadding = region.itineraryOriginBorderToleranceMeters / 111_320;
  const centerLatitude = (region.mapBounds.south + region.mapBounds.north) / 2;
  const longitudeMetersPerDegree = Math.max(
    1,
    111_320 * Math.cos((centerLatitude * Math.PI) / 180),
  );
  const longitudePadding =
    region.itineraryOriginBorderToleranceMeters / longitudeMetersPerDegree;
  return coordinates.latitude >= region.mapBounds.south - latitudePadding &&
    coordinates.latitude <= region.mapBounds.north + latitudePadding &&
    coordinates.longitude >= region.mapBounds.west - longitudePadding &&
    coordinates.longitude <= region.mapBounds.east + longitudePadding;
}
