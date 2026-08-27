import "server-only";

import {
  createTrustedTourPetAccessInput,
  evaluateTourPetAccess,
} from "@/lib/pet-access/tourism/evaluator";
import {
  JEJU_REGION_CONFIG,
  coordinatesInRegion,
  type KtoCollectionPartitionConfig,
  type KtoCollectionEnabledRegionConfig,
} from "@/lib/regions/config";
import {
  KTO_CATALOG_PROVIDER,
  type KtoCatalogAudit,
  type KtoCatalogCategory,
  type KtoCatalogCollection,
  type KtoCatalogCollectionRepository,
  type KtoCatalogDistrictAudit,
  type KtoCatalogDistrictCollection,
  type KtoCatalogExecutionMode,
  type KtoCatalogListRecord,
  type KtoCatalogMapPlace,
  type KtoCatalogMissingFieldCounts,
  type KtoCatalogProvider,
  type KtoProviderRequestAudit,
  type KtoCatalogRejectionCode,
  type KtoCatalogRunId,
  type KtoCatalogRunScope,
} from "@/lib/tour-api/collection/contracts";
import {
  KtoCatalogCollectionError,
  collectionErrorCode,
} from "@/lib/tour-api/collection/errors";
import type { TourContentTypeId, TourPlaceDetail, TourPlaceSummary } from "@/types/place";
import type { TourPetAccessVerdict } from "@/types/tour-pet-access";

interface CollectionBudget {
  rawCount: number;
  acceptedCount: number;
  detailedCount: number;
}

interface ValidatedListRecord {
  summary: TourPlaceSummary;
  dataset: KtoCollectionPartitionConfig;
}

function increment<T extends string>(counts: Partial<Record<T, number>>, key: T): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function emptyMissingFields(): KtoCatalogMissingFieldCounts {
  return { address: 0, phone: 0, image: 0, detailPetTour: 0 };
}

function emptyAudit(districtCode: string, districtName: string): KtoCatalogDistrictAudit {
  return {
    districtCode,
    districtName,
    rawCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    duplicateCount: 0,
    imageCoveredCount: 0,
    detailPetTourCoveredCount: 0,
    detailedRecordCount: 0,
    listOnlyRecordCount: 0,
    datasetCounts: { core: 0, shopping: 0 },
    rawContentTypeCounts: {},
    categoryCounts: {},
    verdictCounts: {},
    rejectionCounts: {},
    missingFieldCounts: emptyMissingFields(),
  };
}

function reject(
  audit: KtoCatalogDistrictAudit,
  code: KtoCatalogRejectionCode,
): null {
  audit.rejectedCount += 1;
  increment(audit.rejectionCounts, code);
  return null;
}

function addressMatchesDistrict(
  region: KtoCollectionEnabledRegionConfig<string>,
  districtName: string,
  roadAddress: string | null,
  lotAddress: string | null,
): "missing" | "match" | "mismatch" {
  const addresses = [roadAddress, lotAddress]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  if (addresses.length === 0) return "missing";
  return addresses.some((address) =>
    region.ktoCollection.administrativeAddressPrefixes.some((prefix) =>
      address.startsWith(`${prefix} ${districtName}`)))
    ? "match"
    : "mismatch";
}

function primaryValidation(
  region: KtoCollectionEnabledRegionConfig<string>,
  record: KtoCatalogListRecord,
  districtCode: string,
  districtName: string,
  audit: KtoCatalogDistrictAudit,
): ValidatedListRecord | null {
  const { summary } = record;
  if (!summary || !/^[1-9][0-9]*$/u.test(summary.contentId)) {
    return reject(audit, "invalid_content_id");
  }
  const legalRegionCode =
    region.providerCodes.korPetTourService2.legalDongRegionCode;
  if (!record.authoritativeLegalRegionCode) {
    return reject(audit, "administrative_region_missing");
  }
  if (record.authoritativeLegalRegionCode !== legalRegionCode) {
    return reject(audit, "administrative_region_mismatch");
  }
  if (!record.authoritativeLegalDistrictCode) {
    return reject(audit, "administrative_district_missing");
  }
  if (record.authoritativeLegalDistrictCode !== districtCode) {
    return reject(audit, "administrative_district_mismatch");
  }
  const dataset = region.ktoCollection.datasets.find(({ contentTypeIds }) =>
    summary.contentTypeId !== null && contentTypeIds.includes(summary.contentTypeId));
  if (!dataset && summary.providerContentTypeId === "38") {
    return reject(audit, "shopping_content_type");
  }
  if (
    !summary.contentTypeId ||
    !dataset ||
    summary.category === "unknown" ||
    summary.category === "transportation" ||
    (dataset.id === "shopping" && summary.category !== "shopping") ||
    (dataset.id === "core" && summary.category === "shopping")
  ) {
    return reject(audit, "unsupported_content_type");
  }
  if (!summary.title?.trim()) return reject(audit, "missing_title");
  if (summary.latitude === null || summary.longitude === null) {
    return reject(audit, "missing_coordinates");
  }
  if (!coordinatesInRegion(region, {
    latitude: summary.latitude,
    longitude: summary.longitude,
  })) {
    return reject(audit, "out_of_region_coordinates");
  }
  const addressResult = addressMatchesDistrict(
    region,
    districtName,
    summary.address,
    summary.detailAddress,
  );
  if (addressResult === "missing") return reject(audit, "administrative_address_missing");
  if (addressResult === "mismatch") return reject(audit, "administrative_address_mismatch");
  return { summary, dataset };
}

function validateDetail(
  region: KtoCollectionEnabledRegionConfig<string>,
  list: TourPlaceSummary,
  detail: TourPlaceDetail,
  districtCode: string,
  districtName: string,
  audit: KtoCatalogDistrictAudit,
): boolean {
  const summary = detail.summary;
  if (
    summary.contentId !== list.contentId ||
    summary.providerContentTypeId !== list.providerContentTypeId
  ) {
    reject(audit, "detail_identity_mismatch");
    return false;
  }
  if (
    summary.legalRegionCode !==
      region.providerCodes.korPetTourService2.legalDongRegionCode ||
    summary.legalDistrictCode !== districtCode
  ) {
    reject(audit, "detail_administrative_mismatch");
    return false;
  }
  if (
    addressMatchesDistrict(
      region,
      districtName,
      summary.address,
      summary.detailAddress,
    ) !== "match"
  ) {
    reject(audit, "detail_address_mismatch");
    return false;
  }
  if (
    summary.latitude === null ||
    summary.longitude === null ||
    !coordinatesInRegion(region, {
      latitude: summary.latitude,
      longitude: summary.longitude,
    }) ||
    list.latitude === null ||
    list.longitude === null ||
    Math.abs(summary.latitude - list.latitude) > 0.000_001 ||
    Math.abs(summary.longitude - list.longitude) > 0.000_001
  ) {
    reject(audit, "detail_coordinate_mismatch");
    return false;
  }
  return true;
}

function hasDetailPetTour(detail: TourPlaceDetail): boolean {
  return Boolean(
    detail.normalizedPetEvidence &&
      !["absent", "empty", "provider_unavailable"].includes(
        detail.normalizedPetEvidence.availability,
      ),
  );
}

function mapRow(
  region: KtoCollectionEnabledRegionConfig<string>,
  list: TourPlaceSummary,
  detail: TourPlaceDetail,
  districtCode: string,
  districtName: string,
  fetchedAt: string,
): { row: KtoCatalogMapPlace; verdict: TourPetAccessVerdict; detailPetTour: boolean } {
  const assessment = evaluateTourPetAccess(createTrustedTourPetAccessInput(detail));
  const imageUrl = detail.summary.imageUrl ?? detail.summary.thumbnailUrl ??
    list.imageUrl ?? list.thumbnailUrl ?? null;
  const detailPetTour = hasDetailPetTour(detail);
  const category = list.category as KtoCatalogCategory;
  return {
    verdict: assessment.verdict,
    detailPetTour,
    row: {
      region_id: region.id,
      provider: KTO_CATALOG_PROVIDER,
      provider_place_id: list.contentId,
      catalog_dataset: "core",
      evidence_collection_mode: "detailed",
      name: list.title as string,
      category_group: category,
      category_code:
        list.classificationCodes.smallCategory ??
        list.classificationCodes.tertiary,
      content_type_id: Number(list.contentTypeId),
      road_address: list.address,
      lot_address: list.detailAddress,
      district_code: districtCode,
      district_name: districtName,
      latitude: detail.summary.latitude as number,
      longitude: detail.summary.longitude as number,
      phone: detail.summary.phone ?? list.phone,
      image_url: imageUrl,
      source_url: detail.homepageUrl,
      provider_visibility: detail.summary.providerVisibility?.status ?? "unknown",
      pet_evidence_status:
        assessment.verdict === "unknown" ? "official_unknown" : "official_verified",
      pet_evidence: {
        source: {
          provider: "Korea Tourism Organization",
          operations: ["areaBasedList2", "detailCommon2", "detailIntro2", "detailPetTour2"],
          contentId: list.contentId,
          retrievedAt: detail.source.retrievedAt,
          providerModifiedTime: detail.providerModifiedTime,
        },
        detailPetTourAvailability:
          detail.normalizedPetEvidence?.availability ?? "absent",
        assessment,
      },
      pet_notes: assessment.summary,
      fetched_at: fetchedAt,
    },
  };
}

function mapListOnlyRow(
  region: KtoCollectionEnabledRegionConfig<string>,
  list: TourPlaceSummary,
  districtCode: string,
  districtName: string,
  fetchedAt: string,
): KtoCatalogMapPlace {
  return {
    region_id: region.id,
    provider: KTO_CATALOG_PROVIDER,
    provider_place_id: list.contentId,
    catalog_dataset: "shopping",
    evidence_collection_mode: "list_only",
    name: list.title as string,
    category_group: "shopping",
    category_code:
      list.classificationCodes.smallCategory ??
      list.classificationCodes.tertiary,
    content_type_id: 38,
    road_address: list.address,
    lot_address: list.detailAddress,
    district_code: districtCode,
    district_name: districtName,
    latitude: list.latitude as number,
    longitude: list.longitude as number,
    phone: list.phone,
    image_url: list.imageUrl ?? list.thumbnailUrl ?? null,
    source_url: null,
    provider_visibility: list.providerVisibility?.status ?? "unknown",
    pet_evidence_status: "official_unknown",
    pet_evidence: {
      source: {
        provider: "Korea Tourism Organization",
        operations: ["areaBasedList2"],
        contentId: list.contentId,
        retrievedAt: list.source.retrievedAt,
        providerModifiedTime: list.modifiedTime,
      },
      collectionMode: "list_only",
      verificationStatus: "verification_required",
      assessment: {
        verdict: "unknown",
        summary: "반려동물 동반 정책을 확인하지 못했습니다.",
        reasonCodes: ["KTO_LIST_METADATA_ONLY"],
      },
    },
    pet_notes: "반려동물 동반 정책을 확인하지 못해 방문 전 확인이 필요합니다.",
    fetched_at: fetchedAt,
  };
}

function assertRegionDescriptor(
  region: KtoCollectionEnabledRegionConfig<string>,
): void {
  const legalRegionCode =
    region.providerCodes.korPetTourService2.legalDongRegionCode;
  const districtCodes = region.districts.map(
    ({ legalDongDistrictCode }) => legalDongDistrictCode,
  );
  const districtPairs = region.districts.map(
    ({ legalDongDistrictCode, name }) => `${legalDongDistrictCode}:${name}`,
  );
  const limits = region.ktoCollection.limits;
  const datasets = region.ktoCollection.datasets;
  const datasetIds = datasets.map(({ id }) => id);
  const contentTypeIds = datasets.flatMap(({ contentTypeIds: ids }) => ids);
  if (
    !/^[a-z][a-z0-9_-]*$/u.test(region.id) ||
    !/^\d{2}$/u.test(legalRegionCode) ||
    !region.ktoCatalogEnabled ||
    !region.allowedMapProviders.includes(KTO_CATALOG_PROVIDER) ||
    region.ktoCollection.provider !== KTO_CATALOG_PROVIDER ||
    region.districts.length === 0 ||
    new Set(districtCodes).size !== districtCodes.length ||
    new Set(districtPairs).size !== districtPairs.length ||
    region.districts.some(({ legalDongDistrictCode, name }) =>
      !/^\d{3}$/u.test(legalDongDistrictCode) || !name.trim()) ||
    datasets.length === 0 ||
    new Set(datasetIds).size !== datasetIds.length ||
    new Set(contentTypeIds).size !== contentTypeIds.length ||
    datasets.some(({ id, evidenceCollectionMode, contentTypeIds: ids }) =>
      ids.length === 0 ||
      (id === "core" && (
        evidenceCollectionMode !== "detailed" || ids.includes("38")
      )) ||
      (id === "shopping" && (
        evidenceCollectionMode !== "list_only" ||
        ids.length !== 1 ||
        ids[0] !== "38"
      ))) ||
    !Number.isInteger(limits.listPageSize) || limits.listPageSize <= 0 ||
    !Number.isInteger(limits.maxListPages) || limits.maxListPages <= 0 ||
    !Number.isInteger(limits.maxRawRecords) || limits.maxRawRecords <= 0 ||
    !Number.isInteger(limits.maxRawRecordsPerDistrict) ||
      limits.maxRawRecordsPerDistrict <= 0 ||
    !Number.isInteger(limits.maxAcceptedRecords) || limits.maxAcceptedRecords <= 0 ||
    !Number.isInteger(limits.maxDetailedRecords) || limits.maxDetailedRecords <= 0 ||
    limits.maxDetailedRecords > limits.maxAcceptedRecords
  ) {
    throw new KtoCatalogCollectionError(
      "CONFIGURATION",
      "Invalid KTO collection region descriptor.",
    );
  }
}

async function listAllDistrictRecords(
  region: KtoCollectionEnabledRegionConfig<string>,
  provider: KtoCatalogProvider,
  districtCode: string,
): Promise<KtoCatalogListRecord[]> {
  const records: KtoCatalogListRecord[] = [];
  const limits = region.ktoCollection.limits;
  let expectedTotal: number | null = null;
  for (let page = 1; page <= limits.maxListPages; page += 1) {
    let response;
    try {
      response = await provider.listDistrict({
        regionCode: region.providerCodes.korPetTourService2.legalDongRegionCode,
        districtCode,
        page,
        pageSize: limits.listPageSize,
      });
    } catch (error) {
      throw new KtoCatalogCollectionError(
        "PROVIDER_FAILURE",
        `KTO areaBasedList2 failed for ${region.id} district ${districtCode}.`,
        error,
      );
    }
    if (
      !Number.isInteger(response.totalCount) ||
      response.totalCount < 0 ||
      response.page !== page ||
      !Number.isInteger(response.pageSize) ||
      response.pageSize <= 0 ||
      response.pageSize > limits.listPageSize ||
      !Array.isArray(response.records) ||
      response.records.length > response.pageSize
    ) {
      throw new KtoCatalogCollectionError(
        "INVALID_PROVIDER_RESULT",
        `KTO returned malformed or drifting pagination for ${region.id} district ${districtCode}.`,
      );
    }
    if (expectedTotal === null) {
      expectedTotal = response.totalCount;
      if (expectedTotal > limits.maxRawRecordsPerDistrict) {
        throw new KtoCatalogCollectionError(
          "INVALID_PROVIDER_RESULT",
          `KTO ${region.id} district ${districtCode} exceeded the audited row limit.`,
        );
      }
      if (expectedTotal === 0 || response.records.length === 0) {
        throw new KtoCatalogCollectionError(
          "SUSPICIOUS_EMPTY_RESULT",
          `KTO returned a structurally empty ${region.id} district ${districtCode} catalog.`,
        );
      }
    } else if (response.totalCount !== expectedTotal) {
      throw new KtoCatalogCollectionError(
        "INVALID_PROVIDER_RESULT",
        `KTO totalCount changed for ${region.id} district ${districtCode}.`,
      );
    }
    if (records.length + response.records.length > expectedTotal) {
      throw new KtoCatalogCollectionError(
        "INVALID_PROVIDER_RESULT",
        `KTO pagination exceeded totalCount for ${region.id} district ${districtCode}.`,
      );
    }
    records.push(...response.records);
    if (records.length === expectedTotal) break;
    if (response.records.length === 0) {
      throw new KtoCatalogCollectionError(
        "INCOMPLETE_PAGINATION",
        `KTO pagination ended early for ${region.id} district ${districtCode}.`,
      );
    }
  }
  if (expectedTotal === null || records.length !== expectedTotal) {
    throw new KtoCatalogCollectionError(
      "INCOMPLETE_PAGINATION",
      `KTO pagination did not yield its declared total for ${region.id} district ${districtCode}.`,
    );
  }
  return records;
}

async function collectDistrict(
  region: KtoCollectionEnabledRegionConfig<string>,
  provider: KtoCatalogProvider,
  district: KtoCollectionEnabledRegionConfig<string>["districts"][number],
  fetchedAt: string,
  globallySeen: Set<string>,
  budget: CollectionBudget,
): Promise<KtoCatalogDistrictCollection> {
  const districtCode = district.legalDongDistrictCode;
  const audit = emptyAudit(districtCode, district.name);
  const raw = await listAllDistrictRecords(region, provider, districtCode);
  audit.rawCount = raw.length;
  budget.rawCount += raw.length;
  if (budget.rawCount > region.ktoCollection.limits.maxRawRecords) {
    throw new KtoCatalogCollectionError(
      "INVALID_PROVIDER_RESULT",
      `KTO ${region.id} catalog exceeded the audited regional row limit.`,
    );
  }
  const accepted: ValidatedListRecord[] = [];
  for (const record of raw) {
    increment(
      audit.rawContentTypeCounts,
      record.summary?.providerContentTypeId ?? "missing",
    );
    const value = primaryValidation(
      region,
      record,
      districtCode,
      district.name,
      audit,
    );
    if (!value) continue;
    if (globallySeen.has(value.summary.contentId)) {
      audit.duplicateCount += 1;
      continue;
    }
    globallySeen.add(value.summary.contentId);
    accepted.push(value);
  }
  budget.acceptedCount += accepted.length;
  if (budget.acceptedCount > region.ktoCollection.limits.maxAcceptedRecords) {
    throw new KtoCatalogCollectionError(
      "INVALID_PROVIDER_RESULT",
      `KTO ${region.id} catalog exceeded the approved accepted-record limit.`,
    );
  }
  budget.detailedCount += accepted.filter(
    ({ dataset }) => dataset.evidenceCollectionMode === "detailed",
  ).length;
  if (budget.detailedCount > region.ktoCollection.limits.maxDetailedRecords) {
    throw new KtoCatalogCollectionError(
      "INVALID_PROVIDER_RESULT",
      `KTO ${region.id} catalog exceeded the approved detail traversal limit.`,
    );
  }

  const rows: KtoCatalogMapPlace[] = [];
  for (const { summary: list, dataset } of accepted) {
    if (dataset.evidenceCollectionMode === "list_only") {
      const row = mapListOnlyRow(
        region,
        list,
        districtCode,
        district.name,
        fetchedAt,
      );
      rows.push(row);
      audit.acceptedCount += 1;
      audit.listOnlyRecordCount += 1;
      audit.datasetCounts[row.catalog_dataset] += 1;
      increment(audit.categoryCounts, row.category_group);
      increment(audit.verdictCounts, "unknown");
      if (row.image_url) audit.imageCoveredCount += 1;
      else audit.missingFieldCounts.image += 1;
      if (!row.road_address && !row.lot_address) {
        audit.missingFieldCounts.address += 1;
      }
      if (!row.phone) audit.missingFieldCounts.phone += 1;
      continue;
    }
    let detail: TourPlaceDetail;
    try {
      detail = await provider.getPlaceDetail(
        list.contentId,
        list.contentTypeId as TourContentTypeId,
      );
    } catch (error) {
      throw new KtoCatalogCollectionError(
        "PROVIDER_FAILURE",
        `KTO detail collection failed for a ${region.id} catalog record.`,
        error,
      );
    }
    if (!validateDetail(region, list, detail, districtCode, district.name, audit)) {
      continue;
    }
    const mapped = mapRow(
      region,
      list,
      detail,
      districtCode,
      district.name,
      fetchedAt,
    );
    rows.push(mapped.row);
    audit.acceptedCount += 1;
    audit.detailedRecordCount += 1;
    audit.datasetCounts[mapped.row.catalog_dataset] += 1;
    increment(audit.categoryCounts, mapped.row.category_group);
    increment(audit.verdictCounts, mapped.verdict);
    if (mapped.row.image_url) audit.imageCoveredCount += 1;
    else audit.missingFieldCounts.image += 1;
    if (mapped.detailPetTour) audit.detailPetTourCoveredCount += 1;
    else audit.missingFieldCounts.detailPetTour += 1;
    if (!mapped.row.road_address && !mapped.row.lot_address) {
      audit.missingFieldCounts.address += 1;
    }
    if (!mapped.row.phone) audit.missingFieldCounts.phone += 1;
  }
  return { districtCode, rows, audit };
}

function mergeCounts<T extends string>(
  target: Partial<Record<T, number>>,
  source: Partial<Record<T, number>>,
): void {
  for (const [key, value] of Object.entries(source) as Array<[T, number]>) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function validatedProviderRequestAudit(
  region: KtoCollectionEnabledRegionConfig<string>,
  provider: KtoCatalogProvider,
): KtoProviderRequestAudit | null {
  const audit = provider.getRequestAudit?.() ?? null;
  if (!audit) return null;
  const counts = audit.operationCallCounts;
  const values = Object.values(counts);
  const maxListCalls =
    region.districts.length * region.ktoCollection.limits.maxListPages;
  const maxDetailCalls = region.ktoCollection.limits.maxDetailedRecords;
  if (
    !Number.isInteger(audit.liveProviderCallCount) ||
    audit.liveProviderCallCount < 0 ||
    values.some((value) =>
      value === undefined || !Number.isInteger(value) || value < 0) ||
    audit.liveProviderCallCount !== values.reduce((total, value) => total + value, 0) ||
    (counts.areaBasedList2 ?? 0) > maxListCalls ||
    (counts.detailCommon2 ?? 0) > maxDetailCalls ||
    (counts.detailIntro2 ?? 0) > maxDetailCalls ||
    (counts.detailPetTour2 ?? 0) > maxDetailCalls ||
    (counts.petTourSyncList2 ?? 0) > 0 ||
    audit.liveProviderCallCount > maxListCalls + (maxDetailCalls * 3)
  ) {
    throw new KtoCatalogCollectionError(
      "INVALID_PROVIDER_RESULT",
      `KTO ${region.id} provider calls exceeded the audited traversal limits.`,
    );
  }
  return audit;
}

function combinedAudit(
  region: KtoCollectionEnabledRegionConfig<string>,
  provider: KtoCatalogProvider,
  generatedAt: string,
  districts: Record<string, KtoCatalogDistrictCollection>,
): KtoCatalogAudit {
  const totals: KtoCatalogAudit["totals"] = {
    rawCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    duplicateCount: 0,
    imageCoveredCount: 0,
    detailPetTourCoveredCount: 0,
    detailedRecordCount: 0,
    listOnlyRecordCount: 0,
    datasetCounts: { core: 0, shopping: 0 },
    rawContentTypeCounts: {},
    categoryCounts: {},
    verdictCounts: {},
    rejectionCounts: {},
    missingFieldCounts: emptyMissingFields(),
  };
  const districtAudits: Record<string, KtoCatalogDistrictAudit> = {};
  for (const district of region.districts) {
    const audit = districts[district.legalDongDistrictCode].audit;
    districtAudits[district.legalDongDistrictCode] = audit;
    totals.rawCount += audit.rawCount;
    totals.acceptedCount += audit.acceptedCount;
    totals.rejectedCount += audit.rejectedCount;
    totals.duplicateCount += audit.duplicateCount;
    totals.imageCoveredCount += audit.imageCoveredCount;
    totals.detailPetTourCoveredCount += audit.detailPetTourCoveredCount;
    totals.detailedRecordCount += audit.detailedRecordCount;
    totals.listOnlyRecordCount += audit.listOnlyRecordCount;
    totals.datasetCounts.core += audit.datasetCounts.core;
    totals.datasetCounts.shopping += audit.datasetCounts.shopping;
    mergeCounts(totals.rawContentTypeCounts, audit.rawContentTypeCounts);
    mergeCounts(totals.categoryCounts, audit.categoryCounts);
    mergeCounts(totals.verdictCounts, audit.verdictCounts);
    mergeCounts(totals.rejectionCounts, audit.rejectionCounts);
    for (const key of Object.keys(totals.missingFieldCounts) as Array<
      keyof KtoCatalogMissingFieldCounts
    >) {
      totals.missingFieldCounts[key] += audit.missingFieldCounts[key];
    }
  }
  return {
    regionId: region.id,
    legalDongRegionCode:
      region.providerCodes.korPetTourService2.legalDongRegionCode,
    provider: KTO_CATALOG_PROVIDER,
    registryVersion: region.ktoCollection.registryVersion,
    cacheNamespace: region.ktoCollection.cacheNamespace,
    generatedAt,
    districts: districtAudits,
    providerRequests: validatedProviderRequestAudit(region, provider),
    totals,
  };
}

function assertCompletedDistricts(
  region: KtoCollectionEnabledRegionConfig<string>,
  completedDistricts: readonly KtoCatalogDistrictCollection[],
): void {
  const districts = new Map(region.districts.map((district) => [
    district.legalDongDistrictCode,
    district.name,
  ]));
  const seen = new Set<string>();
  for (const completed of completedDistricts) {
    const districtName = districts.get(completed.districtCode);
    if (
      !districtName ||
      seen.has(completed.districtCode) ||
      completed.audit.districtCode !== completed.districtCode ||
      completed.audit.districtName !== districtName ||
      completed.rows.length !== completed.audit.acceptedCount ||
      completed.rows.some((row) =>
        row.region_id !== region.id ||
        row.provider !== KTO_CATALOG_PROVIDER ||
        !region.ktoCollection.datasets.some((dataset) =>
          dataset.id === row.catalog_dataset &&
          dataset.evidenceCollectionMode === row.evidence_collection_mode &&
          dataset.contentTypeIds.includes(String(row.content_type_id) as TourContentTypeId)) ||
        row.district_code !== completed.districtCode ||
        row.district_name !== districtName)
    ) {
      throw new KtoCatalogCollectionError(
        "DATABASE_FAILURE",
        "Stored KTO resume checkpoint does not match the requested region scope.",
      );
    }
    seen.add(completed.districtCode);
  }
}

export async function collectKtoCatalog(input: {
  region: KtoCollectionEnabledRegionConfig<string>;
  provider: KtoCatalogProvider;
  now?: () => Date;
  completedDistricts?: readonly KtoCatalogDistrictCollection[];
  onDistrictCollected?: (district: KtoCatalogDistrictCollection) => Promise<void>;
}): Promise<KtoCatalogCollection> {
  assertRegionDescriptor(input.region);
  const generatedAt = (input.now ?? (() => new Date()))().toISOString();
  const completedDistricts = input.completedDistricts ?? [];
  assertCompletedDistricts(input.region, completedDistricts);
  const completed = new Map(
    completedDistricts.map((district) => [district.districtCode, district]),
  );
  const globallySeen = new Set(
    [...completed.values()].flatMap(({ rows }) =>
      rows.map((row) => row.provider_place_id)),
  );
  const budget: CollectionBudget = {
    rawCount: [...completed.values()].reduce(
      (total, district) => total + district.audit.rawCount,
      0,
    ),
    acceptedCount: [...completed.values()].reduce(
      (total, district) => total + district.audit.acceptedCount,
      0,
    ),
    detailedCount: [...completed.values()].reduce(
      (total, district) => total + district.audit.detailedRecordCount,
      0,
    ),
  };
  const districts: Record<string, KtoCatalogDistrictCollection> = {};
  for (const district of input.region.districts) {
    const code = district.legalDongDistrictCode;
    const existing = completed.get(code);
    const result = existing ?? await collectDistrict(
      input.region,
      input.provider,
      district,
      generatedAt,
      globallySeen,
      budget,
    );
    districts[code] = result;
    if (!existing) await input.onDistrictCollected?.(result);
  }
  const rows = input.region.districts.flatMap(
    ({ legalDongDistrictCode }) => districts[legalDongDistrictCode].rows,
  );
  if (rows.length === 0) {
    throw new KtoCatalogCollectionError(
      "SUSPICIOUS_EMPTY_RESULT",
      `KTO returned no acceptable ${input.region.id} catalog records.`,
    );
  }
  return {
    rows,
    districts,
    audit: combinedAudit(input.region, input.provider, generatedAt, districts),
  };
}

export async function executeKtoCollection(input: {
  region: KtoCollectionEnabledRegionConfig<string>;
  mode?: KtoCatalogExecutionMode;
  scope?: KtoCatalogRunScope;
  provider: KtoCatalogProvider;
  repository?: KtoCatalogCollectionRepository;
  resumeRunId?: KtoCatalogRunId;
  now?: () => Date;
}) {
  assertRegionDescriptor(input.region);
  const mode = input.mode ?? "dry-run";
  const scope = input.scope ?? "full";
  const now = input.now ?? (() => new Date());
  if (mode === "dry-run") {
    if (input.resumeRunId !== undefined) {
      throw new KtoCatalogCollectionError(
        "CONFIGURATION",
        "Resume requires explicit apply mode.",
      );
    }
    const collection = await collectKtoCatalog({
      region: input.region,
      provider: input.provider,
      now,
    });
    return { mode, scope, ...collection, database: null };
  }
  if (!input.repository) {
    throw new KtoCatalogCollectionError(
      "CONFIGURATION",
      "Apply mode requires the server-only KTO catalog repository.",
    );
  }
  const scopeInput = {
    regionId: input.region.id,
    provider: KTO_CATALOG_PROVIDER,
    scope,
    districtCodes: input.region.districts.map(
      ({ legalDongDistrictCode }) => legalDongDistrictCode,
    ),
    registryVersion: input.region.ktoCollection.registryVersion,
  } as const;
  const startedAt = now().toISOString();
  let runId: KtoCatalogRunId | undefined;
  try {
    const session = input.resumeRunId === undefined
      ? await input.repository.startRun({
          ...scopeInput,
          collectorVersion: input.region.ktoCollection.collectorVersion,
          startedAt,
        })
      : await input.repository.resumeRun({
          ...scopeInput,
          runId: input.resumeRunId,
        });
    runId = session.runId;
    const collection = await collectKtoCatalog({
      region: input.region,
      provider: input.provider,
      now,
      completedDistricts: session.completedDistricts,
      onDistrictCollected: (district) => input.repository!.checkpointDistrict({
        ...scopeInput,
        ...district,
        runId: session.runId,
        completedAt: now().toISOString(),
      }),
    });
    const database = await input.repository.finalizeCompletedRun({
      ...scopeInput,
      runId: session.runId,
      audit: collection.audit,
      completedAt: now().toISOString(),
    });
    return { mode, scope, ...collection, database };
  } catch (error) {
    if (runId !== undefined) {
      try {
        await input.repository.markFailed({
          runId,
          regionId: input.region.id,
          provider: KTO_CATALOG_PROVIDER,
          errorCode: collectionErrorCode(error),
          completedAt: now().toISOString(),
        });
      } catch {
        // Preserve the original provider/validation failure without leaking DB details.
      }
    }
    if (error instanceof KtoCatalogCollectionError) throw error;
    throw new KtoCatalogCollectionError(
      "DATABASE_FAILURE",
      `${input.region.id} KTO catalog apply failed before activation completed.`,
      error,
    );
  }
}

export function collectJejuKtoCatalog(
  input: Omit<Parameters<typeof collectKtoCatalog>[0], "region">,
): Promise<KtoCatalogCollection> {
  return collectKtoCatalog({ ...input, region: JEJU_REGION_CONFIG });
}

export function executeJejuKtoCollection(
  input: Omit<Parameters<typeof executeKtoCollection>[0], "region">,
) {
  return executeKtoCollection({ ...input, region: JEJU_REGION_CONFIG });
}
