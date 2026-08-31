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
  /** Stable public district key: legal-dong code, or zero-padded areaCode2 district code. */
  legalDongDistrictCode: string;
  name: string;
  /** Leaf legal-dong codes queried when KTO stores city records by subordinate gu. */
  collectionLegalDongDistrictCodes?: readonly string[];
  /** areaCode2 district codes queried by regions whose stable identity is area-code based. */
  collectionAreaDistrictCodes?: readonly string[];
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

export const KTO_CATALOG_DATASET_IDS = ["core", "shopping"] as const;
export type KtoCatalogDataset = (typeof KTO_CATALOG_DATASET_IDS)[number];
export type KtoEvidenceCollectionMode = "detailed" | "list_only";
export type KtoAdministrativeCodeSystem = "legal_dong" | "area_code";

export interface KtoCollectionPartitionConfig {
  id: KtoCatalogDataset;
  evidenceCollectionMode: KtoEvidenceCollectionMode;
  contentTypeIds: readonly TourContentTypeId[];
}

export type RegionMapProvider = "tour" | "kakao";
export interface RegionRouteCapabilities {
  /** Order and validate places explicitly chosen by the user. */
  selectedPlaceRouting: boolean;
  /** Add strictly eligible candidates around locked user selections. */
  automaticFill: boolean;
  /** Build an itinerary without any user-selected place. */
  fullyAutomaticRecommendation: boolean;
}
export type RegionRouteCapabilityBlock =
  | "selected_place_routing"
  | "automatic_fill"
  | "fully_automatic_recommendation";
export type RegionCatalogCategory =
  | "attraction"
  | "food"
  | "cafe"
  | "accommodation"
  | "shopping"
  | "other"
  | "veterinary"
  | "pet_shop";

export interface RegionMapCatalogConfig {
  defaultProviders: readonly RegionMapProvider[];
  fallbackSource: "tour_api" | "public_catalog";
  snapshotDatasets: readonly KtoCatalogDataset[];
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
  administrativeCodeSystem: KtoAdministrativeCodeSystem;
  datasets: readonly KtoCollectionPartitionConfig[];
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
    maxDetailedRecords: number;
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
  routeCapabilities: RegionRouteCapabilities;
  kakaoDiscoveryEnabled: boolean;
  allowedMapProviders: readonly RegionMapProvider[];
  mapCatalog: RegionMapCatalogConfig;
  homepageFeaturedEnabled: boolean;
  homepageOptionalDatasets: {
    ktoShopping: HomepageOptionalTourDatasetConfig;
  };
  defaultMapCenter: Coordinates;
  defaultMapLevel: number;
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
    legacyTourismAreaCode: "6",
  },
  mapEnabled: true,
  ktoCatalogEnabled: true,
  ktoCollection: {
    provider: "tour",
    listOperation: "areaBasedList2",
    administrativeCodeSystem: "legal_dong",
    datasets: [
      {
        id: "core",
        evidenceCollectionMode: "detailed",
        contentTypeIds: KTO_CATALOG_CONTENT_TYPE_IDS,
      },
      {
        id: "shopping",
        evidenceCollectionMode: "list_only",
        contentTypeIds: ["38"],
      },
    ],
    administrativeAddressPrefixes: ["부산", "부산광역시"],
    collectorVersion: "tour-service2-region-collector-v3",
    registryVersion: "tour-busan-service2-v1",
    cacheNamespace: "tour-busan-service2-v1",
    limits: {
      listPageSize: 500,
      maxListPages: 100,
      maxRawRecords: 5_000,
      maxRawRecordsPerDistrict: 1_000,
      maxAcceptedRecords: 5_000,
      maxDetailedRecords: 500,
    },
  },
  itineraryEnabled: true,
  routeCapabilities: {
    selectedPlaceRouting: true,
    automaticFill: true,
    fullyAutomaticRecommendation: true,
  },
  kakaoDiscoveryEnabled: true,
  allowedMapProviders: ["tour", "kakao"],
  mapCatalog: {
    defaultProviders: ["kakao"],
    fallbackSource: "tour_api",
    snapshotDatasets: ["core"],
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
  defaultMapLevel: 8,
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
    administrativeCodeSystem: "legal_dong",
    datasets: [
      {
        id: "core",
        evidenceCollectionMode: "detailed",
        contentTypeIds: KTO_CATALOG_CONTENT_TYPE_IDS,
      },
      {
        id: "shopping",
        evidenceCollectionMode: "list_only",
        contentTypeIds: ["38"],
      },
    ],
    administrativeAddressPrefixes: ["제주", "제주특별자치도"],
    collectorVersion: "tour-service2-region-collector-v3",
    registryVersion: "tour-jeju-service2-v2",
    cacheNamespace: "tour-jeju-service2-v2",
    limits: {
      listPageSize: 500,
      maxListPages: 4,
      maxRawRecords: 500,
      maxRawRecordsPerDistrict: 300,
      maxAcceptedRecords: 500,
      maxDetailedRecords: 100,
    },
  },
  itineraryEnabled: false,
  routeCapabilities: {
    selectedPlaceRouting: true,
    automaticFill: false,
    fullyAutomaticRecommendation: false,
  },
  kakaoDiscoveryEnabled: false,
  allowedMapProviders: ["tour"],
  mapCatalog: {
    defaultProviders: ["tour"],
    fallbackSource: "public_catalog",
    snapshotDatasets: ["core", "shopping"],
    snapshotCategories: [
      "attraction",
      "park_walk",
      "leisure",
      "camping",
      "food",
      "cafe",
      "accommodation",
      "other",
    ],
    availableCategories: ["attraction", "food", "cafe", "accommodation", "shopping", "other"],
    deferredCategories: ["shopping"],
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
  defaultMapLevel: 10,
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
    legacyTourismAreaCode: "1",
  },
  mapEnabled: true,
  ktoCatalogEnabled: true,
  ktoCollection: {
    provider: "tour",
    listOperation: "areaBasedList2",
    administrativeCodeSystem: "legal_dong",
    datasets: [
      {
        id: "core",
        evidenceCollectionMode: "detailed",
        contentTypeIds: KTO_CATALOG_CONTENT_TYPE_IDS,
      },
      {
        id: "shopping",
        evidenceCollectionMode: "list_only",
        contentTypeIds: ["38"],
      },
    ],
    administrativeAddressPrefixes: ["서울", "서울특별시"],
    collectorVersion: "tour-service2-region-collector-v3",
    registryVersion: "tour-seoul-service2-v3",
    cacheNamespace: "tour-seoul-service2-v3",
    limits: {
      listPageSize: 500,
      maxListPages: 4,
      maxRawRecords: 3_500,
      maxRawRecordsPerDistrict: 500,
      maxAcceptedRecords: 3_500,
      maxDetailedRecords: 100,
    },
  },
  itineraryEnabled: false,
  routeCapabilities: {
    selectedPlaceRouting: true,
    automaticFill: false,
    fullyAutomaticRecommendation: false,
  },
  kakaoDiscoveryEnabled: false,
  allowedMapProviders: ["tour"],
  mapCatalog: {
    defaultProviders: ["tour"],
    fallbackSource: "public_catalog",
    snapshotDatasets: ["core", "shopping"],
    snapshotCategories: [
      "attraction",
      "park_walk",
      "leisure",
      "camping",
      "food",
      "cafe",
      "accommodation",
      "other",
    ],
    availableCategories: ["attraction", "food", "cafe", "accommodation", "shopping", "other"],
    deferredCategories: ["shopping"],
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
  defaultMapLevel: 8,
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

function createProgressiveKtoMapRegion<TId extends RegionId>(input: {
  id: TId;
  displayName: string;
  legalDongRegionCode: string;
  legacyTourismAreaCode: string;
  administrativeAddressPrefixes: readonly string[];
  defaultMapCenter: Coordinates;
  defaultMapLevel?: number;
  mapBounds: RegionBounds;
  districts: readonly RegionDistrictConfig[];
  administrativeCodeSystem?: KtoAdministrativeCodeSystem;
  registryVersion?: string;
  maxRawRecords: number;
  maxRawRecordsPerDistrict: number;
  maxDetailedRecords: number;
}) {
  const registryVersion = input.registryVersion ?? `tour-${input.id}-service2-v1`;
  return {
    id: input.id,
    displayName: input.displayName,
    providerCodes: {
      korPetTourService2: { legalDongRegionCode: input.legalDongRegionCode },
      legacyTourismAreaCode: input.legacyTourismAreaCode,
    },
    mapEnabled: true,
    ktoCatalogEnabled: true,
    ktoCollection: {
      provider: "tour",
      listOperation: "areaBasedList2",
      administrativeCodeSystem: input.administrativeCodeSystem ?? "legal_dong",
      datasets: [
        {
          id: "core",
          evidenceCollectionMode: "detailed",
          contentTypeIds: KTO_CATALOG_CONTENT_TYPE_IDS,
        },
        {
          id: "shopping",
          evidenceCollectionMode: "list_only",
          contentTypeIds: ["38"],
        },
      ],
      administrativeAddressPrefixes: input.administrativeAddressPrefixes,
      collectorVersion: "tour-service2-region-collector-v3",
      registryVersion,
      cacheNamespace: registryVersion,
      limits: {
        listPageSize: 500,
        maxListPages: 100,
        maxRawRecords: input.maxRawRecords,
        maxRawRecordsPerDistrict: input.maxRawRecordsPerDistrict,
        maxAcceptedRecords: input.maxRawRecords,
        maxDetailedRecords: input.maxDetailedRecords,
      },
    },
    itineraryEnabled: false,
    routeCapabilities: {
      selectedPlaceRouting: true,
      automaticFill: false,
      fullyAutomaticRecommendation: false,
    },
    kakaoDiscoveryEnabled: false,
    allowedMapProviders: ["tour"],
    mapCatalog: {
      defaultProviders: ["tour"],
      fallbackSource: "public_catalog",
      snapshotDatasets: ["core", "shopping"],
      snapshotCategories: [
        "attraction",
        "park_walk",
        "leisure",
        "camping",
        "food",
        "cafe",
        "accommodation",
        "other",
      ],
      availableCategories: ["attraction", "food", "cafe", "accommodation", "shopping", "other"],
      deferredCategories: ["shopping"],
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
    defaultMapCenter: input.defaultMapCenter,
    defaultMapLevel: input.defaultMapLevel ?? 9,
    mapBounds: input.mapBounds,
    itineraryOriginBorderToleranceMeters: 500,
    districts: input.districts,
    wideSearchCenters: [],
  } as const satisfies RegionConfig<TId>;
}

const INCHEON_DISTRICT_CONFIGS = [
  { legalDongDistrictCode: "125", name: "제물포구" },
  { legalDongDistrictCode: "155", name: "영종구" },
  { legalDongDistrictCode: "177", name: "미추홀구" },
  { legalDongDistrictCode: "185", name: "연수구" },
  { legalDongDistrictCode: "200", name: "남동구" },
  { legalDongDistrictCode: "237", name: "부평구" },
  { legalDongDistrictCode: "245", name: "계양구" },
  { legalDongDistrictCode: "275", name: "서해구" },
  { legalDongDistrictCode: "290", name: "검단구" },
  { legalDongDistrictCode: "710", name: "강화군" },
  { legalDongDistrictCode: "720", name: "옹진군" },
] as const satisfies readonly RegionDistrictConfig[];

export const INCHEON_REGION_CONFIG = createProgressiveKtoMapRegion({
  id: "incheon",
  displayName: "인천",
  legalDongRegionCode: "28",
  legacyTourismAreaCode: "2",
  administrativeAddressPrefixes: ["인천", "인천광역시"],
  defaultMapCenter: { latitude: 37.4563, longitude: 126.7052 },
  mapBounds: { west: 124.4, south: 36.9, east: 126.9, north: 38.0 },
  districts: INCHEON_DISTRICT_CONFIGS,
  registryVersion: "tour-incheon-service2-v2",
  maxRawRecords: 6_000,
  maxRawRecordsPerDistrict: 2_000,
  maxDetailedRecords: 300,
});

const GYEONGGI_DISTRICT_CONFIGS = [
  {
    legalDongDistrictCode: "110",
    name: "수원시",
    collectionLegalDongDistrictCodes: ["111", "113", "115", "117"],
  },
  {
    legalDongDistrictCode: "130",
    name: "성남시",
    collectionLegalDongDistrictCodes: ["131", "133", "135"],
  },
  { legalDongDistrictCode: "150", name: "의정부시" },
  {
    legalDongDistrictCode: "170",
    name: "안양시",
    collectionLegalDongDistrictCodes: ["171", "173"],
  },
  {
    legalDongDistrictCode: "190",
    name: "부천시",
    collectionLegalDongDistrictCodes: ["192", "194", "196"],
  },
  { legalDongDistrictCode: "210", name: "광명시" },
  { legalDongDistrictCode: "220", name: "평택시" },
  { legalDongDistrictCode: "250", name: "동두천시" },
  {
    legalDongDistrictCode: "270",
    name: "안산시",
    collectionLegalDongDistrictCodes: ["271", "273"],
  },
  {
    legalDongDistrictCode: "280",
    name: "고양시",
    collectionLegalDongDistrictCodes: ["281", "285", "287"],
  },
  { legalDongDistrictCode: "290", name: "과천시" },
  { legalDongDistrictCode: "310", name: "구리시" },
  { legalDongDistrictCode: "360", name: "남양주시" },
  { legalDongDistrictCode: "370", name: "오산시" },
  { legalDongDistrictCode: "390", name: "시흥시" },
  { legalDongDistrictCode: "410", name: "군포시" },
  { legalDongDistrictCode: "430", name: "의왕시" },
  { legalDongDistrictCode: "450", name: "하남시" },
  {
    legalDongDistrictCode: "460",
    name: "용인시",
    collectionLegalDongDistrictCodes: ["461", "463", "465"],
  },
  { legalDongDistrictCode: "480", name: "파주시" },
  { legalDongDistrictCode: "500", name: "이천시" },
  { legalDongDistrictCode: "550", name: "안성시" },
  { legalDongDistrictCode: "570", name: "김포시" },
  {
    legalDongDistrictCode: "590",
    name: "화성시",
    collectionLegalDongDistrictCodes: ["591", "593", "595", "597"],
  },
  { legalDongDistrictCode: "610", name: "광주시" },
  { legalDongDistrictCode: "630", name: "양주시" },
  { legalDongDistrictCode: "650", name: "포천시" },
  { legalDongDistrictCode: "670", name: "여주시" },
  { legalDongDistrictCode: "800", name: "연천군" },
  { legalDongDistrictCode: "820", name: "가평군" },
  { legalDongDistrictCode: "830", name: "양평군" },
] as const satisfies readonly RegionDistrictConfig[];

export const GYEONGGI_REGION_CONFIG = createProgressiveKtoMapRegion({
  id: "gyeonggi",
  displayName: "경기",
  legalDongRegionCode: "41",
  legacyTourismAreaCode: "31",
  administrativeAddressPrefixes: ["경기", "경기도"],
  defaultMapCenter: { latitude: 37.4138, longitude: 127.5183 },
  mapBounds: { west: 126.45, south: 36.8, east: 127.9, north: 38.35 },
  districts: GYEONGGI_DISTRICT_CONFIGS,
  registryVersion: "tour-gyeonggi-service2-v2",
  maxRawRecords: 18_000,
  maxRawRecordsPerDistrict: 2_000,
  maxDetailedRecords: 700,
});

function areaCodeDistricts(
  entries: readonly (readonly [string, string])[],
): readonly RegionDistrictConfig[] {
  return entries.map(([providerCode, name]) => ({
    legalDongDistrictCode: providerCode.padStart(3, "0"),
    name,
    collectionAreaDistrictCodes: [providerCode],
  }));
}

function createAreaCodeKtoMapRegion(input: {
  id: RegionId;
  displayName: string;
  legalDongRegionCode: string;
  legacyTourismAreaCode: string;
  administrativeAddressPrefixes: readonly string[];
  defaultMapCenter: Coordinates;
  defaultMapLevel: number;
  mapBounds: RegionBounds;
  districts: readonly (readonly [string, string])[];
}) {
  return createProgressiveKtoMapRegion({
    ...input,
    administrativeCodeSystem: "area_code",
    districts: areaCodeDistricts(input.districts),
    maxRawRecords: 25_000,
    maxRawRecordsPerDistrict: 5_000,
    maxDetailedRecords: 2_000,
  });
}

export const DAEJEON_REGION_CONFIG = createAreaCodeKtoMapRegion({
  id: "daejeon", displayName: "대전", legalDongRegionCode: "30",
  legacyTourismAreaCode: "3", administrativeAddressPrefixes: ["대전", "대전광역시"],
  defaultMapCenter: { latitude: 36.3504, longitude: 127.3845 }, defaultMapLevel: 8,
  mapBounds: { west: 127.18, south: 36.14, east: 127.57, north: 36.52 },
  districts: [["1", "대덕구"], ["2", "동구"], ["3", "서구"], ["4", "유성구"], ["5", "중구"]],
});

export const DAEGU_REGION_CONFIG = createAreaCodeKtoMapRegion({
  id: "daegu", displayName: "대구", legalDongRegionCode: "27",
  legacyTourismAreaCode: "4", administrativeAddressPrefixes: ["대구", "대구광역시"],
  defaultMapCenter: { latitude: 35.8714, longitude: 128.6014 }, defaultMapLevel: 9,
  mapBounds: { west: 128.32, south: 35.55, east: 129.0, north: 36.1 },
  districts: [["1", "남구"], ["2", "달서구"], ["3", "달성군"], ["4", "동구"], ["5", "북구"], ["6", "서구"], ["7", "수성구"], ["8", "중구"], ["9", "군위군"]],
});

export const GWANGJU_REGION_CONFIG = createAreaCodeKtoMapRegion({
  id: "gwangju", displayName: "광주", legalDongRegionCode: "29",
  legacyTourismAreaCode: "5", administrativeAddressPrefixes: ["광주", "광주광역시"],
  defaultMapCenter: { latitude: 35.1595, longitude: 126.8526 }, defaultMapLevel: 8,
  mapBounds: { west: 126.62, south: 34.95, east: 127.02, north: 35.35 },
  districts: [["1", "광산구"], ["2", "남구"], ["3", "동구"], ["4", "북구"], ["5", "서구"]],
});

export const ULSAN_REGION_CONFIG = createAreaCodeKtoMapRegion({
  id: "ulsan", displayName: "울산", legalDongRegionCode: "31",
  legacyTourismAreaCode: "7", administrativeAddressPrefixes: ["울산", "울산광역시"],
  defaultMapCenter: { latitude: 35.5384, longitude: 129.3114 }, defaultMapLevel: 9,
  mapBounds: { west: 128.95, south: 35.3, east: 129.5, north: 35.75 },
  districts: [["1", "중구"], ["2", "남구"], ["3", "동구"], ["4", "북구"], ["5", "울주군"]],
});

export const SEJONG_REGION_CONFIG = createAreaCodeKtoMapRegion({
  id: "sejong", displayName: "세종", legalDongRegionCode: "36",
  legacyTourismAreaCode: "8", administrativeAddressPrefixes: ["세종", "세종특별자치시"],
  defaultMapCenter: { latitude: 36.48, longitude: 127.289 }, defaultMapLevel: 9,
  mapBounds: { west: 127.08, south: 36.34, east: 127.47, north: 36.72 },
  districts: [["1", "세종특별자치시"]],
});

export const GANGWON_REGION_CONFIG = createAreaCodeKtoMapRegion({
  id: "gangwon", displayName: "강원", legalDongRegionCode: "51",
  legacyTourismAreaCode: "32", administrativeAddressPrefixes: ["강원", "강원특별자치도"],
  defaultMapCenter: { latitude: 37.8228, longitude: 128.1555 }, defaultMapLevel: 11,
  mapBounds: { west: 127.02, south: 36.85, east: 129.45, north: 38.7 },
  districts: [["1", "강릉시"], ["2", "고성군"], ["3", "동해시"], ["4", "삼척시"], ["5", "속초시"], ["6", "양구군"], ["7", "양양군"], ["8", "영월군"], ["9", "원주시"], ["10", "인제군"], ["11", "정선군"], ["12", "철원군"], ["13", "춘천시"], ["14", "태백시"], ["15", "평창군"], ["16", "홍천군"], ["17", "화천군"], ["18", "횡성군"]],
});

export const CHUNGBUK_REGION_CONFIG = createAreaCodeKtoMapRegion({
  id: "chungbuk", displayName: "충북", legalDongRegionCode: "43",
  legacyTourismAreaCode: "33", administrativeAddressPrefixes: ["충북", "충청북도"],
  defaultMapCenter: { latitude: 36.8, longitude: 127.7 }, defaultMapLevel: 10,
  mapBounds: { west: 127.25, south: 36.0, east: 128.65, north: 37.25 },
  districts: [["1", "괴산군"], ["2", "단양군"], ["3", "보은군"], ["4", "영동군"], ["5", "옥천군"], ["6", "음성군"], ["7", "제천시"], ["8", "진천군"], ["9", "청원군"], ["10", "청주시"], ["11", "충주시"], ["12", "증평군"]],
});

export const CHUNGNAM_REGION_CONFIG = createAreaCodeKtoMapRegion({
  id: "chungnam", displayName: "충남", legalDongRegionCode: "44",
  legacyTourismAreaCode: "34", administrativeAddressPrefixes: ["충남", "충청남도"],
  defaultMapCenter: { latitude: 36.5184, longitude: 126.8 }, defaultMapLevel: 10,
  mapBounds: { west: 125.9, south: 35.95, east: 127.65, north: 37.05 },
  districts: [["1", "공주시"], ["2", "금산군"], ["3", "논산시"], ["4", "당진시"], ["5", "보령시"], ["6", "부여군"], ["7", "서산시"], ["8", "서천군"], ["9", "아산시"], ["11", "예산군"], ["12", "천안시"], ["13", "청양군"], ["14", "태안군"], ["15", "홍성군"], ["16", "계룡시"]],
});

export const GYEONGBUK_REGION_CONFIG = createAreaCodeKtoMapRegion({
  id: "gyeongbuk", displayName: "경북", legalDongRegionCode: "47",
  legacyTourismAreaCode: "35", administrativeAddressPrefixes: ["경북", "경상북도"],
  defaultMapCenter: { latitude: 36.4919, longitude: 128.8889 }, defaultMapLevel: 11,
  mapBounds: { west: 127.95, south: 35.5, east: 131.0, north: 37.55 },
  districts: [["1", "경산시"], ["2", "경주시"], ["3", "고령군"], ["4", "구미시"], ["6", "김천시"], ["7", "문경시"], ["8", "봉화군"], ["9", "상주시"], ["10", "성주군"], ["11", "안동시"], ["12", "영덕군"], ["13", "영양군"], ["14", "영주시"], ["15", "영천시"], ["16", "예천군"], ["17", "울릉군"], ["18", "울진군"], ["19", "의성군"], ["20", "청도군"], ["21", "청송군"], ["22", "칠곡군"], ["23", "포항시"]],
});

export const GYEONGNAM_REGION_CONFIG = createAreaCodeKtoMapRegion({
  id: "gyeongnam", displayName: "경남", legalDongRegionCode: "48",
  legacyTourismAreaCode: "36", administrativeAddressPrefixes: ["경남", "경상남도"],
  defaultMapCenter: { latitude: 35.4606, longitude: 128.2132 }, defaultMapLevel: 10,
  mapBounds: { west: 127.45, south: 34.55, east: 129.25, north: 35.95 },
  districts: [["1", "거제시"], ["2", "거창군"], ["3", "고성군"], ["4", "김해시"], ["5", "남해군"], ["6", "마산시"], ["7", "밀양시"], ["8", "사천시"], ["9", "산청군"], ["10", "양산시"], ["12", "의령군"], ["13", "진주시"], ["14", "진해시"], ["15", "창녕군"], ["16", "창원시"], ["17", "통영시"], ["18", "하동군"], ["19", "함안군"], ["20", "함양군"], ["21", "합천군"]],
});

export const JEONBUK_REGION_CONFIG = createAreaCodeKtoMapRegion({
  id: "jeonbuk", displayName: "전북", legalDongRegionCode: "52",
  legacyTourismAreaCode: "37", administrativeAddressPrefixes: ["전북", "전북특별자치도"],
  defaultMapCenter: { latitude: 35.7175, longitude: 127.153 }, defaultMapLevel: 10,
  mapBounds: { west: 126.35, south: 35.25, east: 127.95, north: 36.25 },
  districts: [["1", "고창군"], ["2", "군산시"], ["3", "김제시"], ["4", "남원시"], ["5", "무주군"], ["6", "부안군"], ["7", "순창군"], ["8", "완주군"], ["9", "익산시"], ["10", "임실군"], ["11", "장수군"], ["12", "전주시"], ["13", "정읍시"], ["14", "진안군"]],
});

export const JEONNAM_REGION_CONFIG = createAreaCodeKtoMapRegion({
  id: "jeonnam", displayName: "전남", legalDongRegionCode: "46",
  legacyTourismAreaCode: "38", administrativeAddressPrefixes: ["전남", "전라남도"],
  defaultMapCenter: { latitude: 34.8679, longitude: 126.991 }, defaultMapLevel: 11,
  mapBounds: { west: 125.85, south: 33.85, east: 127.9, north: 35.5 },
  districts: [["1", "강진군"], ["2", "고흥군"], ["3", "곡성군"], ["4", "광양시"], ["5", "구례군"], ["6", "나주시"], ["7", "담양군"], ["8", "목포시"], ["9", "무안군"], ["10", "보성군"], ["11", "순천시"], ["12", "신안군"], ["13", "여수시"], ["16", "영광군"], ["17", "영암군"], ["18", "완도군"], ["19", "장성군"], ["20", "장흥군"], ["21", "진도군"], ["22", "함평군"], ["23", "해남군"], ["24", "화순군"]],
});

export const REGION_CONFIGS = [
  SEOUL_REGION_CONFIG,
  INCHEON_REGION_CONFIG,
  DAEJEON_REGION_CONFIG,
  DAEGU_REGION_CONFIG,
  GWANGJU_REGION_CONFIG,
  BUSAN_REGION_CONFIG,
  ULSAN_REGION_CONFIG,
  SEJONG_REGION_CONFIG,
  GYEONGGI_REGION_CONFIG,
  GANGWON_REGION_CONFIG,
  CHUNGBUK_REGION_CONFIG,
  CHUNGNAM_REGION_CONFIG,
  GYEONGBUK_REGION_CONFIG,
  GYEONGNAM_REGION_CONFIG,
  JEONBUK_REGION_CONFIG,
  JEONNAM_REGION_CONFIG,
  JEJU_REGION_CONFIG,
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

export function getRegionRouteCapabilityBlock(
  region: RegionConfig,
  request: { selectedPlaceCount: number; autoFill: boolean },
): RegionRouteCapabilityBlock | null {
  if (request.selectedPlaceCount > 0) {
    if (!region.routeCapabilities.selectedPlaceRouting) {
      return "selected_place_routing";
    }
    if (request.autoFill && !region.routeCapabilities.automaticFill) {
      return "automatic_fill";
    }
    return null;
  }
  return region.routeCapabilities.fullyAutomaticRecommendation
    ? null
    : "fully_automatic_recommendation";
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
