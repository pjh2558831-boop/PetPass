import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assessOperatingHours,
  type OperatingHoursAssessment,
} from "@/lib/itinerary/operating-hours";
import {
  evaluateAutomaticRouteEligibility,
  KTO_SERVICE2_NAME,
} from "@/lib/itinerary/automatic-route-eligibility";
import {
  createTrustedTourPetAccessInput,
  evaluateTourPetAccess,
} from "@/lib/pet-access/tourism/evaluator";
import { TourRequestCache } from "@/lib/tour-api/cache";
import { TourApiClient } from "@/lib/tour-api/client";
import { TourProviderError } from "@/lib/tour-api/errors";
import {
  extractSafeHomepageUrl,
  getTourProviderName,
  normalizeIntroPetPolicyEvidence,
  normalizePetPolicyEvidence,
  normalizeTourContentTypeId,
  normalizeTourIntroDetails,
  normalizeTourPlaceSummaries,
  normalizeTourPlaceSummary,
  sanitizeProviderText,
} from "@/lib/tour-api/normalizers";
import { normalizePetEvidence } from "@/lib/tour-api/pet-evidence";
import type {
  ParsedTourResponse,
  TourItem,
} from "@/lib/tour-api/schemas";
import {
  normalizeProviderVisibility,
  providerUnavailableVisibility,
} from "@/lib/tour-api/visibility";
import {
  createBoundedProviderFetch,
  groupSuppliedListJoinTargets,
  markdownCell,
  mergeAuditCandidateSeeds,
  sanitizeDiagnosticText,
  selectDeterministicCategorySample,
  sortAuditRows,
  stringifySanitizedArtifact,
  wasListedForAudit,
  type AuditCandidateSeed,
  type ProviderResponseObservation,
} from "@/scripts/lib/tour-contract-audit";
import type {
  ProviderVisibilityResult,
  TourContentTypeId,
  TourOperationName,
  TourPlaceDetail,
  TourPlaceSummary,
} from "@/types/place";
import type { AutomaticRouteProviderCallStatus } from "@/types/route-eligibility";

const LIVE_OPT_IN_ENV = "RUN_LIVE_TOUR_CONTRACT_AUDIT";
const SHOPPING_OPT_IN_ENV = "INCLUDE_TOUR_CONTRACT_SHOPPING";
const BUSAN_REGION_CODE = "26";
const MAIN_CONTENT_TYPES = ["12", "14", "15", "28", "32", "39"] as const;
const SHOPPING_CONTENT_TYPE = "38" as const;
const SUPPLIED_CONTENT_IDS = [
  "2930927",
  "4008098",
  "4012773",
  "4008808",
  "2927087",
  "132786",
  "126644",
  "2807380",
  "1887866",
  "1918646",
] as const;
const MAX_DETAILED_RECORDS = 60;
const SAMPLES_PER_CATEGORY = MAX_DETAILED_RECORDS;
const CATEGORY_PAGE_SIZE = 50;
const MAX_CATEGORY_PAGES = 2;
const SYNC_PAGE_SIZE = 50;
const MAX_SYNC_PAGES = 20;
const REGIONAL_JOIN_PAGE_SIZE = 100;
const MAX_REGIONAL_JOIN_PAGES = 5;
const MAX_PROVIDER_CALLS = 240;
const PROVIDER_CONCURRENCY = 3;
const DETAIL_WORKER_CONCURRENCY = 3;
const PROVIDER_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 15 * 60 * 1_000;
const AUDIT_TRAVEL_DATE = "2026-08-12";
const OUTPUT_DIRECTORY = resolve(
  "verification-evidence",
  "tour-service2-contract",
);

type ObservedProviderResponse = ProviderResponseObservation & {
  observedAt: string;
};

type ProviderOutcome =
  | { ok: true; response: ParsedTourResponse }
  | { ok: false; errorCode: string; callStatus: AutomaticRouteProviderCallStatus };

interface VisibilityEntry {
  summary: TourPlaceSummary | null;
  visibility: ProviderVisibilityResult;
}

interface VisibilityCollection {
  entries: Map<string, VisibilityEntry>;
  complete: boolean;
  pagesFetched: number;
  reasonCodes: string[];
}

interface CategoryCollection {
  summaries: TourPlaceSummary[];
  listContentIds: Set<string>;
  diagnostics: Array<{
    contentType: string;
    pagesFetched: number;
    normalizedRecords: number;
    availableRecords: number;
    complete: boolean;
    errorCode: string | null;
  }>;
}

interface RegionalJoinCollection {
  summaries: Map<string, TourPlaceSummary>;
  visibilityEntries: Map<string, VisibilityEntry>;
  listContentIds: Set<string>;
  listCallStatuses: Map<string, AutomaticRouteProviderCallStatus>;
  diagnostics: Array<{
    regionCode: string;
    districtCode: string | null;
    contentType: string;
    targetCount: number;
    listTargetCount: number;
    visibilityTargetCount: number;
    listPages: number;
    syncPages: number;
    listTargetsFound: number;
    visibilityTargetsFound: number;
    listCompleteForTargets: boolean;
    visibilityCompleteForTargets: boolean;
  }>;
}

interface AuditRow {
  contentId: string;
  title: string | null;
  contentType: string | null;
  category: string;
  sampleSource: AuditCandidateSeed["sampleSource"];
  suppliedId: boolean;
  listSuccess: boolean;
  visibilityField: string | null;
  visibilityRawValue: string | null;
  visibility: ProviderVisibilityResult["status"];
  visibilityReasonCodes: string[];
  commonDetail: string;
  introDetail: string;
  petDetail: string;
  petDetailItemPresent: boolean;
  nonEmptyPetDetailFields: string[];
  emptyPetDetailFields: string[];
  absentPetDetailFields: string[];
  providerPetItemsState: ProviderResponseObservation["itemsState"] | null;
  providerPetItemFieldNames: string[];
  providerShapeMatchesParser: boolean | null;
  parser: string;
  phase3: {
    verdict: string;
    evaluationState: string;
    reasonCodes: string[];
  };
  routeEligibility: {
    eligible: boolean;
    status: string;
    reasonCodes: string[];
    warnings: string[];
    evidenceFieldNames: string[];
  };
}

interface ProviderSupportRow {
  contentId: string;
  title: string | null;
  contentType: string | null;
  visibilityRawValue: string | null;
  visibilityField: string | null;
  operation: "detailPetTour2";
  providerResultCode: string | null;
  providerResultMessage: string | null;
  itemState: "absent" | "present_but_empty";
  requestDateTime: string;
}

function assertLiveOptIn(): void {
  if (process.env.CI !== undefined) {
    throw new Error("LIVE_TOUR_CONTRACT_AUDIT_DISABLED_IN_CI");
  }
  if (process.env[LIVE_OPT_IN_ENV] !== "1") {
    throw new Error(`LIVE_TOUR_CONTRACT_AUDIT_REQUIRES_${LIVE_OPT_IN_ENV}=1`);
  }
}

function loadLocalProviderEnvironment(): void {
  if (
    (!process.env.TOUR_API_SERVICE_KEY || !process.env.TOUR_API_BASE_URL) &&
    existsSync(".env.local")
  ) {
    process.loadEnvFile(".env.local");
  }
  if (!process.env.TOUR_API_SERVICE_KEY || !process.env.TOUR_API_BASE_URL) {
    throw new Error("TOUR_API_CONFIGURATION_REQUIRED");
  }
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function rawText(item: TourItem | null, key: string): string | null {
  if (!item) return null;
  const value = item[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstItem(outcome: ProviderOutcome): TourItem | null {
  return outcome.ok ? outcome.response.items[0] ?? null : null;
}

function stableRequestKey(
  operation: TourOperationName,
  params: Record<string, string>,
): string {
  return `${operation}:${Object.entries(params)
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")}`;
}

function providerFailure(error: unknown): {
  errorCode: string;
  callStatus: AutomaticRouteProviderCallStatus;
} {
  if (
    error instanceof Error &&
    error.message === "PROVIDER_CALL_LIMIT_REACHED"
  ) {
    throw error;
  }
  if (error instanceof TourProviderError) {
    return {
      errorCode: error.code,
      callStatus: ["INVALID_RESPONSE", "PROVIDER_REJECTED", "NOT_FOUND"].includes(
        error.code,
      )
        ? "invalid_response"
        : "provider_unavailable",
    };
  }
  return {
    errorCode:
      sanitizeDiagnosticText(error instanceof Error ? error.name : error, 80) ??
      "UNKNOWN_ERROR",
    callStatus: "provider_unavailable",
  };
}

function pageCount(response: ParsedTourResponse, pageSize: number): number {
  return Math.max(1, Math.ceil(response.totalCount / Math.max(1, pageSize)));
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(values[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function fallbackSummary(
  seed: AuditCandidateSeed,
  retrievedAt: string,
): TourPlaceSummary {
  const normalized = normalizeTourPlaceSummary(
    {
      contentid: seed.contentId,
      contenttypeid: seed.contentTypeId,
      title: seed.title,
    },
    {
      operation:
        seed.sampleSource === "category_sample"
          ? "areaBasedList2"
          : "petTourSyncList2",
      retrievedAt,
      fallbackContentId: seed.contentId,
      fallbackContentTypeId: normalizeTourContentTypeId(seed.contentTypeId),
    },
  );
  if (!normalized) throw new Error("AUDIT_SUMMARY_NORMALIZATION_FAILED");
  return normalized;
}

function providerStatusLabel(
  outcome: ProviderOutcome | null,
  item: TourItem | null,
  notApplicable = false,
): string {
  if (notApplicable) return "not_applicable";
  if (!outcome) return "not_requested";
  if (!outcome.ok) return outcome.errorCode;
  return item ? "item_present" : "item_absent";
}

function eligibilityCallStatus(
  outcome: ProviderOutcome | null,
  options: { itemRequired?: boolean; notApplicable?: boolean } = {},
): AutomaticRouteProviderCallStatus {
  if (options.notApplicable) return "not_applicable";
  if (!outcome) return "provider_unavailable";
  if (!outcome.ok) return outcome.callStatus;
  if (options.itemRequired && outcome.response.items.length === 0) {
    return "invalid_response";
  }
  return "succeeded";
}

function parserStatus(
  outcomes: Array<ProviderOutcome | null>,
): string {
  const failures = outcomes.filter(
    (outcome): outcome is Extract<ProviderOutcome, { ok: false }> =>
      outcome !== null && !outcome.ok,
  );
  if (failures.length === 0) return "success";
  return failures.some(({ callStatus }) => callStatus === "invalid_response")
    ? "invalid_response"
    : "provider_unavailable";
}

function latestObservation(
  observations: readonly ObservedProviderResponse[],
  operation: string,
  contentId: string,
): ObservedProviderResponse | null {
  return observations
    .filter(
      (observation) =>
        observation.operation === operation &&
        observation.contentId === contentId,
    )
    .sort((left, right) => right.callNumber - left.callNumber)[0] ?? null;
}

function observedOperationSummary(
  observations: readonly ObservedProviderResponse[],
): Array<{
  operation: string;
  calls: number;
  successes: number;
  failures: number;
  absentItems: number;
  emptyItems: number;
  presentItems: number;
  invalidItems: number;
}> {
  const operations = [...new Set(observations.map(({ operation }) => operation))]
    .sort(compareText);
  return operations.map((operation) => {
    const rows = observations.filter((row) => row.operation === operation);
    return {
      operation,
      calls: rows.length,
      successes: rows.filter(({ transport }) => transport === "success").length,
      failures: rows.filter(({ transport }) => transport === "failure").length,
      absentItems: rows.filter(({ itemsState }) => itemsState === "absent").length,
      emptyItems: rows.filter(({ itemsState }) => itemsState === "empty").length,
      presentItems: rows.filter(({ itemsState }) => itemsState === "present").length,
      invalidItems: rows.filter(({ itemsState }) => itemsState === "invalid").length,
    };
  });
}

async function collectVisibility(
  request: (
    operation: TourOperationName,
    params: Record<string, string>,
  ) => Promise<ProviderOutcome>,
): Promise<VisibilityCollection> {
  const entries = new Map<string, VisibilityEntry>();
  const reasonCodes: string[] = [];
  let pagesFetched = 0;
  let complete = true;

  let expectedPages = 1;
  for (let page = 1; page <= Math.min(expectedPages, MAX_SYNC_PAGES); page += 1) {
    const outcome = await request("petTourSyncList2", {
      lDongRegnCd: BUSAN_REGION_CODE,
      pageNo: String(page),
      numOfRows: String(SYNC_PAGE_SIZE),
      arrange: "A",
    });
    pagesFetched += 1;
    if (!outcome.ok) {
      complete = false;
      reasonCodes.push(`sync_${outcome.errorCode}`);
      break;
    }

    const retrievedAt = new Date().toISOString();
    expectedPages = pageCount(outcome.response, SYNC_PAGE_SIZE);
    for (const item of outcome.response.items) {
      const contentId = rawText(item, "contentid");
      if (!contentId || entries.has(contentId)) continue;
      entries.set(contentId, {
        summary: normalizeTourPlaceSummary(item, {
          operation: "petTourSyncList2",
          retrievedAt,
        }),
        visibility: normalizeProviderVisibility(item.showflag, retrievedAt),
      });
    }
    if (outcome.response.items.length === 0) break;
  }
  if (expectedPages > MAX_SYNC_PAGES) {
    complete = false;
    reasonCodes.push("sync_page_limit_reached");
  }

  return {
    entries,
    complete,
    pagesFetched,
    reasonCodes: [...new Set(reasonCodes)].sort(compareText),
  };
}

async function collectCategorySummaries(
  contentTypes: readonly TourContentTypeId[],
  request: (
    operation: TourOperationName,
    params: Record<string, string>,
  ) => Promise<ProviderOutcome>,
): Promise<CategoryCollection> {
  const summaries: TourPlaceSummary[] = [];
  const listContentIds = new Set<string>();
  const diagnostics: CategoryCollection["diagnostics"] = [];

  for (const contentType of contentTypes) {
    const categorySummaries: TourPlaceSummary[] = [];
    let complete = true;
    let pagesFetched = 0;
    let errorCode: string | null = null;
    let availableRecords = 0;
    let expectedPages = 1;

    for (
      let page = 1;
      page <= Math.min(expectedPages, MAX_CATEGORY_PAGES);
      page += 1
    ) {
      const outcome = await request("areaBasedList2", {
        lDongRegnCd: BUSAN_REGION_CODE,
        contentTypeId: contentType,
        pageNo: String(page),
        numOfRows: String(CATEGORY_PAGE_SIZE),
        arrange: "A",
      });
      pagesFetched += 1;
      if (!outcome.ok) {
        complete = false;
        errorCode = outcome.errorCode;
        break;
      }
      availableRecords = outcome.response.totalCount;
      expectedPages = pageCount(outcome.response, CATEGORY_PAGE_SIZE);
      const normalized = normalizeTourPlaceSummaries(outcome.response.items, {
        operation: "areaBasedList2",
        retrievedAt: new Date().toISOString(),
        fallbackContentTypeId: contentType,
      });
      for (const summary of normalized) {
        if (listContentIds.has(summary.contentId)) continue;
        listContentIds.add(summary.contentId);
        categorySummaries.push(summary);
      }
      if (categorySummaries.length >= SAMPLES_PER_CATEGORY) break;
      if (outcome.response.items.length === 0) break;
    }

    if (
      categorySummaries.length < SAMPLES_PER_CATEGORY &&
      expectedPages > MAX_CATEGORY_PAGES
    ) {
      complete = false;
      errorCode ??= "CATEGORY_PAGE_LIMIT_REACHED";
    }
    summaries.push(...categorySummaries);
    diagnostics.push({
      contentType,
      pagesFetched,
      normalizedRecords: categorySummaries.length,
      availableRecords,
      complete,
      errorCode,
    });
  }

  return { summaries, listContentIds, diagnostics };
}

function commonRegionCode(item: TourItem | null): string | null {
  return (
    rawText(item, "lDongRegnCd") ??
    rawText(item, "ldongregncd") ??
    rawText(item, "areacode")
  );
}

function commonDistrictCode(item: TourItem | null): string | null {
  return (
    rawText(item, "lDongSignguCd") ??
    rawText(item, "ldongsigngucd") ??
    rawText(item, "sigungucode")
  );
}

async function collectSuppliedRegionalJoins(
  seeds: readonly AuditCandidateSeed[],
  commonOutcomes: ReadonlyMap<string, ProviderOutcome>,
  knownListContentIds: ReadonlySet<string>,
  knownVisibilityEntries: ReadonlyMap<string, VisibilityEntry>,
  request: (
    operation: TourOperationName,
    params: Record<string, string>,
  ) => Promise<ProviderOutcome>,
): Promise<RegionalJoinCollection> {
  const summaries = new Map<string, TourPlaceSummary>();
  const visibilityEntries = new Map<string, VisibilityEntry>();
  const listContentIds = new Set<string>();
  const listCallStatuses = new Map<
    string,
    AutomaticRouteProviderCallStatus
  >();
  const diagnostics: RegionalJoinCollection["diagnostics"] = [];
  const resolvedTargets: Array<{
    contentId: string;
    regionCode: string;
    districtCode: string | null;
    contentTypeId: TourContentTypeId;
  }> = [];

  for (const seed of seeds) {
    if (!SUPPLIED_CONTENT_IDS.includes(
      seed.contentId as (typeof SUPPLIED_CONTENT_IDS)[number],
    )) {
      continue;
    }
    const commonOutcome = commonOutcomes.get(seed.contentId);
    const commonItem = commonOutcome ? firstItem(commonOutcome) : null;
    const regionCode = commonRegionCode(commonItem);
    const contentType =
      normalizeTourContentTypeId(rawText(commonItem, "contenttypeid")) ??
      normalizeTourContentTypeId(seed.contentTypeId);
    if (!commonOutcome?.ok || !commonItem || !regionCode || !contentType) {
      if (!knownListContentIds.has(seed.contentId)) {
        listCallStatuses.set(seed.contentId, "provider_unavailable");
      }
      if (!knownVisibilityEntries.has(seed.contentId)) {
        visibilityEntries.set(seed.contentId, {
          summary: null,
          visibility: providerUnavailableVisibility(new Date().toISOString(), [
            "provider_visibility_region_or_type_unavailable",
          ]),
        });
      }
      continue;
    }
    resolvedTargets.push({
      contentId: seed.contentId,
      regionCode,
      districtCode: commonDistrictCode(commonItem),
      contentTypeId: contentType,
    });
  }

  const groups = new Map<
    string,
    {
      regionCode: string;
      districtCode: string | null;
      contentType: TourContentTypeId;
      listContentIds: string[];
      visibilityContentIds: string[];
    }
  >();
  function mergeGroups(
    groupedTargets: ReturnType<typeof groupSuppliedListJoinTargets>,
    target: "listContentIds" | "visibilityContentIds",
  ): void {
    for (const grouped of groupedTargets) {
      const key = `${grouped.regionCode}:${grouped.districtCode ?? ""}:${grouped.contentTypeId}`;
      const group = groups.get(key) ?? {
        regionCode: grouped.regionCode,
        districtCode: grouped.districtCode,
        contentType: grouped.contentTypeId as TourContentTypeId,
        listContentIds: [],
        visibilityContentIds: [],
      };
      group[target].push(...grouped.contentIds);
      groups.set(key, group);
    }
  }
  mergeGroups(
    groupSuppliedListJoinTargets(resolvedTargets, knownListContentIds),
    "listContentIds",
  );
  mergeGroups(
    groupSuppliedListJoinTargets(
      resolvedTargets,
      new Set(knownVisibilityEntries.keys()),
    ),
    "visibilityContentIds",
  );

  for (const group of [...groups.values()].sort(
    (left, right) =>
      compareText(left.regionCode, right.regionCode) ||
      compareText(left.districtCode ?? "", right.districtCode ?? "") ||
      compareText(left.contentType, right.contentType),
  )) {
    const listTargets = new Set(group.listContentIds);
    const visibilityTargets = new Set(group.visibilityContentIds);
    const foundList = new Set<string>();
    const foundVisibility = new Set<string>();
    let listPages = 0;
    let syncPages = 0;
    let listExpectedPages = listTargets.size > 0 ? 1 : 0;
    let syncExpectedPages = visibilityTargets.size > 0 ? 1 : 0;
    let listScanFailed = false;
    let syncScanFailed = false;

    for (
      let page = 1;
      page <= Math.min(listExpectedPages, MAX_REGIONAL_JOIN_PAGES);
      page += 1
    ) {
      const params: Record<string, string> = {
        lDongRegnCd: group.regionCode,
        contentTypeId: group.contentType,
        pageNo: String(page),
        numOfRows: String(REGIONAL_JOIN_PAGE_SIZE),
        arrange: "A",
      };
      if (group.districtCode) params.lDongSignguCd = group.districtCode;
      const outcome = await request("areaBasedList2", params);
      listPages += 1;
      if (!outcome.ok) {
        listScanFailed = true;
        break;
      }
      listExpectedPages = pageCount(outcome.response, REGIONAL_JOIN_PAGE_SIZE);
      const normalized = normalizeTourPlaceSummaries(outcome.response.items, {
        operation: "areaBasedList2",
        retrievedAt: new Date().toISOString(),
        fallbackContentTypeId: group.contentType,
      });
      for (const summary of normalized) {
        if (!listTargets.has(summary.contentId)) continue;
        foundList.add(summary.contentId);
        listContentIds.add(summary.contentId);
        summaries.set(summary.contentId, summary);
      }
      if (
        foundList.size === listTargets.size ||
        outcome.response.items.length === 0
      ) {
        break;
      }
    }

    for (
      let page = 1;
      page <= Math.min(syncExpectedPages, MAX_REGIONAL_JOIN_PAGES);
      page += 1
    ) {
      const params: Record<string, string> = {
        lDongRegnCd: group.regionCode,
        contentTypeId: group.contentType,
        pageNo: String(page),
        numOfRows: String(REGIONAL_JOIN_PAGE_SIZE),
        arrange: "A",
      };
      if (group.districtCode) params.lDongSignguCd = group.districtCode;
      const outcome = await request("petTourSyncList2", params);
      syncPages += 1;
      if (!outcome.ok) {
        syncScanFailed = true;
        break;
      }
      syncExpectedPages = pageCount(outcome.response, REGIONAL_JOIN_PAGE_SIZE);
      const retrievedAt = new Date().toISOString();
      for (const item of outcome.response.items) {
        const contentId = rawText(item, "contentid");
        if (!contentId || !visibilityTargets.has(contentId)) continue;
        foundVisibility.add(contentId);
        const summary = normalizeTourPlaceSummary(item, {
          operation: "petTourSyncList2",
          retrievedAt,
          fallbackContentTypeId: group.contentType,
        });
        visibilityEntries.set(contentId, {
          summary,
          visibility: normalizeProviderVisibility(item.showflag, retrievedAt),
        });
        if (summary && !summaries.has(contentId)) summaries.set(contentId, summary);
      }
      if (
        foundVisibility.size === visibilityTargets.size ||
        outcome.response.items.length === 0
      ) {
        break;
      }
    }

    const listCompleteForTargets =
      listTargets.size === 0 ||
      foundList.size === listTargets.size ||
      (!listScanFailed && listExpectedPages <= MAX_REGIONAL_JOIN_PAGES);
    const visibilityCompleteForTargets =
      visibilityTargets.size === 0 ||
      foundVisibility.size === visibilityTargets.size ||
      (!syncScanFailed && syncExpectedPages <= MAX_REGIONAL_JOIN_PAGES);
    for (const contentId of group.listContentIds) {
      listCallStatuses.set(
        contentId,
        foundList.has(contentId)
          ? "succeeded"
          : listCompleteForTargets
            ? "invalid_response"
            : "provider_unavailable",
      );
    }
    for (const contentId of group.visibilityContentIds) {
      if (!visibilityEntries.has(contentId)) {
        visibilityEntries.set(contentId, {
          summary: null,
          visibility: visibilityCompleteForTargets
            ? normalizeProviderVisibility(undefined, new Date().toISOString())
            : providerUnavailableVisibility(new Date().toISOString(), [
                "provider_visibility_regional_scan_incomplete",
              ]),
        });
      }
    }
    diagnostics.push({
      regionCode: group.regionCode,
      districtCode: group.districtCode,
      contentType: group.contentType,
      targetCount: new Set([
        ...group.listContentIds,
        ...group.visibilityContentIds,
      ]).size,
      listTargetCount: group.listContentIds.length,
      visibilityTargetCount: group.visibilityContentIds.length,
      listPages,
      syncPages,
      listTargetsFound: foundList.size,
      visibilityTargetsFound: foundVisibility.size,
      listCompleteForTargets,
      visibilityCompleteForTargets,
    });
  }

  return {
    summaries,
    visibilityEntries,
    listContentIds,
    listCallStatuses,
    diagnostics,
  };
}

function makeDetail(
  seed: AuditCandidateSeed,
  preliminarySummary: TourPlaceSummary | undefined,
  visibility: ProviderVisibilityResult,
  commonOutcome: ProviderOutcome,
  introOutcome: ProviderOutcome | null,
  petOutcome: ProviderOutcome,
  retrievedAt: string,
): { detail: TourPlaceDetail; contentTypeId: TourContentTypeId | null } {
  const commonItem = firstItem(commonOutcome);
  const providerContentType = normalizeTourContentTypeId(
    rawText(commonItem, "contenttypeid"),
  );
  const contentTypeId =
    providerContentType ??
    preliminarySummary?.contentTypeId ??
    normalizeTourContentTypeId(seed.contentTypeId);
  const normalizedCommon = commonItem
    ? normalizeTourPlaceSummary(commonItem, {
        operation: "detailCommon2",
        retrievedAt,
        fallbackContentId: seed.contentId,
        fallbackContentTypeId: contentTypeId,
      })
    : null;
  const summary = {
    ...(normalizedCommon ?? preliminarySummary ?? fallbackSummary(seed, retrievedAt)),
    providerVisibility: visibility,
  };
  const introItem = firstItem(introOutcome ?? {
    ok: true,
    response: {
      items: [],
      numOfRows: 0,
      pageNo: 0,
      totalCount: 0,
      resultCode: "",
    },
  });
  const petItem = firstItem(petOutcome);
  const intro = normalizeTourIntroDetails(introItem);
  const petPolicyEvidence = normalizePetPolicyEvidence(petItem, {
    contentId: seed.contentId,
    retrievedAt,
  });
  const normalizedPetEvidence = normalizePetEvidence(petItem, {
    contentId: seed.contentId,
    retrievedAt,
    providerAvailable: petOutcome.ok,
  });
  const introPetPolicyEvidence = normalizeIntroPetPolicyEvidence(
    introItem,
    contentTypeId,
    { contentId: seed.contentId, retrievedAt },
  );
  const providerModifiedTime =
    rawText(commonItem, "modifiedtime") ??
    rawText(introItem, "modifiedtime") ??
    rawText(petItem, "modifiedtime");

  return {
    contentTypeId,
    detail: {
      summary,
      overview: sanitizeProviderText(rawText(commonItem, "overview")),
      homepageUrl: extractSafeHomepageUrl(rawText(commonItem, "homepage")),
      ...intro,
      providerModifiedTime,
      petPolicyEvidence,
      normalizedPetEvidence,
      introPetPolicyEvidence,
      sections: {
        common:
          commonOutcome.ok && commonItem
            ? { status: "available" }
            : { status: "unavailable" },
        intro:
          introOutcome?.ok
            ? { status: "available" }
            : { status: "unavailable" },
        petPolicy: petOutcome.ok
          ? { status: "available" }
          : { status: "unavailable" },
      },
      source: {
        provider: getTourProviderName(),
        operation: "detailCommon2",
        contentId: seed.contentId,
        retrievedAt,
        providerModifiedTime,
      },
    },
  };
}

function summaryCounts(rows: readonly AuditRow[]) {
  return {
    recordsInspected: rows.length,
    exposed: rows.filter(({ visibility }) => visibility === "exposed").length,
    notExposed: rows.filter(({ visibility }) => visibility === "not_exposed")
      .length,
    unknownVisibility: rows.filter(({ visibility }) => visibility === "unknown")
      .length,
    visibilityProviderUnavailable: rows.filter(
      ({ visibility }) => visibility === "provider_unavailable",
    ).length,
    usablePetDetail: rows.filter(({ petDetail }) => petDetail === "usable").length,
    partialPetDetail: rows.filter(({ petDetail }) => petDetail === "partial")
      .length,
    emptyPetDetail: rows.filter(({ petDetail }) => petDetail === "empty").length,
    absentPetDetail: rows.filter(({ petDetail }) => petDetail === "absent").length,
    petDetailProviderUnavailable: rows.filter(
      ({ petDetail }) => petDetail === "provider_unavailable",
    ).length,
    providerErrors: rows.filter(({ parser }) => parser !== "success").length,
    routeEligible: rows.filter(({ routeEligibility }) => routeEligibility.eligible)
      .length,
  };
}

function auditMarkdown(
  startedAt: string,
  completedAt: string,
  rows: readonly AuditRow[],
  summary: ReturnType<typeof summaryCounts>,
  supportRows: readonly ProviderSupportRow[],
  requestStats: ReturnType<ReturnType<typeof createBoundedProviderFetch>["stats"]>,
  includeShopping: boolean,
  visibility: VisibilityCollection,
): string {
  const lines = [
    "# Tour Service2 contract audit",
    "",
    `- Started: ${markdownCell(startedAt)}`,
    `- Completed: ${markdownCell(completedAt)}`,
    `- Busan region code: ${BUSAN_REGION_CODE}`,
    `- Shopping sample enabled: ${includeShopping ? "yes" : "no"}`,
    `- Detailed records: ${rows.length}/${MAX_DETAILED_RECORDS}`,
    `- Actual provider calls: ${requestStats.providerCalls}/${requestStats.requestCap}`,
    `- Provider concurrency: ${requestStats.maxObservedConcurrency}/${requestStats.concurrency}`,
    `- Per-request timeout: ${requestStats.timeoutMs} ms; retry count: 0`,
    `- Visibility pages: ${visibility.pagesFetched}/${MAX_SYNC_PAGES}; complete: ${visibility.complete}`,
    "",
    "## Summary",
    "",
    "| metric | count |",
    "|---|---:|",
    ...Object.entries(summary).map(
      ([metric, count]) => `| ${markdownCell(metric)} | ${count} |`,
    ),
    "",
    "## Detailed records",
    "",
    "| contentId | type | visibility | pet detail | parser | Phase 3 | route eligible | reason |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (row) =>
        `| ${markdownCell(row.contentId)} | ${markdownCell(row.contentType)} | ${markdownCell(row.visibility)} | ${markdownCell(row.petDetail)} | ${markdownCell(row.parser)} | ${markdownCell(`${row.phase3.verdict}/${row.phase3.evaluationState}`)} | ${row.routeEligibility.eligible ? "yes" : "no"} | ${markdownCell(row.routeEligibility.reasonCodes.join(", "))} |`,
    ),
    "",
    "## Provider-support cases",
    "",
    `Exposed records with an absent or present-but-empty pet-detail item: ${supportRows.length}.`,
    "See `provider-support.md` for the sanitized support table.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function supportMarkdown(rows: readonly ProviderSupportRow[]): string {
  const lines = [
    "# Sanitized Tour Service2 provider-support cases",
    "",
    "This report intentionally omits credentials, request URLs, authorization data, provider policy text, and raw payloads.",
    "",
    "| contentId | title | type | visibility raw | visibility field | operation | result code | result message | item state | request date/time |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (row) =>
        `| ${markdownCell(row.contentId)} | ${markdownCell(row.title)} | ${markdownCell(row.contentType)} | ${markdownCell(row.visibilityRawValue)} | ${markdownCell(row.visibilityField)} | ${row.operation} | ${markdownCell(row.providerResultCode)} | ${markdownCell(row.providerResultMessage)} | ${row.itemState} | ${markdownCell(row.requestDateTime)} |`,
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  assertLiveOptIn();
  loadLocalProviderEnvironment();
  const startedAt = new Date().toISOString();
  const includeShopping = process.env[SHOPPING_OPT_IN_ENV] === "1";
  const contentTypes: TourContentTypeId[] = [
    ...MAIN_CONTENT_TYPES,
    ...(includeShopping ? [SHOPPING_CONTENT_TYPE] : []),
  ];
  const observations: ObservedProviderResponse[] = [];
  const bounded = createBoundedProviderFetch({
    requestCap: MAX_PROVIDER_CALLS,
    concurrency: PROVIDER_CONCURRENCY,
    timeoutMs: PROVIDER_TIMEOUT_MS,
    onObservation(observation) {
      observations.push({ ...observation, observedAt: new Date().toISOString() });
    },
  });
  const client = new TourApiClient({
    fetchImpl: bounded.fetchImpl,
    timeoutMs: PROVIDER_TIMEOUT_MS,
    transientRetryCount: 0,
  });
  const cache = new TourRequestCache();

  async function request(
    operation: TourOperationName,
    params: Record<string, string>,
  ): Promise<ProviderOutcome> {
    try {
      const response = await cache.getOrLoad(
        stableRequestKey(operation, params),
        CACHE_TTL_MS,
        () => client.request(operation, params),
      );
      return { ok: true, response };
    } catch (error) {
      return { ok: false, ...providerFailure(error) };
    }
  }

  const visibilityCollection = await collectVisibility(request);
  const categoryCollection = await collectCategorySummaries(
    contentTypes,
    request,
  );
  const preliminarySummaries = new Map<string, TourPlaceSummary>();
  for (const summary of categoryCollection.summaries) {
    preliminarySummaries.set(summary.contentId, summary);
  }
  for (const [contentId, entry] of visibilityCollection.entries) {
    if (entry.summary && !preliminarySummaries.has(contentId)) {
      preliminarySummaries.set(contentId, entry.summary);
    }
  }

  const sampleSeeds = selectDeterministicCategorySample(
    categoryCollection.summaries.map((summary) => ({
      contentId: summary.contentId,
      contentTypeId: summary.contentTypeId,
      title: summary.title,
      sampleSource: "category_sample" as const,
    })),
    contentTypes,
    SAMPLES_PER_CATEGORY,
  );
  const candidateSeeds = mergeAuditCandidateSeeds(
    sampleSeeds,
    SUPPLIED_CONTENT_IDS,
    MAX_DETAILED_RECORDS,
    contentTypes,
  );
  const commonOutcomeEntries = await mapWithConcurrency(
    candidateSeeds,
    DETAIL_WORKER_CONCURRENCY,
    async (seed) =>
      [
        seed.contentId,
        await request("detailCommon2", { contentId: seed.contentId }),
      ] as const,
  );
  const commonOutcomes = new Map<string, ProviderOutcome>(commonOutcomeEntries);
  const regionalJoins = await collectSuppliedRegionalJoins(
    candidateSeeds,
    commonOutcomes,
    categoryCollection.listContentIds,
    visibilityCollection.entries,
    request,
  );
  for (const [contentId, summary] of regionalJoins.summaries) {
    preliminarySummaries.set(contentId, summary);
  }

  const rows = await mapWithConcurrency(
    candidateSeeds,
    DETAIL_WORKER_CONCURRENCY,
    async (seed): Promise<AuditRow> => {
      const preliminarySummary = preliminarySummaries.get(seed.contentId);
      const visibilityEntry =
        visibilityCollection.entries.get(seed.contentId) ??
        regionalJoins.visibilityEntries.get(seed.contentId);
      const visibility =
        visibilityEntry?.visibility ??
        (visibilityCollection.complete
          ? normalizeProviderVisibility(undefined, startedAt)
          : providerUnavailableVisibility(startedAt, [
              "provider_visibility_sync_incomplete",
              ...visibilityCollection.reasonCodes,
            ]));
      const commonOutcome = commonOutcomes.get(seed.contentId);
      if (!commonOutcome) throw new Error("COMMON_DETAIL_OUTCOME_MISSING");
      const commonItem = firstItem(commonOutcome);
      const contentTypeId =
        normalizeTourContentTypeId(rawText(commonItem, "contenttypeid")) ??
        preliminarySummary?.contentTypeId ??
        normalizeTourContentTypeId(seed.contentTypeId);
      const [introOutcome, petOutcome] = await Promise.all([
        contentTypeId
          ? request("detailIntro2", {
              contentId: seed.contentId,
              contentTypeId,
            })
          : Promise.resolve(null),
        request("detailPetTour2", { contentId: seed.contentId }),
      ]);
      const retrievedAt = new Date().toISOString();
      const { detail } = makeDetail(
        seed,
        preliminarySummary,
        visibility,
        commonOutcome,
        introOutcome,
        petOutcome,
        retrievedAt,
      );
      const assessment = evaluateTourPetAccess(
        createTrustedTourPetAccessInput(detail),
      );
      const operatingHours: OperatingHoursAssessment = assessOperatingHours({
        travelDate: AUDIT_TRAVEL_DATE,
        arrivalMinutes: 10 * 60,
        departureMinutes: 11 * 60,
        operatingInformation: detail.operatingInformation,
        restDayInformation: detail.restDayInformation,
      });
      const listSuccess = wasListedForAudit(
        seed.contentId,
        categoryCollection.listContentIds,
        regionalJoins.listContentIds,
      );
      const listCallStatus = listSuccess
        ? "succeeded"
        : regionalJoins.listCallStatuses.get(seed.contentId) ?? "invalid_response";
      const routeEligibility = evaluateAutomaticRouteEligibility({
        providerService: KTO_SERVICE2_NAME,
        summary: {
          ...(preliminarySummary ?? detail.summary),
          providerVisibility: visibility,
          source: preliminarySummary?.source ?? {
            provider: "Korea Tourism Organization",
            operation: "areaBasedList2",
            retrievedAt: startedAt,
          },
        },
        detail,
        providerVisibility: visibility,
        providerCalls: {
          list: listCallStatus,
          detailCommon: eligibilityCallStatus(commonOutcome, {
            itemRequired: true,
          }),
          detailIntro: eligibilityCallStatus(introOutcome, {
            notApplicable: contentTypeId === null,
          }),
          detailPet: eligibilityCallStatus(petOutcome),
        },
        assessment,
        petProfile: {
          species: "DOG",
          size: "SMALL",
          hasCarrier: true,
          hasLeash: true,
          hasMuzzle: true,
          acceptsOutdoorOnly: true,
        },
        tripRequest: {
          scope: {
            regionCode: BUSAN_REGION_CODE,
            districtCode: null,
            bounds: { west: 128.75, south: 34.95, east: 129.4, north: 35.5 },
          },
          selectedCategories: contentTypes.map((contentType) =>
            normalizeTourPlaceSummary(
              { contentid: `category-${contentType}`, contenttypeid: contentType },
              {
                operation: "areaBasedList2",
                retrievedAt: startedAt,
              },
            )?.category ?? "unknown",
          ),
          includeShopping,
          indoorAccessPreference: "any",
        },
        licensing: null,
        operatingHours,
      });
      const petItem = firstItem(petOutcome);
      const normalizedPetEvidence = detail.normalizedPetEvidence ??
        normalizePetEvidence(null, {
          contentId: seed.contentId,
          retrievedAt,
          providerAvailable: false,
        });
      const petObservation = latestObservation(
        observations,
        "detailPetTour2",
        seed.contentId,
      );
      const parsedPetItemPresent = petItem !== null;
      const providerShapeMatchesParser = petObservation
        ? (petObservation.itemsState === "present") === parsedPetItemPresent
        : null;

      return {
        contentId: seed.contentId,
        title: sanitizeDiagnosticText(detail.summary.title),
        contentType: detail.summary.providerContentTypeId ?? contentTypeId,
        category: detail.summary.category,
        sampleSource: seed.sampleSource,
        suppliedId: SUPPLIED_CONTENT_IDS.includes(
          seed.contentId as (typeof SUPPLIED_CONTENT_IDS)[number],
        ),
        listSuccess,
        visibilityField: visibility.providerField,
        visibilityRawValue: visibility.providerValue,
        visibility: visibility.status,
        visibilityReasonCodes: visibility.reasonCodes.slice().sort(compareText),
        commonDetail: providerStatusLabel(commonOutcome, commonItem),
        introDetail: providerStatusLabel(
          introOutcome,
          firstItem(introOutcome ?? {
            ok: true,
            response: {
              items: [],
              numOfRows: 0,
              pageNo: 0,
              totalCount: 0,
              resultCode: "",
            },
          }),
          contentTypeId === null,
        ),
        petDetail: normalizedPetEvidence.availability,
        petDetailItemPresent: parsedPetItemPresent,
        nonEmptyPetDetailFields: normalizedPetEvidence.sourceFields
          .map(({ field }) => field)
          .sort(compareText),
        emptyPetDetailFields: normalizedPetEvidence.emptyFieldNames
          .slice()
          .sort(compareText),
        absentPetDetailFields: normalizedPetEvidence.absentFieldNames
          .slice()
          .sort(compareText),
        providerPetItemsState: petObservation?.itemsState ?? null,
        providerPetItemFieldNames:
          petObservation?.itemFieldNames.slice().sort(compareText) ?? [],
        providerShapeMatchesParser,
        parser: parserStatus([commonOutcome, introOutcome, petOutcome]),
        phase3: {
          verdict: assessment.verdict,
          evaluationState: assessment.evaluationState,
          reasonCodes: assessment.reasonCodes.slice().sort(compareText),
        },
        routeEligibility: {
          eligible: routeEligibility.eligible,
          status: routeEligibility.status,
          reasonCodes: routeEligibility.reasonCodes.slice().sort(compareText),
          warnings: routeEligibility.warnings.slice().sort(compareText),
          evidenceFieldNames: routeEligibility.evidenceFieldNames
            .slice()
            .sort(compareText),
        },
      };
    },
  );

  const sortedRows = sortAuditRows(rows, contentTypes);
  const supportRows = sortedRows
    .filter(
      (row) =>
        row.visibility === "exposed" &&
        (row.petDetail === "absent" || row.petDetail === "empty"),
    )
    .map((row): ProviderSupportRow => {
      const observation = latestObservation(
        observations,
        "detailPetTour2",
        row.contentId,
      );
      return {
        contentId: row.contentId,
        title: row.title,
        contentType: row.contentType,
        visibilityRawValue: row.visibilityRawValue,
        visibilityField: row.visibilityField,
        operation: "detailPetTour2",
        providerResultCode: observation?.resultCode ?? null,
        providerResultMessage: observation?.resultMessage ?? null,
        itemState: row.petDetail === "absent" ? "absent" : "present_but_empty",
        requestDateTime: observation?.observedAt ?? startedAt,
      };
    });
  const completedAt = new Date().toISOString();
  const summary = summaryCounts(sortedRows);
  const requestStats = bounded.stats();
  const artifact = {
    artifactVersion: 1,
    provider: "Korea Tourism Organization KorPetTourService2",
    startedAt,
    completedAt,
    scope: {
      regionCode: BUSAN_REGION_CODE,
      mainContentTypes: [...MAIN_CONTENT_TYPES],
      shoppingContentType: SHOPPING_CONTENT_TYPE,
      shoppingIncluded: includeShopping,
      suppliedContentIds: [...SUPPLIED_CONTENT_IDS],
      samplesPerCategory: SAMPLES_PER_CATEGORY,
      maxDetailedRecords: MAX_DETAILED_RECORDS,
      auditPetProfile: {
        species: "DOG",
        size: "SMALL",
        hasCarrier: true,
        hasLeash: true,
        hasMuzzle: true,
        acceptsOutdoorOnly: true,
      },
      auditVisit: {
        travelDate: AUDIT_TRAVEL_DATE,
        arrival: "10:00",
        departure: "11:00",
        indoorAccessPreference: "any",
      },
    },
    safety: {
      liveOptInEnvironment: LIVE_OPT_IN_ENV,
      ciDenied: true,
      maxProviderCalls: MAX_PROVIDER_CALLS,
      providerCalls: requestStats.providerCalls,
      providerConcurrency: PROVIDER_CONCURRENCY,
      maxObservedProviderConcurrency: requestStats.maxObservedConcurrency,
      detailWorkerConcurrency: DETAIL_WORKER_CONCURRENCY,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      retryCount: 0,
      cacheTtlMs: CACHE_TTL_MS,
      rawPayloadsPersisted: false,
      requestUrlsPersisted: false,
    },
    visibilitySync: {
      pagesFetched: visibilityCollection.pagesFetched,
      maxPages: MAX_SYNC_PAGES,
      complete: visibilityCollection.complete,
      recordsMapped: visibilityCollection.entries.size,
      reasonCodes: visibilityCollection.reasonCodes,
    },
    categorySampling: categoryCollection.diagnostics,
    suppliedRegionalJoins: regionalJoins.diagnostics,
    providerOperations: observedOperationSummary(observations),
    summary,
    records: sortedRows,
    suppliedRecords: sortedRows.filter(({ suppliedId }) => suppliedId),
    providerSupportCases: supportRows,
  };

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const jsonPath = resolve(OUTPUT_DIRECTORY, "audit.json");
  const markdownPath = resolve(OUTPUT_DIRECTORY, "audit.md");
  const supportPath = resolve(OUTPUT_DIRECTORY, "provider-support.md");
  await Promise.all([
    writeFile(jsonPath, stringifySanitizedArtifact(artifact), "utf8"),
    writeFile(
      markdownPath,
      auditMarkdown(
        startedAt,
        completedAt,
        sortedRows,
        summary,
        supportRows,
        requestStats,
        includeShopping,
        visibilityCollection,
      ),
      "utf8",
    ),
    writeFile(supportPath, supportMarkdown(supportRows), "utf8"),
  ]);

  console.log(`TOUR_CONTRACT_AUDIT_RECORDS=${summary.recordsInspected}`);
  console.log(`TOUR_CONTRACT_AUDIT_PROVIDER_CALLS=${requestStats.providerCalls}`);
  console.log(`TOUR_CONTRACT_AUDIT_JSON=${jsonPath}`);
  console.log(`TOUR_CONTRACT_AUDIT_MARKDOWN=${markdownPath}`);
  console.log(`TOUR_CONTRACT_AUDIT_SUPPORT=${supportPath}`);
  console.log("TOUR_CONTRACT_AUDIT_STATUS=success");
}

main().catch((error: unknown) => {
  const code =
    error instanceof TourProviderError
      ? error.code
      : sanitizeDiagnosticText(error instanceof Error ? error.message : error, 120) ??
        "UNKNOWN_ERROR";
  console.error(`TOUR_CONTRACT_AUDIT_STATUS=failed:${code}`);
  process.exitCode = 1;
});
