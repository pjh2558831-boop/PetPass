import { existsSync } from "node:fs";
import {
  createTrustedTourPetAccessInput,
  evaluateTourPetAccess,
} from "@/lib/pet-access/tourism/evaluator";
import { listTourCatalog } from "@/lib/tour-api/catalog-service";
import { TourApiClient } from "@/lib/tour-api/client";
import {
  KoreaTourismService,
  type TourClientLike,
} from "@/lib/tour-api/service";
import type { TourContentTypeId, TourPlaceDetail } from "@/types/place";

const REGION_CODE = "26";
const DEFAULT_TYPES = ["12", "14", "15", "28", "32", "39"] as const;
const SHOPPING_SAMPLE_SIZE = 12;
const MAX_PROVIDER_CALLS = 200;
const DETAIL_CONCURRENCY = 3;

if (!process.env.TOUR_API_SERVICE_KEY && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
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

function nonEmptyPetFields(detail: TourPlaceDetail): number {
  return detail.petPolicyEvidence
    ? Object.values(detail.petPolicyEvidence.fields).filter(Boolean).length
    : 0;
}

async function main() {
  if (process.env.CI) throw new Error("LIVE_AUDIT_DISABLED_IN_CI");
  const client = new TourApiClient({ transientRetryCount: 0, timeoutMs: 10_000 });
  let providerCalls = 0;
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

  const candidates: Array<{
    contentId: string;
    contentTypeId: TourContentTypeId;
    title: string | null;
    address: string | null;
    hasCoordinates: boolean;
    hasPhoto: boolean;
    sample: "complete_default_type" | "shopping_ui_page_sample";
  }> = [];

  for (const contentTypeId of DEFAULT_TYPES) {
    const result = await listTourCatalog(service, {
      regionCode: REGION_CODE,
      contentTypeId,
      page: 1,
      pageSize: 50,
    });
    for (const place of result.places) {
      candidates.push({
        contentId: place.contentId,
        contentTypeId,
        title: place.title,
        address: place.address,
        hasCoordinates: place.latitude !== null && place.longitude !== null,
        hasPhoto: Boolean(place.thumbnailUrl ?? place.imageUrl),
        sample: "complete_default_type",
      });
    }
  }

  const shopping = await listTourCatalog(service, {
    regionCode: REGION_CODE,
    contentTypeId: "38",
    page: 1,
    pageSize: SHOPPING_SAMPLE_SIZE,
  });
  for (const place of shopping.places) {
    candidates.push({
      contentId: place.contentId,
      contentTypeId: "38",
      title: place.title,
      address: place.address,
      hasCoordinates: place.latitude !== null && place.longitude !== null,
      hasPhoto: Boolean(place.thumbnailUrl ?? place.imageUrl),
      sample: "shopping_ui_page_sample",
    });
  }

  const observations = await mapWithConcurrency(
    candidates,
    DETAIL_CONCURRENCY,
    async (candidate) => {
      try {
        const detail = await service.getPlaceDetail(
          candidate.contentId,
          candidate.contentTypeId,
        );
        const assessment = evaluateTourPetAccess(
          createTrustedTourPetAccessInput(detail),
        );
        return {
          ...candidate,
          detailAvailable: true,
          petDetailItemPresent: detail.petPolicyEvidence !== null,
          nonEmptyPetFields: nonEmptyPetFields(detail),
          introPetEvidencePresent: detail.introPetPolicyEvidence !== null,
          operatingHoursPresent: detail.operatingInformation !== null,
          verdict: assessment.verdict,
          evaluationState: assessment.evaluationState,
          reasonCodes: assessment.reasonCodes,
        };
      } catch {
        return {
          ...candidate,
          detailAvailable: false,
          petDetailItemPresent: false,
          nonEmptyPetFields: 0,
          introPetEvidencePresent: false,
          operatingHoursPresent: false,
          verdict: "unavailable",
          evaluationState: "unavailable",
          reasonCodes: ["detail_unavailable"],
        };
      }
    },
  );

  for (const contentTypeId of [...DEFAULT_TYPES, "38"] as const) {
    const rows = observations.filter((row) => row.contentTypeId === contentTypeId);
    const byVerdict = Object.fromEntries(
      [...new Set(rows.map((row) => row.verdict))]
        .sort()
        .map((verdict) => [verdict, rows.filter((row) => row.verdict === verdict).length]),
    );
    const byEvaluationState = Object.fromEntries(
      [...new Set(rows.map((row) => row.evaluationState))]
        .sort()
        .map((state) => [
          state,
          rows.filter((row) => row.evaluationState === state).length,
        ]),
    );
    console.log(
      `TOURISM_DETAIL_AUDIT_TYPE=${JSON.stringify({
        contentTypeId,
        sample:
          contentTypeId === "38"
            ? `first_${SHOPPING_SAMPLE_SIZE}_alphabetical_ui_records`
            : "complete_busan_type",
        inspected: rows.length,
        detailAvailable: rows.filter((row) => row.detailAvailable).length,
        petDetailItemPresent: rows.filter((row) => row.petDetailItemPresent).length,
        petDetailWithNonEmptyFields: rows.filter((row) => row.nonEmptyPetFields > 0).length,
        introPetEvidencePresent: rows.filter((row) => row.introPetEvidencePresent).length,
        validCoordinates: rows.filter((row) => row.hasCoordinates).length,
        photoPresent: rows.filter((row) => row.hasPhoto).length,
        operatingHoursPresent: rows.filter((row) => row.operatingHoursPresent).length,
        byVerdict,
        byEvaluationState,
      })}`,
    );
  }

  const defaultRows = observations.filter(
    (row) => row.sample === "complete_default_type",
  );
  console.log(
    `TOURISM_DETAIL_AUDIT_DEFAULT_FUNNEL=${JSON.stringify({
      catalogCandidates: defaultRows.length,
      detailAvailable: defaultRows.filter((row) => row.detailAvailable).length,
      phase3Applicable: defaultRows.filter(
        (row) => !["not_applicable", "unavailable"].includes(row.evaluationState),
      ).length,
      routeEligibleByPetVerdict: defaultRows.filter((row) =>
        ["allowed", "conditional"].includes(row.verdict),
      ).length,
      routeRejectedUnknown: defaultRows.filter((row) => row.verdict === "unknown").length,
      routeRejectedNotAllowed: defaultRows.filter(
        (row) => row.verdict === "not_allowed",
      ).length,
      routeRejectedNotApplicable: defaultRows.filter(
        (row) => row.evaluationState === "not_applicable",
      ).length,
      missingPhotos: defaultRows.filter((row) => !row.hasPhoto).length,
      missingOperatingHours: defaultRows.filter(
        (row) => !row.operatingHoursPresent,
      ).length,
    })}`,
  );
  console.log(
    `TOURISM_DETAIL_AUDIT_SHOPPING_TOTAL=${JSON.stringify({
      providerTotal: shopping.totalCount,
      inspected: shopping.places.length,
      note: "bounded first UI page sample; shopping is excluded from the default catalog",
    })}`,
  );
  console.log(`TOURISM_DETAIL_AUDIT_PROVIDER_CALLS=${providerCalls}`);
  console.log("TOURISM_DETAIL_AUDIT_STATUS=success");
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  console.error(`TOURISM_DETAIL_AUDIT_STATUS=failed:${code.slice(0, 120)}`);
  process.exitCode = 1;
});
