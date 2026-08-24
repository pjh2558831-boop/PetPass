import "server-only";

import {
  createTrustedTourPetAccessInput,
  evaluateTourPetAccess,
} from "@/lib/pet-access/tourism/evaluator";
import { coordinatesInRegion, JEJU_REGION_CONFIG } from "@/lib/regions/config";
import {
  JEJU_KTO_COLLECTOR_VERSION,
  JEJU_KTO_DISTRICTS,
  JEJU_KTO_LEGAL_REGION_CODE,
  JEJU_KTO_PROVIDER,
  JEJU_KTO_REGION_ID,
  JEJU_KTO_REGISTRY_VERSION,
  type JejuKtoCatalogAudit,
  type JejuKtoCatalogCollection,
  type JejuKtoDistrictCode,
  type KtoCatalogCategory,
  type KtoCatalogCollectionRepository,
  type KtoCatalogDistrictAudit,
  type KtoCatalogDistrictCollection,
  type KtoCatalogExecutionMode,
  type KtoCatalogListRecord,
  type KtoCatalogMapPlace,
  type KtoCatalogMissingFieldCounts,
  type KtoCatalogProvider,
  type KtoCatalogRejectionCode,
  type KtoCatalogRunId,
  type KtoCatalogRunScope,
} from "@/lib/tour-api/collection/contracts";
import {
  collectionErrorCode,
  JejuKtoCollectionError,
} from "@/lib/tour-api/collection/errors";
import type { TourContentTypeId, TourPlaceDetail, TourPlaceSummary } from "@/types/place";
import type { TourPetAccessVerdict } from "@/types/tour-pet-access";

const LIST_PAGE_SIZE = 500;
const MAX_LIST_PAGES = 20;
const MAX_RAW_RECORDS_PER_DISTRICT = 300;
const MAX_ACCEPTED_RECORDS_PER_DISTRICT = 150;
const ACCEPTED_CONTENT_TYPES = new Set<TourContentTypeId>([
  "12",
  "14",
  "15",
  "28",
  "32",
  "39",
]);

function increment<T extends string>(counts: Partial<Record<T, number>>, key: T): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function emptyMissingFields(): KtoCatalogMissingFieldCounts {
  return { address: 0, phone: 0, image: 0, detailPetTour: 0 };
}

function emptyAudit(
  districtCode: JejuKtoDistrictCode,
  districtName: string,
): KtoCatalogDistrictAudit {
  return {
    districtCode,
    districtName,
    rawCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    duplicateCount: 0,
    imageCoveredCount: 0,
    detailPetTourCoveredCount: 0,
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

function primaryValidation(
  record: KtoCatalogListRecord,
  districtCode: JejuKtoDistrictCode,
  audit: KtoCatalogDistrictAudit,
): TourPlaceSummary | null {
  const { summary } = record;
  if (!summary || !/^[1-9][0-9]*$/u.test(summary.contentId)) {
    return reject(audit, "invalid_content_id");
  }
  if (!record.authoritativeLegalRegionCode) {
    return reject(audit, "administrative_region_missing");
  }
  if (record.authoritativeLegalRegionCode !== JEJU_KTO_LEGAL_REGION_CODE) {
    return reject(audit, "administrative_region_mismatch");
  }
  if (!record.authoritativeLegalDistrictCode) {
    return reject(audit, "administrative_district_missing");
  }
  if (record.authoritativeLegalDistrictCode !== districtCode) {
    return reject(audit, "administrative_district_mismatch");
  }
  if (summary.providerContentTypeId === "38") {
    return reject(audit, "shopping_content_type");
  }
  if (
    !summary.contentTypeId ||
    !ACCEPTED_CONTENT_TYPES.has(summary.contentTypeId) ||
    summary.category === "unknown" ||
    summary.category === "transportation" ||
    summary.category === "shopping"
  ) {
    return reject(audit, "unsupported_content_type");
  }
  if (!summary.title?.trim()) return reject(audit, "missing_title");
  if (summary.latitude === null || summary.longitude === null) {
    return reject(audit, "missing_coordinates");
  }
  if (!coordinatesInRegion(JEJU_REGION_CONFIG, {
    latitude: summary.latitude,
    longitude: summary.longitude,
  })) {
    return reject(audit, "out_of_region_coordinates");
  }
  return summary;
}

function validateDetail(
  list: TourPlaceSummary,
  detail: TourPlaceDetail,
  districtCode: JejuKtoDistrictCode,
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
    summary.legalRegionCode !== JEJU_KTO_LEGAL_REGION_CODE ||
    summary.legalDistrictCode !== districtCode
  ) {
    reject(audit, "detail_administrative_mismatch");
    return false;
  }
  if (
    summary.latitude === null ||
    summary.longitude === null ||
    !coordinatesInRegion(JEJU_REGION_CONFIG, {
      latitude: summary.latitude,
      longitude: summary.longitude,
    })
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
  list: TourPlaceSummary,
  detail: TourPlaceDetail,
  districtCode: JejuKtoDistrictCode,
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
      region_id: JEJU_KTO_REGION_ID,
      provider: JEJU_KTO_PROVIDER,
      provider_place_id: list.contentId,
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

async function listAllDistrictRecords(
  provider: KtoCatalogProvider,
  districtCode: JejuKtoDistrictCode,
): Promise<KtoCatalogListRecord[]> {
  const records: KtoCatalogListRecord[] = [];
  let expectedTotal: number | null = null;
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    let response;
    try {
      response = await provider.listDistrict({
        regionCode: JEJU_KTO_LEGAL_REGION_CODE,
        districtCode,
        page,
        pageSize: LIST_PAGE_SIZE,
      });
    } catch (error) {
      throw new JejuKtoCollectionError(
        "PROVIDER_FAILURE",
        `KTO areaBasedList2 failed for Jeju district ${districtCode}.`,
        error,
      );
    }
    if (
      !Number.isInteger(response.totalCount) ||
      response.totalCount < 0 ||
      !Number.isInteger(response.page) ||
      response.page < 1 ||
      !Array.isArray(response.records)
    ) {
      throw new JejuKtoCollectionError(
        "INVALID_PROVIDER_RESULT",
        `KTO returned malformed pagination metadata for Jeju district ${districtCode}.`,
      );
    }
    if (expectedTotal === null) {
      expectedTotal = response.totalCount;
      if (expectedTotal > MAX_RAW_RECORDS_PER_DISTRICT) {
        throw new JejuKtoCollectionError(
          "INVALID_PROVIDER_RESULT",
          `KTO Jeju district ${districtCode} exceeded the reviewed audit size.`,
        );
      }
      if (expectedTotal === 0 || response.records.length === 0) {
        throw new JejuKtoCollectionError(
          "SUSPICIOUS_EMPTY_RESULT",
          `KTO returned a structurally empty Jeju district ${districtCode} catalog.`,
        );
      }
    } else if (response.totalCount !== expectedTotal) {
      throw new JejuKtoCollectionError(
        "INVALID_PROVIDER_RESULT",
        `KTO totalCount changed while reading Jeju district ${districtCode}.`,
      );
    }
    records.push(...response.records);
    if (records.length >= expectedTotal) break;
    if (response.records.length === 0) {
      throw new JejuKtoCollectionError(
        "INCOMPLETE_PAGINATION",
        `KTO pagination ended early for Jeju district ${districtCode}.`,
      );
    }
  }
  if (expectedTotal === null || records.length !== expectedTotal) {
    throw new JejuKtoCollectionError(
      "INCOMPLETE_PAGINATION",
      `KTO pagination did not yield its declared total for Jeju district ${districtCode}.`,
    );
  }
  return records;
}

async function collectDistrict(
  provider: KtoCatalogProvider,
  district: (typeof JEJU_KTO_DISTRICTS)[number],
  fetchedAt: string,
  globallySeen: Set<string>,
): Promise<KtoCatalogDistrictCollection> {
  const audit = emptyAudit(district.code, district.name);
  const raw = await listAllDistrictRecords(provider, district.code);
  audit.rawCount = raw.length;
  const accepted: TourPlaceSummary[] = [];
  for (const record of raw) {
    increment(
      audit.rawContentTypeCounts,
      record.summary?.providerContentTypeId ?? "missing",
    );
    const value = primaryValidation(record, district.code, audit);
    if (!value) continue;
    if (globallySeen.has(value.contentId)) {
      audit.duplicateCount += 1;
      continue;
    }
    globallySeen.add(value.contentId);
    accepted.push(value);
  }
  if (accepted.length > MAX_ACCEPTED_RECORDS_PER_DISTRICT) {
    throw new JejuKtoCollectionError(
      "INVALID_PROVIDER_RESULT",
      `KTO Jeju district ${district.code} exceeded the safe detail audit limit.`,
    );
  }

  const rows: KtoCatalogMapPlace[] = [];
  for (const list of accepted) {
    let detail: TourPlaceDetail;
    try {
      detail = await provider.getPlaceDetail(
        list.contentId,
        list.contentTypeId as TourContentTypeId,
      );
    } catch (error) {
      throw new JejuKtoCollectionError(
        "PROVIDER_FAILURE",
        "KTO detail collection failed for a Jeju catalog record.",
        error,
      );
    }
    if (!validateDetail(list, detail, district.code, audit)) continue;
    const mapped = mapRow(list, detail, district.code, district.name, fetchedAt);
    rows.push(mapped.row);
    audit.acceptedCount += 1;
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
  return { districtCode: district.code, rows, audit };
}

function mergeCounts<T extends string>(
  target: Partial<Record<T, number>>,
  source: Partial<Record<T, number>>,
): void {
  for (const [key, value] of Object.entries(source) as Array<[T, number]>) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function combinedAudit(
  generatedAt: string,
  districts: Record<JejuKtoDistrictCode, KtoCatalogDistrictCollection>,
): JejuKtoCatalogAudit {
  const totals: JejuKtoCatalogAudit["totals"] = {
    rawCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    duplicateCount: 0,
    imageCoveredCount: 0,
    detailPetTourCoveredCount: 0,
    rawContentTypeCounts: {},
    categoryCounts: {},
    verdictCounts: {},
    rejectionCounts: {},
    missingFieldCounts: emptyMissingFields(),
  };
  for (const { audit } of Object.values(districts)) {
    totals.rawCount += audit.rawCount;
    totals.acceptedCount += audit.acceptedCount;
    totals.rejectedCount += audit.rejectedCount;
    totals.duplicateCount += audit.duplicateCount;
    totals.imageCoveredCount += audit.imageCoveredCount;
    totals.detailPetTourCoveredCount += audit.detailPetTourCoveredCount;
    mergeCounts(totals.rawContentTypeCounts, audit.rawContentTypeCounts);
    mergeCounts(totals.categoryCounts, audit.categoryCounts);
    mergeCounts(totals.verdictCounts, audit.verdictCounts);
    mergeCounts(totals.rejectionCounts, audit.rejectionCounts);
    for (const key of Object.keys(totals.missingFieldCounts) as Array<keyof KtoCatalogMissingFieldCounts>) {
      totals.missingFieldCounts[key] += audit.missingFieldCounts[key];
    }
  }
  return {
    regionId: JEJU_KTO_REGION_ID,
    legalDongRegionCode: JEJU_KTO_LEGAL_REGION_CODE,
    provider: JEJU_KTO_PROVIDER,
    generatedAt,
    districts: {
      "110": districts["110"].audit,
      "130": districts["130"].audit,
    },
    totals,
  };
}

export async function collectJejuKtoCatalog(input: {
  provider: KtoCatalogProvider;
  now?: () => Date;
  completedDistricts?: readonly KtoCatalogDistrictCollection[];
  onDistrictCollected?: (district: KtoCatalogDistrictCollection) => Promise<void>;
}): Promise<JejuKtoCatalogCollection> {
  const generatedAt = (input.now ?? (() => new Date()))().toISOString();
  const completed = new Map(
    (input.completedDistricts ?? []).map((district) => [district.districtCode, district]),
  );
  const globallySeen = new Set(
    [...completed.values()].flatMap(({ rows }) => rows.map((row) => row.provider_place_id)),
  );
  const districts = {} as Record<JejuKtoDistrictCode, KtoCatalogDistrictCollection>;
  for (const district of JEJU_KTO_DISTRICTS) {
    const existing = completed.get(district.code);
    const result = existing ?? await collectDistrict(
      input.provider,
      district,
      generatedAt,
      globallySeen,
    );
    districts[district.code] = result;
    if (!existing) await input.onDistrictCollected?.(result);
  }
  const rows = JEJU_KTO_DISTRICTS.flatMap(({ code }) => districts[code].rows);
  if (rows.length === 0) {
    throw new JejuKtoCollectionError(
      "SUSPICIOUS_EMPTY_RESULT",
      "KTO returned no acceptable Jeju catalog records.",
    );
  }
  return {
    rows,
    districts,
    audit: combinedAudit(generatedAt, districts),
  };
}

export async function executeJejuKtoCollection(input: {
  mode?: KtoCatalogExecutionMode;
  scope?: KtoCatalogRunScope;
  provider: KtoCatalogProvider;
  repository?: KtoCatalogCollectionRepository;
  resumeRunId?: KtoCatalogRunId;
  now?: () => Date;
}) {
  const mode = input.mode ?? "dry-run";
  const scope = input.scope ?? "full";
  const now = input.now ?? (() => new Date());
  if (mode === "dry-run") {
    const collection = await collectJejuKtoCatalog({ provider: input.provider, now });
    return { mode, scope, ...collection, database: null };
  }
  if (!input.repository) {
    throw new JejuKtoCollectionError(
      "CONFIGURATION",
      "Apply mode requires the server-only KTO catalog repository.",
    );
  }
  const scopeInput = {
    regionId: JEJU_KTO_REGION_ID,
    provider: JEJU_KTO_PROVIDER,
    scope,
    districtCodes: JEJU_KTO_DISTRICTS.map(({ code }) => code),
  } as const;
  const startedAt = now().toISOString();
  let runId: KtoCatalogRunId | undefined;
  try {
    const session = input.resumeRunId === undefined
      ? await input.repository.startRun({
          ...scopeInput,
          collectorVersion: JEJU_KTO_COLLECTOR_VERSION,
          registryVersion: JEJU_KTO_REGISTRY_VERSION,
          startedAt,
        })
      : await input.repository.resumeRun({
          ...scopeInput,
          runId: input.resumeRunId,
        });
    runId = session.runId;
    const collection = await collectJejuKtoCatalog({
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
          regionId: JEJU_KTO_REGION_ID,
          provider: JEJU_KTO_PROVIDER,
          errorCode: collectionErrorCode(error),
          completedAt: now().toISOString(),
        });
      } catch {
        // Preserve the original provider/validation failure without leaking DB details.
      }
    }
    if (error instanceof JejuKtoCollectionError) throw error;
    throw new JejuKtoCollectionError(
      "DATABASE_FAILURE",
      "Jeju KTO catalog apply failed before activation completed.",
      error,
    );
  }
}
