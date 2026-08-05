import { existsSync } from "node:fs";
import {
  createTrustedTourPetAccessInput,
  evaluateTourPetAccess,
} from "@/lib/pet-access/tourism/evaluator";
import {
  buildTourRequestUrl,
  TourApiClient,
} from "@/lib/tour-api/client";
import { getTourApiConfig } from "@/lib/tour-api/config";
import { TourProviderError } from "@/lib/tour-api/errors";
import { parseTourResponse } from "@/lib/tour-api/parser";
import type { ParsedTourResponse, TourItem } from "@/lib/tour-api/schemas";
import {
  KoreaTourismService,
  type TourClientLike,
} from "@/lib/tour-api/service";
import {
  TOUR_CONTENT_TYPE_IDS,
  type TourContentTypeId,
} from "@/types/place";
import type {
  TourPetAccessEvaluationState,
  TourPetAccessSourceState,
  TourPetAccessVerdict,
} from "@/types/tour-pet-access";

// Verified through the bounded ldongCode2 diagnostic; this is not a guessed code.
const BUSAN_REGION_CODE = "26";
const MAX_PROVIDER_CALLS = 7;
const MAX_SUPPORTED_DETAILS = 2;
const SYNC_PAGE_SIZE = 20;
const CURRENT_CONTENT_TYPES = new Set<string>(TOUR_CONTENT_TYPE_IDS);
const KNOWN_SYNC_FIELDS = new Set([
  "showflag",
  "contentid",
  "contenttypeid",
  "title",
  "createdtime",
  "modifiedtime",
  "tel",
  "cat1",
  "cat2",
  "cat3",
  "zipcode",
  "addr1",
  "addr2",
  "areacode",
  "sigungucode",
  "mapx",
  "mapy",
  "mlevel",
  "firstimage",
  "firstimage2",
  "cpyrhtDivCd",
  "lDongRegnCd",
  "lDongSignguCd",
  "lclsSystm1",
  "lclsSystm2",
  "lclsSystm3",
  "rnum",
]);

if (!process.env.TOUR_API_SERVICE_KEY && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

function counter<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function sortedCounts(counts: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  ));
}

function value(item: TourItem, key: string): string | null {
  const candidate = item[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

function safeSummary(input: string): string {
  return Array.from(input)
    .slice(0, 80)
    .join("")
    .replace(/https?:\/\/\S+/giu, "[url omitted]")
    .replace(/servicekey\s*[=:]\s*\S+/giu, "[credential omitted]")
    .replace(/[\r\n]+/gu, " ");
}

function sourceCounter(): Record<
  TourPetAccessSourceState["status"],
  number
> {
  return counter(["available", "empty", "unavailable"] as const);
}

async function main() {
  if (process.env.CI) throw new Error("LIVE_VERIFICATION_DISABLED_IN_CI");
  if (!process.env.TOUR_API_SERVICE_KEY || !process.env.TOUR_API_BASE_URL) {
    throw new TourProviderError("CONFIGURATION", "CONFIGURATION_REQUIRED");
  }

  const config = getTourApiConfig();
  let providerCalls = 0;
  const operationSuccesses = new Map<string, number>();
  const operationFailures = new Map<string, number>();
  const validEmptyResponses = new Map<string, number>();

  const boundedFetch: typeof fetch = async (input, init) => {
    if (providerCalls >= MAX_PROVIDER_CALLS) {
      throw new Error("PROVIDER_CALL_LIMIT_REACHED");
    }
    providerCalls += 1;
    return fetch(input, init);
  };

  function recordSuccess(operation: string, response: ParsedTourResponse): void {
    increment(operationSuccesses, operation);
    if (response.items.length === 0) increment(validEmptyResponses, operation);
  }

  const client = new TourApiClient({
    fetchImpl: boundedFetch,
    transientRetryCount: 0,
  });
  const observedClient: TourClientLike = {
    async request(operation, params) {
      try {
        const response = await client.request(operation, params);
        recordSuccess(operation, response);
        return response;
      } catch (error) {
        increment(operationFailures, operation);
        throw error;
      }
    },
  };
  const service = new KoreaTourismService(observedClient);

  const syncUrl = buildTourRequestUrl(config, "areaBasedList2", {
    pageNo: "1",
    numOfRows: String(SYNC_PAGE_SIZE),
    lDongRegnCd: BUSAN_REGION_CODE,
  });
  syncUrl.pathname = syncUrl.pathname.replace(
    /areaBasedList2$/u,
    "petTourSyncList2",
  );

  let syncResponse: ParsedTourResponse;
  try {
    const response = await boundedFetch(syncUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new TourProviderError(
        "UPSTREAM",
        `petTourSyncList2 failed with status ${response.status}`,
        { operation: "petTourSyncList2", retryable: response.status >= 500 },
      );
    }
    syncResponse = parseTourResponse(await response.text(), "petTourSyncList2");
    recordSuccess("petTourSyncList2", syncResponse);
  } catch (error) {
    increment(operationFailures, "petTourSyncList2");
    throw error;
  }

  const observedContentTypes = new Set<string>();
  const unsupportedContentTypes = new Set<string>();
  const unknownSyncFields = new Set<string>();
  for (const item of syncResponse.items) {
    const contentTypeId = value(item, "contenttypeid");
    if (contentTypeId) {
      observedContentTypes.add(contentTypeId);
      if (!CURRENT_CONTENT_TYPES.has(contentTypeId)) {
        unsupportedContentTypes.add(contentTypeId);
      }
    }
    Object.keys(item)
      .filter((field) => !KNOWN_SYNC_FIELDS.has(field))
      .forEach((field) => unknownSyncFields.add(field));
  }

  const candidates = syncResponse.items
    .filter((item) => value(item, "showflag") !== "0")
    .map((item) => ({
      contentId: value(item, "contentid"),
      contentTypeId: value(item, "contenttypeid"),
    }))
    .filter(
      (item): item is { contentId: string; contentTypeId: TourContentTypeId } =>
        Boolean(item.contentId) &&
        CURRENT_CONTENT_TYPES.has(item.contentTypeId ?? ""),
    )
    .slice(0, MAX_SUPPORTED_DETAILS);
  if (candidates.length === 0) {
    throw new Error("NO_CURRENT_SUPPORTED_SYNC_RECORDS");
  }

  const verdictCounts = counter<TourPetAccessVerdict>([
    "allowed",
    "conditional",
    "not_allowed",
    "unknown",
  ]);
  const stateCounts = counter<TourPetAccessEvaluationState>([
    "complete",
    "partial",
    "insufficient_evidence",
    "unavailable",
    "not_applicable",
  ]);
  const sourceCounts: Record<string, ReturnType<typeof sourceCounter>> = {
    detailPetTour2: sourceCounter(),
    detailIntro2: sourceCounter(),
  };
  const conditionCounts = new Map<string, number>();
  const unknownCodes = new Set<string>();
  const examples: Record<string, unknown>[] = [];
  let conflicts = 0;
  let assessed = 0;

  for (const candidate of candidates) {
    const detail = await service.getPlaceDetail(
      candidate.contentId,
      candidate.contentTypeId,
    );
    const assessment = evaluateTourPetAccess(
      createTrustedTourPetAccessInput(detail),
    );
    assessed += 1;
    verdictCounts[assessment.verdict] += 1;
    stateCounts[assessment.evaluationState] += 1;
    conflicts += assessment.conflicts.length;
    assessment.sources.forEach((source) => {
      sourceCounts[source.operation] ??= sourceCounter();
      sourceCounts[source.operation][source.status] += 1;
    });
    assessment.conditions.forEach((condition) => {
      increment(conditionCounts, condition.type);
    });
    assessment.evidence
      .filter(
        (evidence) =>
          evidence.field === "acmpyTypeCd" && evidence.assertion === "unknown",
      )
      .forEach((evidence) => unknownCodes.add(safeSummary(evidence.originalText)));
    if (examples.length < 2) {
      examples.push({
        contentId: candidate.contentId,
        contentTypeId: detail.summary.providerContentTypeId,
        verdict: assessment.verdict,
        evaluationState: assessment.evaluationState,
        sourceStates: assessment.sources.map((source) => ({
          operation: source.operation,
          status: source.status,
        })),
        evidenceFields: [...new Set(assessment.evidence.map((item) => item.field))],
        conditionTypes: [...new Set(assessment.conditions.map((item) => item.type))],
      });
    }
  }

  console.log(`LIVE_PET_ACCESS_PROVIDER_CALLS=${providerCalls}`);
  console.log(`LIVE_PET_ACCESS_CALL_LIMIT=${MAX_PROVIDER_CALLS}`);
  console.log(`LIVE_PET_ACCESS_REGION=${BUSAN_REGION_CODE}`);
  console.log(`LIVE_PET_ACCESS_ASSESSED=${assessed}`);
  console.log(
    `LIVE_PET_ACCESS_OPERATION_SUCCESSES=${JSON.stringify(sortedCounts(operationSuccesses))}`,
  );
  console.log(
    `LIVE_PET_ACCESS_OPERATION_FAILURES=${JSON.stringify(sortedCounts(operationFailures))}`,
  );
  console.log(
    `LIVE_PET_ACCESS_VALID_EMPTY_RESPONSES=${JSON.stringify(sortedCounts(validEmptyResponses))}`,
  );
  console.log(
    `LIVE_PET_ACCESS_OBSERVED_CONTENT_TYPES=${JSON.stringify([...observedContentTypes].sort())}`,
  );
  console.log(`LIVE_PET_ACCESS_VERDICTS=${JSON.stringify(verdictCounts)}`);
  console.log(`LIVE_PET_ACCESS_STATES=${JSON.stringify(stateCounts)}`);
  console.log(`LIVE_PET_ACCESS_SOURCE_STATES=${JSON.stringify(sourceCounts)}`);
  console.log(
    `LIVE_PET_ACCESS_CONDITIONS=${JSON.stringify(sortedCounts(conditionCounts))}`,
  );
  console.log(`LIVE_PET_ACCESS_CONFLICTS=${conflicts}`);
  console.log(
    `LIVE_PET_ACCESS_UNSUPPORTED_CONTENT_TYPES=${JSON.stringify([...unsupportedContentTypes].sort())}`,
  );
  console.log(
    `LIVE_PET_ACCESS_UNKNOWN_SYNC_FIELDS=${JSON.stringify([...unknownSyncFields].sort().slice(0, 20))}`,
  );
  console.log(
    `LIVE_PET_ACCESS_UNKNOWN_CODES=${JSON.stringify([...unknownCodes].slice(0, 20))}`,
  );
  examples.forEach((example, index) => {
    console.log(
      `LIVE_PET_ACCESS_EXAMPLE_${index + 1}=${JSON.stringify(example)}`,
    );
  });
  console.log("LIVE_PET_ACCESS_STATUS=success");
}

main().catch((error: unknown) => {
  const code =
    error instanceof TourProviderError
      ? error.code
      : error instanceof Error
        ? error.name
        : "UNKNOWN_ERROR";
  console.error(`LIVE_PET_ACCESS_STATUS=failed:${code}`);
  process.exitCode = 1;
});
