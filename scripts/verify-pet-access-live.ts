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
import type {
  TourPetAccessEvaluationState,
  TourPetAccessVerdict,
} from "@/types/tour-pet-access";

const BUSAN_REGION_CODE = "26";
const MAX_PROVIDER_CALLS = 15;
const MAX_SUPPORTED_DETAILS = 2;

if (!process.env.TOUR_API_SERVICE_KEY && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

function counter<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function safeSummary(value: string): string {
  return Array.from(value)
    .slice(0, 160)
    .join("")
    .replace(/https?:\/\/\S+/gi, "[url omitted]")
    .replace(/servicekey\s*[=:]\s*\S+/gi, "[credential omitted]")
    .replace(/[\r\n]+/g, " ");
}

async function main() {
  if (process.env.CI) {
    throw new Error("LIVE_VERIFICATION_DISABLED_IN_CI");
  }
  if (!process.env.TOUR_API_SERVICE_KEY || !process.env.TOUR_API_BASE_URL) {
    throw new TourProviderError("CONFIGURATION", "CONFIGURATION_REQUIRED");
  }

  let providerCalls = 0;
  const client = new TourApiClient({ transientRetryCount: 0 });
  const countingClient: TourClientLike = {
    request(operation, params) {
      if (providerCalls >= MAX_PROVIDER_CALLS) {
        throw new Error("PROVIDER_CALL_LIMIT_REACHED");
      }
      providerCalls += 1;
      return client.request(operation, params);
    },
  };
  const service = new KoreaTourismService(countingClient);
  const candidates = new Map<string, TourPlaceSummary>();

  for (const contentTypeId of TOUR_CONTENT_TYPE_IDS) {
    const list = await service.listPlaces({
      regionCode: BUSAN_REGION_CODE,
      contentTypeId,
      page: 1,
      pageSize: 1,
    });
    const place = list.places.find(
      (item) => item.providerContentTypeId === contentTypeId,
    );
    if (place) candidates.set(place.contentId, place);
  }

  let diagnosticLegacy = false;
  if (candidates.size === 0) {
    const unfiltered = await service.listPlaces({
      regionCode: BUSAN_REGION_CODE,
      page: 1,
      pageSize: 1,
    });
    const place = unfiltered.places[0];
    if (place) {
      candidates.set(place.contentId, place);
      diagnosticLegacy = true;
    }
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
  const conditionCounts = new Map<string, number>();
  const examples: string[] = [];
  const unknownCodes = new Set<string>();
  let conflicts = 0;
  let assessed = 0;

  for (const place of [...candidates.values()].slice(0, MAX_SUPPORTED_DETAILS)) {
    const requestedType = place.contentTypeId ?? undefined;
    const detail = await service.getPlaceDetail(
      place.contentId,
      requestedType as TourContentTypeId | undefined,
    );
    const assessment = evaluateTourPetAccess(
      createTrustedTourPetAccessInput(detail),
    );
    if (
      diagnosticLegacy &&
      assessment.evaluationState !== "not_applicable"
    ) {
      throw new Error("LEGACY_DIAGNOSTIC_EXPECTED_NOT_APPLICABLE");
    }
    assessed += 1;
    verdictCounts[assessment.verdict] += 1;
    stateCounts[assessment.evaluationState] += 1;
    conflicts += assessment.conflicts.length;
    assessment.conditions.forEach((condition) => {
      conditionCounts.set(
        condition.type,
        (conditionCounts.get(condition.type) ?? 0) + 1,
      );
    });
    assessment.evidence
      .filter(
        (evidence) =>
          evidence.field === "acmpyTypeCd" && evidence.assertion === "unknown",
      )
      .forEach((evidence) => unknownCodes.add(safeSummary(evidence.originalText)));
    const firstEvidence = assessment.evidence[0];
    if (firstEvidence && examples.length < 2) {
      examples.push(
        `${assessment.verdict}:${firstEvidence.field}:${safeSummary(firstEvidence.originalText)}`,
      );
    }
  }

  console.log(`LIVE_PET_ACCESS_PROVIDER_CALLS=${providerCalls}`);
  console.log(`LIVE_PET_ACCESS_ASSESSED=${assessed}`);
  console.log(`LIVE_PET_ACCESS_LEGACY_DIAGNOSTIC=${diagnosticLegacy}`);
  console.log(`LIVE_PET_ACCESS_VERDICTS=${JSON.stringify(verdictCounts)}`);
  console.log(`LIVE_PET_ACCESS_STATES=${JSON.stringify(stateCounts)}`);
  console.log(
    `LIVE_PET_ACCESS_CONDITIONS=${JSON.stringify(Object.fromEntries(conditionCounts))}`,
  );
  console.log(`LIVE_PET_ACCESS_CONFLICTS=${conflicts}`);
  console.log(`LIVE_PET_ACCESS_UNKNOWN_CODES=${JSON.stringify([...unknownCodes])}`);
  examples.forEach((example, index) => {
    console.log(`LIVE_PET_ACCESS_EXAMPLE_${index + 1}=${example}`);
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
