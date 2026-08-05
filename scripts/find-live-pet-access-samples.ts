import { existsSync } from "node:fs";
import {
  createTrustedTourPetAccessInput,
  evaluateTourPetAccess,
} from "@/lib/pet-access/tourism/evaluator";
import { TourApiClient } from "@/lib/tour-api/client";
import { TourProviderError } from "@/lib/tour-api/errors";
import {
  KoreaTourismService,
  type TourClientLike,
} from "@/lib/tour-api/service";
import {
  TOUR_CONTENT_TYPE_IDS,
  type TourContentTypeId,
  type TourPlaceSummary,
} from "@/types/place";

const REGIONS = [
  { code: "26", name: "Busan" },
  { code: "11", name: "Seoul" },
  { code: "41", name: "Gyeonggi" },
  { code: "51", name: "Gangwon" },
  { code: "50", name: "Jeju" },
] as const;

const FILTER_CONTENT_TYPES: readonly TourContentTypeId[] =
  TOUR_CONTENT_TYPE_IDS;
const MAX_PROVIDER_CALLS = 70;
const MAX_DETAILS_PER_REGION = 2;

if (!process.env.TOUR_API_SERVICE_KEY && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

function isSupportedContentType(
  value: string | null,
): value is TourContentTypeId {
  return TOUR_CONTENT_TYPE_IDS.includes(value as TourContentTypeId);
}

function safeText(value: string): string {
  return Array.from(value)
    .slice(0, 180)
    .join("")
    .replace(/https?:\/\/\S+/giu, "[url omitted]")
    .replace(/servicekey\s*[=:]\s*\S+/giu, "[credential omitted]")
    .replace(/[\r\n]+/gu, " ");
}

function providerErrorSummary(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  return {
    errorCode:
      error instanceof TourProviderError ? error.code : "UNKNOWN_ERROR",
    operation:
      error instanceof TourProviderError ? error.operation ?? null : null,
    retryable:
      error instanceof TourProviderError ? error.retryable : false,
    causeName: cause instanceof Error ? cause.name : null,
    causeCode:
      cause && typeof cause === "object" && "code" in cause
        ? String(cause.code)
        : null,
  };
}

async function main() {
  if (process.env.CI) throw new Error("LIVE_VERIFICATION_DISABLED_IN_CI");
  if (!process.env.TOUR_API_SERVICE_KEY || !process.env.TOUR_API_BASE_URL) {
    throw new TourProviderError("CONFIGURATION", "CONFIGURATION_REQUIRED");
  }

  let providerCalls = 0;
  let listRecordsSeen = 0;
  let detailsInspected = 0;
  let activeDetailOperations: string[] | null = null;
  const client = new TourApiClient({ transientRetryCount: 0 });
  const countingClient: TourClientLike = {
    request(operation, params) {
      if (providerCalls >= MAX_PROVIDER_CALLS) {
        throw new Error("PROVIDER_CALL_LIMIT_REACHED");
      }
      providerCalls += 1;
      activeDetailOperations?.push(operation);
      return client.request(operation, params);
    },
  };
  const service = new KoreaTourismService(countingClient);
  const outcomes: Array<Record<string, unknown>> = [];

  for (const region of REGIONS) {
    const supported = new Map<string, TourPlaceSummary>();
    const legacy = new Map<string, TourPlaceSummary>();
    const collect = (places: TourPlaceSummary[]) => {
      listRecordsSeen += places.length;
      for (const place of places) {
        const target = isSupportedContentType(place.providerContentTypeId)
          ? supported
          : legacy;
        target.set(place.contentId, place);
      }
    };

    try {
      collect(
        (
          await service.listPlaces({
            regionCode: region.code,
            page: 1,
            pageSize: 20,
          })
        ).places,
      );

      for (const contentTypeId of FILTER_CONTENT_TYPES) {
        if (supported.size >= MAX_DETAILS_PER_REGION) break;
        collect(
          (
            await service.listPlaces({
              regionCode: region.code,
              contentTypeId,
              page: 1,
              pageSize: 3,
            })
          ).places,
        );
      }
    } catch (error) {
      outcomes.push({
        region: region.name,
        outcome: "list_provider_error",
        ...providerErrorSummary(error),
      });
      continue;
    }

    const candidates = [
      ...supported.values(),
      ...legacy.values(),
    ].slice(0, MAX_DETAILS_PER_REGION);

    for (const place of candidates) {
      detailsInspected += 1;
      const currentDetailOperations: string[] = [];
      activeDetailOperations = currentDetailOperations;
      try {
        const detail = await service.getPlaceDetail(
          place.contentId,
          place.contentTypeId ?? undefined,
        );
        const detailOperations = [...new Set(currentDetailOperations)].sort();
        activeDetailOperations = null;
        const assessment = evaluateTourPetAccess(
          createTrustedTourPetAccessInput(detail),
        );
        outcomes.push({
          region: region.name,
          contentId: place.contentId,
          title: place.title ? safeText(place.title) : null,
          listOperation: "areaBasedList2",
          detailOperations,
          listProviderContentTypeId: place.providerContentTypeId,
          detailProviderContentTypeId: detail.summary.providerContentTypeId,
          supportDetection:
            assessment.evaluationState === "not_applicable"
              ? "not_applicable"
              : "supported",
          verdict: assessment.verdict,
          evaluationState: assessment.evaluationState,
          confidence: assessment.confidence,
          reasonCodes: assessment.reasonCodes,
          providerStatuses: assessment.sources.map((source) => ({
            operation: source.operation,
            status: source.status,
          })),
          fieldsUsed: assessment.evidence.map((evidence) => ({
            operation: evidence.operation,
            field: evidence.field,
            assertion: evidence.assertion,
            scope: evidence.scope,
            sourceText: safeText(evidence.originalText),
          })),
          conditions: assessment.conditions.map((condition) => ({
            type: condition.type,
            scope: condition.scope,
            label: condition.label,
          })),
          conflicts: assessment.conflicts.length,
          verificationItems: assessment.verificationItems.map(
            (item) => item.code,
          ),
        });
      } catch (error) {
        const detailOperations = [...new Set(currentDetailOperations)].sort();
        activeDetailOperations = null;
        outcomes.push({
          region: region.name,
          contentId: place.contentId,
          outcome: "detail_provider_error",
          detailOperations,
          ...providerErrorSummary(error),
        });
      }
    }
  }

  console.log(`LIVE_SAMPLE_PROVIDER_CALLS=${providerCalls}`);
  console.log(`LIVE_SAMPLE_LIST_RECORDS_SEEN=${listRecordsSeen}`);
  console.log(`LIVE_SAMPLE_DETAILS_INSPECTED=${detailsInspected}`);
  outcomes.forEach((outcome, index) => {
    console.log(`LIVE_SAMPLE_${index + 1}=${JSON.stringify(outcome)}`);
  });
  console.log("LIVE_SAMPLE_STATUS=success");
}

main().catch((error: unknown) => {
  const code =
    error instanceof TourProviderError
      ? error.code
      : error instanceof Error
        ? error.name
        : "UNKNOWN_ERROR";
  console.error(`LIVE_SAMPLE_STATUS=failed:${code}`);
  process.exitCode = 1;
});
