import { fetchKakaoStaticMap, staticMapThumbnailsEnabled } from "@/lib/kakao/static-map";
import { findPublicMapPlaceLocation } from "@/lib/map-places/public-catalog";
import { getRegionConfig } from "@/lib/regions/config";
import { consumeRateLimit, getRequestClientId, rateLimitHeaders, type RateLimitDecision } from "@/lib/shared/rate-limit";
import { getDefaultTourService } from "@/lib/tour-api/service";
import type { RegionId } from "@/types/region";

const SUCCESS_CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";

export interface LocationThumbnailDependencies {
  enabled?: () => boolean;
  findLocation?: typeof findPublicMapPlaceLocation;
  findTourLocation?: (
    regionId: RegionId,
    contentId: string,
  ) => Promise<{ latitude: number; longitude: number } | null>;
  fetchMap?: typeof fetchKakaoStaticMap;
  rateLimit?: (request: Request) => RateLimitDecision;
}

async function findTourPlaceLocation(
  regionId: RegionId,
  contentId: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const region = getRegionConfig(regionId);
  const detail = await getDefaultTourService().getPlaceScheduleDetail(contentId);
  const { latitude, longitude, legalRegionCode } = detail.summary;
  if (
    legalRegionCode !==
      region.providerCodes.korPetTourService2.legalDongRegionCode ||
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  return { latitude, longitude };
}

export function createLocationThumbnailHandler(dependencies: LocationThumbnailDependencies = {}) {
  return async function GET(
    request: Request,
    context: { params: Promise<{ placeId: string }> },
  ): Promise<Response> {
    const limit = dependencies.rateLimit?.(request) ?? consumeRateLimit(
      "location-thumbnail",
      getRequestClientId(request),
      { limit: 60, windowMs: 60_000 },
    );
    if (!limit.allowed) {
      return Response.json({ error: "요청이 너무 많습니다." }, {
        status: 429,
        headers: { "Cache-Control": "no-store", ...rateLimitHeaders(limit) },
      });
    }
    if (!(dependencies.enabled ?? staticMapThumbnailsEnabled)()) {
      return Response.json({ error: "위치 미리보기가 비활성화되어 있습니다." }, {
        status: 404,
        headers: { "Cache-Control": "no-store", ...rateLimitHeaders(limit) },
      });
    }
    const { placeId } = await context.params;
    const region = getRegionConfig(new URL(request.url).searchParams.get("region"));
    const match = /^(kakao|tour):(\d{1,128})$/u.exec(placeId);
    const provider = match?.[1];
    const providerPlaceId = match?.[2];
    if (
      !provider ||
      !providerPlaceId ||
      !region?.mapEnabled ||
      (provider === "kakao" && !region.kakaoDiscoveryEnabled)
    ) {
      return Response.json({ error: "알려진 장소 ID가 아닙니다." }, {
        status: 400,
        headers: { "Cache-Control": "no-store", ...rateLimitHeaders(limit) },
      });
    }
    try {
      const location = provider === "tour"
        ? await (dependencies.findTourLocation ?? findTourPlaceLocation)(
            region.id,
            providerPlaceId,
          )
        : await (dependencies.findLocation ?? findPublicMapPlaceLocation)(
            region.id,
            providerPlaceId,
          );
      if (!location) {
        return Response.json({ error: "공개된 장소를 찾지 못했습니다." }, {
          status: 404,
          headers: { "Cache-Control": "no-store", ...rateLimitHeaders(limit) },
        });
      }
      const image = await (dependencies.fetchMap ?? fetchKakaoStaticMap)(location);
      return new Response(image.body, {
        headers: {
          "Content-Type": image.contentType,
          "Cache-Control": SUCCESS_CACHE,
          "X-Content-Type-Options": "nosniff",
          ...rateLimitHeaders(limit),
        },
      });
    } catch {
      return Response.json({ error: "위치 미리보기를 불러오지 못했습니다." }, {
        status: 502,
        headers: { "Cache-Control": "no-store", ...rateLimitHeaders(limit) },
      });
    }
  };
}

export const GET = createLocationThumbnailHandler();
