import { z } from "zod";
import {
  attachTourPetAccessEvaluationTime,
  createTrustedTourPetAccessInput,
  evaluateTourPetAccess,
} from "@/lib/pet-access/tourism/evaluator";
import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import {
  consumeRateLimit,
  getRequestClientId,
  rateLimitHeaders,
} from "@/lib/shared/rate-limit";
import { tourProviderErrorResponse } from "@/lib/tour-api/errors";
import {
  getDefaultTourService,
  type TourPlaceService,
} from "@/lib/tour-api/service";
import { createTourismSourceRecord } from "@/lib/places/source-records";
import { computePlaceTrust } from "@/lib/trust/calculator";
import { TOUR_CONTENT_TYPE_IDS } from "@/types/place";
import {
  createUnavailableLicenseResult,
  getDefaultLicenseMatchingService,
  type LicenseMatcher,
} from "@/lib/licenses/service";

const contentIdSchema = z.string().regex(/^\d{1,30}$/);
const contentTypeIdSchema = z.enum(TOUR_CONTENT_TYPE_IDS).optional();

export function createTourPlaceDetailHandler(
  service: TourPlaceService,
  licenseMatcher?: LicenseMatcher,
  now: () => Date = () => new Date(),
) {
  return async function GET(
    request: Request,
    context: { params: Promise<{ contentId: string }> },
  ): Promise<Response> {
    const rateLimit = consumeRateLimit(
      "tour-place-detail",
      getRequestClientId(request),
      { limit: 90, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return apiFailure(
        {
          code: "RATE_LIMITED",
          message: "잠시 후 관광지 상세 정보를 다시 요청해 주세요.",
          retryable: true,
        },
        429,
        rateLimitHeaders(rateLimit),
      );
    }

    const { contentId } = await context.params;
    const contentIdResult = contentIdSchema.safeParse(contentId);
    const contentTypeIdResult = contentTypeIdSchema.safeParse(
      new URL(request.url).searchParams.get("contentTypeId") ?? undefined,
    );
    if (!contentIdResult.success || !contentTypeIdResult.success) {
      return apiFailure(
        {
          code: "INVALID_REQUEST",
          message: "관광지 상세 요청 매개변수를 확인해 주세요.",
          retryable: false,
        },
        400,
      );
    }

    try {
      const tourismDetail = await service.getPlaceDetail(
        contentIdResult.data,
        contentTypeIdResult.data,
      );
      const computedAt = now().toISOString();
      const petAccessAssessment = attachTourPetAccessEvaluationTime(
        evaluateTourPetAccess(createTrustedTourPetAccessInput(tourismDetail)),
        computedAt,
      );
      let licensing;
      try {
        licensing = await (
          licenseMatcher ?? getDefaultLicenseMatchingService()
        ).matchTourPlace(tourismDetail);
      } catch {
        licensing = createUnavailableLicenseResult(
          tourismDetail.summary.providerContentTypeId === "32" &&
            tourismDetail.summary.category === "accommodation"
            ? "accommodation"
            : "food",
        );
      }
      const sourceRecords = [
        createTourismSourceRecord(
          tourismDetail.summary,
          petAccessAssessment.evidence.length > 0
            ? `반려동물 원문 근거 ${petAccessAssessment.evidence.length}건`
            : "반려동물 원문 근거 미확인",
        ),
      ];
      const trust = computePlaceTrust({
        computedAt,
        hasAnySource: true,
        tourism: {
          hasPetSpecificEvidence: petAccessAssessment.evidence.length > 0,
          retrievedAt: tourismDetail.source.retrievedAt,
        },
        sourceConflictCount: petAccessAssessment.conflicts.length,
        licensingOperatingState: licensing.operatingState,
      });
      const data = {
        ...tourismDetail,
        petAccessAssessment,
        licensing,
        sourceRecords,
        trust,
        sections: {
          ...tourismDetail.sections,
          licensing: licensing.section,
        },
      };
      return apiSuccess(data, 200, {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=120",
      });
    } catch (error) {
      return tourProviderErrorResponse(error);
    }
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ contentId: string }> },
): Promise<Response> {
  return createTourPlaceDetailHandler(
    getDefaultTourService(),
    getDefaultLicenseMatchingService(),
  )(request, context);
}
