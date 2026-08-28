import "server-only";

import {
  TourRequestCache,
  type TourCacheOutcome,
} from "@/lib/tour-api/cache";
import { TourApiClient } from "@/lib/tour-api/client";
import { TourProviderError } from "@/lib/tour-api/errors";
import { normalizePetEvidence } from "@/lib/tour-api/pet-evidence";
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
import {
  normalizeProviderVisibility,
  TOUR_VISIBILITY_MAX_PAGES,
  TOUR_VISIBILITY_PROVIDER_PAGE_SIZE,
} from "@/lib/tour-api/visibility";
import type {
  ProviderVisibilityResult,
  TourContentTypeId,
  TourOperationName,
  TourPetPolicyEvidence,
  TourPlaceDetail,
  TourPlaceList,
  TourSourceReference,
} from "@/types/place";

const LIST_CACHE_TTL_MS = 5 * 60 * 1_000;
const DETAIL_CACHE_TTL_MS = 15 * 60 * 1_000;

export interface TourPlacesQuery {
  regionCode: string;
  districtCode?: string;
  administrativeCodeSystem?: "legal_dong" | "area_code";
  contentTypeId?: TourContentTypeId;
  page: number;
  pageSize: number;
}

export interface TourProviderVisibilityQuery {
  regionCode: string;
  districtCode?: string;
  contentTypeId?: TourContentTypeId;
  showFlag?: "0" | "1";
  page: number;
  pageSize: number;
}

export interface TourProviderVisibilityRecord {
  contentId: string;
  contentTypeId: TourContentTypeId;
  visibility: ProviderVisibilityResult;
}

export interface TourProviderVisibilityPage {
  records: TourProviderVisibilityRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
  source: TourSourceReference & { operation: "petTourSyncList2" };
}

export interface TourRequestObservation {
  operation: TourOperationName;
  cache: TourCacheOutcome;
  /** True only for the caller that starts the upstream request. */
  liveProviderCall: boolean;
  /** Outcome of the logical provider operation; omitted for cache/coalescing events. */
  providerOutcome?: "succeeded" | "failed";
}

export type TourRequestObserver = (event: TourRequestObservation) => void;

export interface TourPlaceScheduleDetail {
  summary: TourPlaceDetail["summary"];
  overview: TourPlaceDetail["overview"];
  homepageUrl: TourPlaceDetail["homepageUrl"];
  operatingInformation: TourPlaceDetail["operatingInformation"];
  checkInTime: TourPlaceDetail["checkInTime"];
  checkOutTime: TourPlaceDetail["checkOutTime"];
  restDayInformation: TourPlaceDetail["restDayInformation"];
  parkingInformation: TourPlaceDetail["parkingInformation"];
  reservationInformation: TourPlaceDetail["reservationInformation"];
  contactInformation: TourPlaceDetail["contactInformation"];
  providerModifiedTime: TourPlaceDetail["providerModifiedTime"];
  introPetPolicyEvidence: TourPlaceDetail["introPetPolicyEvidence"];
  sections: Pick<TourPlaceDetail["sections"], "common" | "intro">;
  source: TourPlaceDetail["source"];
}

export interface TourCollectionListRecord {
  summary: TourPlaceList["places"][number] | null;
  authoritativeLegalRegionCode: string | null;
  authoritativeLegalDistrictCode: string | null;
  authoritativeAreaRegionCode: string | null;
  authoritativeAreaDistrictCode: string | null;
}

export interface TourCollectionListPage {
  records: TourCollectionListRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface TourClientLike {
  request(
    operation: TourOperationName,
    params: Record<string, string>,
  ): Promise<ParsedTourResponse>;
}

export interface TourPlaceService {
  listPlaces(
    query: TourPlacesQuery,
    observe?: TourRequestObserver,
  ): Promise<TourPlaceList>;
  listProviderVisibility?(
    query: TourProviderVisibilityQuery,
    observe?: TourRequestObserver,
  ): Promise<TourProviderVisibilityPage>;
  getPlaceScheduleDetail?(
    contentId: string,
    contentTypeId?: TourContentTypeId,
    observe?: TourRequestObserver,
  ): Promise<TourPlaceScheduleDetail>;
  completePlaceDetail?(
    schedule: TourPlaceScheduleDetail,
    observe?: TourRequestObserver,
  ): Promise<TourPlaceDetail>;
  getCollectionPlaceDetail?(
    contentId: string,
    contentTypeId?: TourContentTypeId,
    observe?: TourRequestObserver,
  ): Promise<TourPlaceDetail>;
  getPlaceDetail(
    contentId: string,
    contentTypeId?: TourContentTypeId,
    observe?: TourRequestObserver,
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

function visibilityRecord(
  item: TourItem,
  checkedAt: string,
): TourProviderVisibilityRecord {
  const contentId = rawValue(item, "contentid")?.trim() || null;
  const contentTypeId = normalizeTourContentTypeId(
    rawValue(item, "contenttypeid")?.trim(),
  );
  if (!contentId || !contentTypeId) {
    throw new TourProviderError(
      "INVALID_RESPONSE",
      "공개 상태 목록의 필수 식별자가 올바르지 않습니다.",
      { operation: "petTourSyncList2" },
    );
  }
  return {
    contentId,
    contentTypeId,
    visibility: normalizeProviderVisibility(item.showflag, checkedAt),
  };
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
    observe?: TourRequestObserver,
  ): Promise<ParsedTourResponse> {
    return this.cache.getOrLoad(
      stableCacheKey(operation, params),
      ttlMs,
      async () => {
        try {
          const response = await this.client.request(operation, params);
          observe?.({
            operation,
            cache: "miss",
            liveProviderCall: false,
            providerOutcome: "succeeded",
          });
          return response;
        } catch (error) {
          observe?.({
            operation,
            cache: "miss",
            liveProviderCall: false,
            providerOutcome: "failed",
          });
          throw error;
        }
      },
      Date.now(),
      (cache) =>
        observe?.({
          operation,
          cache,
          liveProviderCall: cache === "miss",
        }),
    );
  }

  async listPlaces(
    query: TourPlacesQuery,
    observe?: TourRequestObserver,
  ): Promise<TourPlaceList> {
    const areaCodeBased = query.administrativeCodeSystem === "area_code";
    const params: Record<string, string> = {
      [areaCodeBased ? "areaCode" : "lDongRegnCd"]: query.regionCode,
      pageNo: String(query.page),
      numOfRows: String(query.pageSize),
      arrange: "A",
    };
    if (query.districtCode) {
      params[areaCodeBased ? "sigunguCode" : "lDongSignguCd"] = query.districtCode;
    }
    if (query.contentTypeId) params.contentTypeId = query.contentTypeId;

    const response = await this.requestCached(
      "areaBasedList2",
      params,
      LIST_CACHE_TTL_MS,
      observe,
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

  async listCollectionPlaces(
    query: TourPlacesQuery,
    observe?: TourRequestObserver,
  ): Promise<TourCollectionListPage> {
    const areaCodeBased = query.administrativeCodeSystem === "area_code";
    const params: Record<string, string> = {
      [areaCodeBased ? "areaCode" : "lDongRegnCd"]: query.regionCode,
      pageNo: String(query.page),
      numOfRows: String(query.pageSize),
      arrange: "A",
    };
    if (query.districtCode) {
      params[areaCodeBased ? "sigunguCode" : "lDongSignguCd"] = query.districtCode;
    }
    if (query.contentTypeId) params.contentTypeId = query.contentTypeId;

    const response = await this.requestCached(
      "areaBasedList2",
      params,
      LIST_CACHE_TTL_MS,
      observe,
    );
    const retrievedAt = this.now().toISOString();
    return {
      records: response.items.map((item) => ({
        summary: normalizeTourPlaceSummary(item, {
          operation: "areaBasedList2",
          retrievedAt,
          fallbackContentTypeId: query.contentTypeId,
        }),
        // Collection identity must never fall back to legacy areaCode/sigunguCode.
        authoritativeLegalRegionCode:
          rawValue(item, "lDongRegnCd") ?? rawValue(item, "ldongregncd"),
        authoritativeLegalDistrictCode:
          rawValue(item, "lDongSignguCd") ?? rawValue(item, "ldongsigngucd"),
        authoritativeAreaRegionCode:
          rawValue(item, "areacode") ?? rawValue(item, "areaCode"),
        authoritativeAreaDistrictCode:
          rawValue(item, "sigungucode") ?? rawValue(item, "sigunguCode"),
      })),
      page: response.pageNo || query.page,
      pageSize: response.numOfRows || query.pageSize,
      totalCount: response.totalCount,
    };
  }

  async listProviderVisibility(
    query: TourProviderVisibilityQuery,
    observe?: TourRequestObserver,
  ): Promise<TourProviderVisibilityPage> {
    const params: Record<string, string> = {
      lDongRegnCd: query.regionCode,
      pageNo: String(query.page),
      numOfRows: String(query.pageSize),
      arrange: "A",
    };
    if (query.districtCode) params.lDongSignguCd = query.districtCode;
    if (query.contentTypeId) params.contentTypeId = query.contentTypeId;
    if (query.showFlag) params.showflag = query.showFlag;

    const response = await this.requestCached(
      "petTourSyncList2",
      params,
      LIST_CACHE_TTL_MS,
      observe,
    );
    const checkedAt = this.now().toISOString();
    return {
      records: response.items.map((item) => visibilityRecord(item, checkedAt)),
      page: response.pageNo || query.page,
      pageSize: response.numOfRows || query.pageSize,
      totalCount: response.totalCount,
      source: {
        provider: getTourProviderName(),
        operation: "petTourSyncList2",
        retrievedAt: checkedAt,
      },
    };
  }

  private async collectVisibilityRecords(
    query: Omit<TourProviderVisibilityQuery, "page" | "pageSize">,
    observe?: TourRequestObserver,
  ): Promise<TourProviderVisibilityRecord[]> {
    const providerQuery: TourProviderVisibilityQuery = {
      ...query,
      page: 1,
      pageSize: TOUR_VISIBILITY_PROVIDER_PAGE_SIZE,
    };
    const first = await this.listProviderVisibility(providerQuery, observe);
    const effectivePageSize =
      first.pageSize || TOUR_VISIBILITY_PROVIDER_PAGE_SIZE;
    const totalPages = Math.ceil(first.totalCount / effectivePageSize);
    if (totalPages > TOUR_VISIBILITY_MAX_PAGES) {
      throw new TourProviderError(
        "INVALID_RESPONSE",
        "공개 상태 목록이 안전한 페이지 조회 한도를 초과했습니다.",
        { operation: "petTourSyncList2" },
      );
    }

    const records = [...first.records];
    for (let page = 2; page <= totalPages; page += 1) {
      const next = await this.listProviderVisibility(
        { ...providerQuery, page },
        observe,
      );
      records.push(...next.records);
    }
    return records;
  }

  private async resolveProviderVisibility(
    contentId: string,
    regionCode: string,
    contentTypeId: TourContentTypeId,
    observe?: TourRequestObserver,
  ): Promise<ProviderVisibilityResult> {
    const exposedRecords = await this.collectVisibilityRecords({
      regionCode,
      contentTypeId,
      showFlag: "1",
    }, observe);
    const exposed = exposedRecords.find(
      (record) =>
        record.contentId === contentId && record.contentTypeId === contentTypeId,
    );
    if (exposed) return exposed.visibility;

    const hiddenRecords = await this.collectVisibilityRecords({
      regionCode,
      contentTypeId,
      showFlag: "0",
    }, observe);
    const hidden = hiddenRecords.find(
      (record) =>
        record.contentId === contentId && record.contentTypeId === contentTypeId,
    );
    return hidden?.visibility ?? normalizeProviderVisibility(undefined, this.now().toISOString());
  }

  private getCommon(
    contentId: string,
    observe?: TourRequestObserver,
  ): Promise<TourItem | null> {
    return this.requestCached(
      "detailCommon2",
      { contentId },
      DETAIL_CACHE_TTL_MS,
      observe,
    ).then(firstItem);
  }

  private getIntro(
    contentId: string,
    contentTypeId: TourContentTypeId,
    observe?: TourRequestObserver,
  ): Promise<TourItem | null> {
    return this.requestCached(
      "detailIntro2",
      { contentId, contentTypeId },
      DETAIL_CACHE_TTL_MS,
      observe,
    ).then(firstItem);
  }

  private getPet(
    contentId: string,
    observe?: TourRequestObserver,
  ): Promise<TourItem | null> {
    return this.requestCached(
      "detailPetTour2",
      { contentId },
      DETAIL_CACHE_TTL_MS,
      observe,
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

  private async loadPlaceScheduleDetail(
    contentId: string,
    requestedContentTypeId?: TourContentTypeId,
    observe?: TourRequestObserver,
    options: {
      requireProviderVisibility: boolean;
      allowUnavailableIntro: boolean;
    } = {
      requireProviderVisibility: true,
      allowUnavailableIntro: true,
    },
  ): Promise<TourPlaceScheduleDetail> {
    const commonItem = await this.getCommon(contentId, observe);
    if (!commonItem) {
      throw new TourProviderError(
        "NOT_FOUND",
        "관광지 상세 정보를 찾지 못했습니다.",
        { operation: "detailCommon2" },
      );
    }
    const resolvedContentTypeId = normalizeTourContentTypeId(
      rawValue(commonItem, "contenttypeid"),
    );
    if (!resolvedContentTypeId) {
      throw new TourProviderError(
        "INVALID_RESPONSE",
        "관광지의 콘텐츠 유형을 확인하지 못했습니다.",
        { operation: "detailCommon2" },
      );
    }
    if (
      requestedContentTypeId &&
      requestedContentTypeId !== resolvedContentTypeId
    ) {
      throw new TourProviderError(
        "INVALID_REQUEST",
        "요청한 콘텐츠 유형이 제공자 상세 정보와 일치하지 않습니다.",
        { operation: "detailCommon2" },
      );
    }
    const regionCode =
      rawValue(commonItem, "lDongRegnCd") ??
      rawValue(commonItem, "ldongregncd") ??
      rawValue(commonItem, "areacode");
    if (!regionCode) {
      throw new TourProviderError(
        "INVALID_RESPONSE",
        "관광지의 법정동 지역 코드를 확인하지 못했습니다.",
        { operation: "detailCommon2" },
      );
    }

    const providerVisibility = options.requireProviderVisibility
      ? await this.resolveProviderVisibility(
          contentId,
          regionCode,
          resolvedContentTypeId,
          observe,
        )
      : undefined;
    if (providerVisibility?.status === "not_exposed") {
      throw new TourProviderError(
        "NOT_FOUND",
        "관광지 상세 정보를 찾지 못했습니다.",
        { operation: "petTourSyncList2" },
      );
    }
    if (providerVisibility && providerVisibility.status !== "exposed") {
      throw new TourProviderError(
        "INVALID_RESPONSE",
        "관광지 공개 상태를 확인하지 못했습니다.",
        { operation: "petTourSyncList2" },
      );
    }

    const introResult = options.allowUnavailableIntro
      ? await Promise.resolve(
          this.getIntro(contentId, resolvedContentTypeId, observe),
        ).then(
          (value) => ({ status: "fulfilled" as const, value }),
          () => ({ status: "rejected" as const }),
        )
      : {
          status: "fulfilled" as const,
          value: await this.getIntro(contentId, resolvedContentTypeId, observe),
        };
    const introItem = introResult.status === "fulfilled" ? introResult.value : null;

    const retrievedAt = this.now().toISOString();
    const summary = normalizeTourPlaceSummary(
      commonItem,
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
      null;

    return {
      summary: providerVisibility ? { ...summary, providerVisibility } : summary,
      overview: sanitizeProviderText(rawValue(commonItem, "overview")),
      homepageUrl: extractSafeHomepageUrl(rawValue(commonItem, "homepage")),
      ...intro,
      providerModifiedTime,
      introPetPolicyEvidence,
      sections: {
        common: available(),
        intro: introResult.status === "fulfilled"
          ? available()
          : unavailable("운영 상세 정보를 불러오지 못했습니다."),
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

  async getPlaceScheduleDetail(
    contentId: string,
    requestedContentTypeId?: TourContentTypeId,
    observe?: TourRequestObserver,
  ): Promise<TourPlaceScheduleDetail> {
    return this.loadPlaceScheduleDetail(
      contentId,
      requestedContentTypeId,
      observe,
      { requireProviderVisibility: true, allowUnavailableIntro: true },
    );
  }

  async completePlaceDetail(
    schedule: TourPlaceScheduleDetail,
    observe?: TourRequestObserver,
  ): Promise<TourPlaceDetail> {
    return this.completePlaceDetailWithMode(schedule, observe, {
      allowUnavailablePet: true,
    });
  }

  private async completePlaceDetailWithMode(
    schedule: TourPlaceScheduleDetail,
    observe: TourRequestObserver | undefined,
    options: { allowUnavailablePet: boolean },
  ): Promise<TourPlaceDetail> {
    const contentId = schedule.summary.contentId;
    const petResult = options.allowUnavailablePet
      ? await Promise.resolve(this.getPet(contentId, observe)).then(
          (value) => ({ status: "fulfilled" as const, value }),
          () => ({ status: "rejected" as const }),
        )
      : {
          status: "fulfilled" as const,
          value: await this.getPet(contentId, observe),
        };
    const petItem = petResult.status === "fulfilled" ? petResult.value : null;
    const retrievedAt = this.now().toISOString();
    const petPolicyEvidence = normalizePetPolicyEvidence(petItem, {
      contentId,
      retrievedAt,
    });
    const normalizedPetEvidence = normalizePetEvidence(petItem, {
      contentId,
      retrievedAt,
      providerAvailable: petResult.status === "fulfilled",
    });
    return {
      ...schedule,
      providerModifiedTime:
        schedule.providerModifiedTime ?? rawValue(petItem, "modifiedtime"),
      petPolicyEvidence,
      normalizedPetEvidence,
      sections: {
        ...schedule.sections,
        petPolicy:
          petResult.status === "fulfilled"
            ? available()
            : unavailable("반려동물 동반 원문 정보를 불러오지 못했습니다."),
      },
    };
  }

  async getPlaceDetail(
    contentId: string,
    requestedContentTypeId?: TourContentTypeId,
    observe?: TourRequestObserver,
  ): Promise<TourPlaceDetail> {
    const schedule = await this.getPlaceScheduleDetail(
      contentId,
      requestedContentTypeId,
      observe,
    );
    return this.completePlaceDetail(schedule, observe);
  }

  async getCollectionPlaceDetail(
    contentId: string,
    requestedContentTypeId?: TourContentTypeId,
    observe?: TourRequestObserver,
  ): Promise<TourPlaceDetail> {
    const schedule = await this.loadPlaceScheduleDetail(
      contentId,
      requestedContentTypeId,
      observe,
      { requireProviderVisibility: false, allowUnavailableIntro: false },
    );
    return this.completePlaceDetailWithMode(schedule, observe, {
      allowUnavailablePet: false,
    });
  }
}

let defaultService: KoreaTourismService | undefined;

export function getDefaultTourService(): KoreaTourismService {
  defaultService ??= new KoreaTourismService();
  return defaultService;
}
