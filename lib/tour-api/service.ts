import "server-only";

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
import type { ParsedTourResponse, TourItem } from "@/lib/tour-api/schemas";
import type {
  TourContentTypeId,
  TourOperationName,
  TourPetPolicyEvidence,
  TourPlaceDetail,
  TourPlaceList,
} from "@/types/place";

const LIST_CACHE_TTL_MS = 5 * 60 * 1_000;
const DETAIL_CACHE_TTL_MS = 15 * 60 * 1_000;

export interface TourPlacesQuery {
  regionCode: string;
  districtCode?: string;
  contentTypeId?: TourContentTypeId;
  page: number;
  pageSize: number;
}

export interface TourClientLike {
  request(
    operation: TourOperationName,
    params: Record<string, string>,
  ): Promise<ParsedTourResponse>;
}

export interface TourPlaceService {
  listPlaces(query: TourPlacesQuery): Promise<TourPlaceList>;
  getPlaceDetail(
    contentId: string,
    contentTypeId?: TourContentTypeId,
  ): Promise<TourPlaceDetail>;
}

function stableCacheKey(
  operation: TourOperationName,
  params: Record<string, string>,
): string {
  return `${operation}:${Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")}`;
}

function firstItem(result: ParsedTourResponse): TourItem | null {
  return result.items[0] ?? null;
}

function rawValue(item: TourItem | null, key: string): string | null {
  if (!item) return null;
  const candidate = item[key];
  return typeof candidate === "string" && candidate !== "" ? candidate : null;
}

function unavailable(message: string) {
  return { status: "unavailable" as const, message };
}

function available() {
  return { status: "available" as const };
}

export class KoreaTourismService implements TourPlaceService {
  constructor(
    private readonly client: TourClientLike = new TourApiClient(),
    private readonly cache = new TourRequestCache(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private requestCached(
    operation: TourOperationName,
    params: Record<string, string>,
    ttlMs: number,
  ): Promise<ParsedTourResponse> {
    return this.cache.getOrLoad(
      stableCacheKey(operation, params),
      ttlMs,
      () => this.client.request(operation, params),
    );
  }

  async listPlaces(query: TourPlacesQuery): Promise<TourPlaceList> {
    const params: Record<string, string> = {
      lDongRegnCd: query.regionCode,
      pageNo: String(query.page),
      numOfRows: String(query.pageSize),
      arrange: "A",
    };
    if (query.districtCode) params.lDongSignguCd = query.districtCode;
    if (query.contentTypeId) params.contentTypeId = query.contentTypeId;

    const response = await this.requestCached(
      "areaBasedList2",
      params,
      LIST_CACHE_TTL_MS,
    );
    const retrievedAt = this.now().toISOString();
    return {
      places: normalizeTourPlaceSummaries(response.items, {
        operation: "areaBasedList2",
        retrievedAt,
        fallbackContentTypeId: query.contentTypeId,
      }),
      page: response.pageNo || query.page,
      pageSize: response.numOfRows || query.pageSize,
      totalCount: response.totalCount,
      source: {
        provider: getTourProviderName(),
        operation: "areaBasedList2",
        retrievedAt,
      },
    };
  }

  private getCommon(contentId: string): Promise<TourItem | null> {
    return this.requestCached(
      "detailCommon2",
      { contentId },
      DETAIL_CACHE_TTL_MS,
    ).then(firstItem);
  }

  private getIntro(
    contentId: string,
    contentTypeId: TourContentTypeId,
  ): Promise<TourItem | null> {
    return this.requestCached(
      "detailIntro2",
      { contentId, contentTypeId },
      DETAIL_CACHE_TTL_MS,
    ).then(firstItem);
  }

  private getPet(contentId: string): Promise<TourItem | null> {
    return this.requestCached(
      "detailPetTour2",
      { contentId },
      DETAIL_CACHE_TTL_MS,
    ).then(firstItem);
  }

  async getPetPolicyEvidence(contentId: string): Promise<TourPetPolicyEvidence> {
    const item = await this.getPet(contentId);
    const evidence = normalizePetPolicyEvidence(item, {
      contentId,
      retrievedAt: this.now().toISOString(),
    });
    if (!evidence) {
      throw new TourProviderError(
        "NOT_FOUND",
        "반려동물 동반 원문 정보를 찾지 못했습니다.",
        { operation: "detailPetTour2" },
      );
    }
    return evidence;
  }

  async getPlaceDetail(
    contentId: string,
    requestedContentTypeId?: TourContentTypeId,
  ): Promise<TourPlaceDetail> {
    let commonResult: PromiseSettledResult<TourItem | null>;
    let introResult: PromiseSettledResult<TourItem | null>;
    let petResult: PromiseSettledResult<TourItem | null>;

    if (requestedContentTypeId) {
      [commonResult, introResult, petResult] = await Promise.allSettled([
        this.getCommon(contentId),
        this.getIntro(contentId, requestedContentTypeId),
        this.getPet(contentId),
      ]);
    } else {
      [commonResult, petResult] = await Promise.allSettled([
        this.getCommon(contentId),
        this.getPet(contentId),
      ]);
      const commonItem =
        commonResult.status === "fulfilled" ? commonResult.value : null;
      const derivedContentTypeId = normalizeTourContentTypeId(
        rawValue(commonItem, "contenttypeid"),
      );
      introResult = derivedContentTypeId
        ? await Promise.resolve(
            this.getIntro(contentId, derivedContentTypeId),
          ).then(
            (value): PromiseSettledResult<TourItem | null> => ({
              status: "fulfilled",
              value,
            }),
            (reason): PromiseSettledResult<TourItem | null> => ({
              status: "rejected",
              reason,
            }),
          )
        : {
            status: "rejected",
            reason: new TourProviderError(
              "INVALID_RESPONSE",
              "상세 소개 조회에 필요한 콘텐츠 유형을 확인하지 못했습니다.",
              { operation: "detailIntro2" },
            ),
          };
    }

    const commonItem =
      commonResult.status === "fulfilled" ? commonResult.value : null;
    const introItem = introResult.status === "fulfilled" ? introResult.value : null;
    const petItem = petResult.status === "fulfilled" ? petResult.value : null;
    if (!commonItem && !introItem && !petItem) {
      const rejected = [commonResult, introResult, petResult].find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (rejected?.reason instanceof TourProviderError) throw rejected.reason;
      throw new TourProviderError(
        "NOT_FOUND",
        "관광지 상세 정보를 찾지 못했습니다.",
        { operation: "detailCommon2" },
      );
    }

    const retrievedAt = this.now().toISOString();
    const resolvedContentTypeId =
      normalizeTourContentTypeId(rawValue(commonItem, "contenttypeid")) ??
      requestedContentTypeId ??
      normalizeTourContentTypeId(rawValue(introItem, "contenttypeid"));
    const summary = normalizeTourPlaceSummary(
      commonItem ?? introItem ?? petItem ?? {},
      {
        operation: "detailCommon2",
        retrievedAt,
        fallbackContentId: contentId,
        fallbackContentTypeId: resolvedContentTypeId,
      },
    );
    if (!summary) {
      throw new TourProviderError(
        "INVALID_RESPONSE",
        "관광지 상세 정보를 정규화하지 못했습니다.",
        { operation: "detailCommon2" },
      );
    }

    const intro = normalizeTourIntroDetails(introItem);
    const petPolicyEvidence = normalizePetPolicyEvidence(petItem, {
      contentId,
      retrievedAt,
    });
    const trustedProviderContentTypeId = normalizeTourContentTypeId(
      summary.providerContentTypeId,
    );
    const introPetPolicyEvidence = normalizeIntroPetPolicyEvidence(
      introItem,
      trustedProviderContentTypeId,
      { contentId, retrievedAt },
    );
    const providerModifiedTime =
      rawValue(commonItem, "modifiedtime") ??
      rawValue(introItem, "modifiedtime") ??
      rawValue(petItem, "modifiedtime");

    return {
      summary,
      overview: sanitizeProviderText(rawValue(commonItem, "overview")),
      homepageUrl: extractSafeHomepageUrl(rawValue(commonItem, "homepage")),
      ...intro,
      providerModifiedTime,
      petPolicyEvidence,
      introPetPolicyEvidence,
      sections: {
        common: commonResult.status === "fulfilled"
          ? available()
          : unavailable("기본 상세 정보를 불러오지 못했습니다."),
        intro: introResult.status === "fulfilled"
          ? available()
          : unavailable("운영 상세 정보를 불러오지 못했습니다."),
        petPolicy: petResult.status === "fulfilled"
          ? available()
          : unavailable("반려동물 동반 원문 정보를 불러오지 못했습니다."),
      },
      source: {
        provider: getTourProviderName(),
        operation: "detailCommon2",
        contentId,
        providerModifiedTime,
        retrievedAt,
      },
    };
  }
}

let defaultService: KoreaTourismService | undefined;

export function getDefaultTourService(): KoreaTourismService {
  defaultService ??= new KoreaTourismService();
  return defaultService;
}
