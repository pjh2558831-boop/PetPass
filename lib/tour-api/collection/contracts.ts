import "server-only";

import type { TourContentTypeId, TourPlaceDetail, TourPlaceSummary } from "@/types/place";
import type { TourPetAccessVerdict } from "@/types/tour-pet-access";

export const JEJU_KTO_REGION_ID = "jeju" as const;
export const JEJU_KTO_PROVIDER = "tour" as const;
export const JEJU_KTO_LEGAL_REGION_CODE = "50" as const;
export const JEJU_KTO_DISTRICTS = [
  { code: "110", name: "제주시" },
  { code: "130", name: "서귀포시" },
] as const;
export const JEJU_KTO_COLLECTOR_VERSION = "tour-jeju-service2-collector-v1";
export const JEJU_KTO_REGISTRY_VERSION = "tour-jeju-service2-v1";

export type JejuKtoDistrictCode = (typeof JEJU_KTO_DISTRICTS)[number]["code"];
export type KtoCatalogRunScope = "full" | "delta";
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

export interface KtoCatalogProvider {
  listDistrict(input: {
    regionCode: typeof JEJU_KTO_LEGAL_REGION_CODE;
    districtCode: JejuKtoDistrictCode;
    page: number;
    pageSize: number;
  }): Promise<KtoCatalogListPage>;
  getPlaceDetail(
    contentId: string,
    contentTypeId: TourContentTypeId,
  ): Promise<TourPlaceDetail>;
}

export type KtoCatalogCategory = Exclude<
  TourPlaceSummary["category"],
  "shopping" | "transportation" | "unknown"
>;

export interface KtoCatalogMapPlace {
  region_id: typeof JEJU_KTO_REGION_ID;
  provider: typeof JEJU_KTO_PROVIDER;
  provider_place_id: string;
  name: string;
  category_group: KtoCatalogCategory;
  category_code: string | null;
  content_type_id: number;
  road_address: string | null;
  lot_address: string | null;
  district_code: JejuKtoDistrictCode;
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
  | "detail_identity_mismatch"
  | "detail_administrative_mismatch"
  | "detail_coordinate_mismatch";

export interface KtoCatalogMissingFieldCounts {
  address: number;
  phone: number;
  image: number;
  detailPetTour: number;
}

export interface KtoCatalogDistrictAudit {
  districtCode: JejuKtoDistrictCode;
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

export interface JejuKtoCatalogAudit {
  regionId: typeof JEJU_KTO_REGION_ID;
  legalDongRegionCode: typeof JEJU_KTO_LEGAL_REGION_CODE;
  provider: typeof JEJU_KTO_PROVIDER;
  generatedAt: string;
  districts: Record<JejuKtoDistrictCode, KtoCatalogDistrictAudit>;
  totals: Omit<
    KtoCatalogDistrictAudit,
    "districtCode" | "districtName" | "rawContentTypeCounts" | "categoryCounts" | "verdictCounts" | "rejectionCounts" | "missingFieldCounts"
  > & {
    rawContentTypeCounts: Record<string, number>;
    categoryCounts: Partial<Record<KtoCatalogCategory, number>>;
    verdictCounts: Partial<Record<TourPetAccessVerdict, number>>;
    rejectionCounts: Partial<Record<KtoCatalogRejectionCode, number>>;
    missingFieldCounts: KtoCatalogMissingFieldCounts;
  };
}

export interface KtoCatalogDistrictCollection {
  districtCode: JejuKtoDistrictCode;
  rows: KtoCatalogMapPlace[];
  audit: KtoCatalogDistrictAudit;
}

export interface JejuKtoCatalogCollection {
  rows: KtoCatalogMapPlace[];
  audit: JejuKtoCatalogAudit;
  districts: Record<JejuKtoDistrictCode, KtoCatalogDistrictCollection>;
}

export type KtoCatalogRunId = string | number;

export interface KtoCatalogRunSession {
  runId: KtoCatalogRunId;
  completedDistrictCodes: ReadonlySet<JejuKtoDistrictCode>;
  completedDistricts?: readonly KtoCatalogDistrictCollection[];
}

export interface KtoCatalogRunScopeInput {
  regionId: typeof JEJU_KTO_REGION_ID;
  provider: typeof JEJU_KTO_PROVIDER;
  scope: KtoCatalogRunScope;
  districtCodes: readonly JejuKtoDistrictCode[];
}

export interface KtoCatalogCollectionRepository {
  startRun(
    input: KtoCatalogRunScopeInput & {
      collectorVersion: string;
      registryVersion: string;
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
    regionId: typeof JEJU_KTO_REGION_ID;
    provider: typeof JEJU_KTO_PROVIDER;
    errorCode: string;
    completedAt: string;
  }): Promise<void>;
  finalizeCompletedRun(
    input: KtoCatalogRunScopeInput & {
      runId: KtoCatalogRunId;
      audit: JejuKtoCatalogAudit;
      completedAt: string;
    },
  ): Promise<{
    insertedRowCount: number;
    updatedRowCount: number;
    deactivatedRowCount: number;
  }>;
}
