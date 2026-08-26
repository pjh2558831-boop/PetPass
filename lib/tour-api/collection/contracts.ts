import "server-only";

import { JEJU_REGION_CONFIG } from "@/lib/regions/config";
import type {
  TourContentTypeId,
  TourOperationName,
  TourPlaceDetail,
  TourPlaceSummary,
} from "@/types/place";
import type { TourPetAccessVerdict } from "@/types/tour-pet-access";

export const KTO_CATALOG_PROVIDER = "tour" as const;
export const KTO_CATALOG_RUN_SCOPES = ["full", "delta"] as const;

// Compatibility exports for Phase 3/4 callers. The generic collector itself
// resolves every value from its supplied region descriptor.
export const JEJU_KTO_REGION_ID = JEJU_REGION_CONFIG.id;
export const JEJU_KTO_PROVIDER = KTO_CATALOG_PROVIDER;
export const JEJU_KTO_LEGAL_REGION_CODE =
  JEJU_REGION_CONFIG.providerCodes.korPetTourService2.legalDongRegionCode;
export const JEJU_KTO_DISTRICTS = JEJU_REGION_CONFIG.districts.map(
  ({ legalDongDistrictCode: code, name }) => ({ code, name }),
);
export const JEJU_KTO_COLLECTOR_VERSION =
  JEJU_REGION_CONFIG.ktoCollection.collectorVersion;
export const JEJU_KTO_REGISTRY_VERSION =
  JEJU_REGION_CONFIG.ktoCollection.registryVersion;

export type JejuKtoDistrictCode = "110" | "130";
export type KtoCatalogRunScope = (typeof KTO_CATALOG_RUN_SCOPES)[number];
export type KtoCatalogExecutionMode = "dry-run" | "apply";

export interface KtoCatalogListRecord {
  summary: TourPlaceSummary | null;
  /** Read only from Service2 lDongRegnCd/ldongregncd, never areaCode. */
  authoritativeLegalRegionCode: string | null;
  /** Read only from Service2 lDongSignguCd/ldongsigngucd. */
  authoritativeLegalDistrictCode: string | null;
}

export interface KtoCatalogListPage {
  records: KtoCatalogListRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface KtoProviderRequestAudit {
  liveProviderCallCount: number;
  operationCallCounts: Partial<Record<TourOperationName, number>>;
}

export interface KtoCatalogProvider {
  listDistrict(input: {
    regionCode: string;
    districtCode: string;
    page: number;
    pageSize: number;
  }): Promise<KtoCatalogListPage>;
  getPlaceDetail(
    contentId: string,
    contentTypeId: TourContentTypeId,
  ): Promise<TourPlaceDetail>;
  getRequestAudit?(): KtoProviderRequestAudit;
}

export type KtoCatalogCategory = Exclude<
  TourPlaceSummary["category"],
  "shopping" | "transportation" | "unknown"
>;

export interface KtoCatalogMapPlace {
  region_id: string;
  provider: typeof KTO_CATALOG_PROVIDER;
  provider_place_id: string;
  name: string;
  category_group: KtoCatalogCategory;
  category_code: string | null;
  content_type_id: number;
  road_address: string | null;
  lot_address: string | null;
  district_code: string;
  district_name: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  image_url: string | null;
  source_url: string | null;
  provider_visibility: "exposed" | "not_exposed" | "unknown" | "provider_unavailable";
  pet_evidence_status: "official_verified" | "official_unknown";
  pet_evidence: Record<string, unknown>;
  pet_notes: string;
  fetched_at: string;
}

export type KtoCatalogRejectionCode =
  | "invalid_content_id"
  | "unsupported_content_type"
  | "shopping_content_type"
  | "missing_title"
  | "missing_coordinates"
  | "out_of_region_coordinates"
  | "administrative_region_missing"
  | "administrative_region_mismatch"
  | "administrative_district_missing"
  | "administrative_district_mismatch"
  | "administrative_address_missing"
  | "administrative_address_mismatch"
  | "detail_identity_mismatch"
  | "detail_administrative_mismatch"
  | "detail_address_mismatch"
  | "detail_coordinate_mismatch";

export interface KtoCatalogMissingFieldCounts {
  address: number;
  phone: number;
  image: number;
  detailPetTour: number;
}

export interface KtoCatalogDistrictAudit {
  districtCode: string;
  districtName: string;
  rawCount: number;
  acceptedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  imageCoveredCount: number;
  detailPetTourCoveredCount: number;
  rawContentTypeCounts: Record<string, number>;
  categoryCounts: Partial<Record<KtoCatalogCategory, number>>;
  verdictCounts: Partial<Record<TourPetAccessVerdict, number>>;
  rejectionCounts: Partial<Record<KtoCatalogRejectionCode, number>>;
  missingFieldCounts: KtoCatalogMissingFieldCounts;
}

export interface KtoCatalogAudit {
  regionId: string;
  legalDongRegionCode: string;
  provider: typeof KTO_CATALOG_PROVIDER;
  registryVersion: string;
  cacheNamespace: string;
  generatedAt: string;
  districts: Record<string, KtoCatalogDistrictAudit>;
  providerRequests: KtoProviderRequestAudit | null;
  totals: Omit<
    KtoCatalogDistrictAudit,
    "districtCode" | "districtName" | "rawContentTypeCounts" | "categoryCounts" |
      "verdictCounts" | "rejectionCounts" | "missingFieldCounts"
  > & {
    rawContentTypeCounts: Record<string, number>;
    categoryCounts: Partial<Record<KtoCatalogCategory, number>>;
    verdictCounts: Partial<Record<TourPetAccessVerdict, number>>;
    rejectionCounts: Partial<Record<KtoCatalogRejectionCode, number>>;
    missingFieldCounts: KtoCatalogMissingFieldCounts;
  };
}

export type JejuKtoCatalogAudit = KtoCatalogAudit;

export interface KtoCatalogDistrictCollection {
  districtCode: string;
  rows: KtoCatalogMapPlace[];
  audit: KtoCatalogDistrictAudit;
}

export interface KtoCatalogCollection {
  rows: KtoCatalogMapPlace[];
  audit: KtoCatalogAudit;
  districts: Record<string, KtoCatalogDistrictCollection>;
}

export type JejuKtoCatalogCollection = KtoCatalogCollection;
export type KtoCatalogRunId = string | number;

export interface KtoCatalogRunSession {
  runId: KtoCatalogRunId;
  completedDistrictCodes: ReadonlySet<string>;
  completedDistricts?: readonly KtoCatalogDistrictCollection[];
}

export interface KtoCatalogRunScopeInput {
  regionId: string;
  provider: typeof KTO_CATALOG_PROVIDER;
  scope: KtoCatalogRunScope;
  districtCodes: readonly string[];
  registryVersion: string;
}

export interface KtoCatalogCollectionRepository {
  startRun(
    input: KtoCatalogRunScopeInput & {
      collectorVersion: string;
      startedAt: string;
    },
  ): Promise<KtoCatalogRunSession>;
  resumeRun(
    input: KtoCatalogRunScopeInput & { runId: KtoCatalogRunId },
  ): Promise<KtoCatalogRunSession>;
  checkpointDistrict(
    input: KtoCatalogRunScopeInput & KtoCatalogDistrictCollection & {
      runId: KtoCatalogRunId;
      completedAt: string;
    },
  ): Promise<void>;
  markFailed(input: {
    runId: KtoCatalogRunId;
    regionId: string;
    provider: typeof KTO_CATALOG_PROVIDER;
    errorCode: string;
    completedAt: string;
  }): Promise<void>;
  finalizeCompletedRun(
    input: KtoCatalogRunScopeInput & {
      runId: KtoCatalogRunId;
      audit: KtoCatalogAudit;
      completedAt: string;
    },
  ): Promise<{
    insertedRowCount: number;
    updatedRowCount: number;
    deactivatedRowCount: number;
  }>;
}
