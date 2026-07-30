import { ConfigurationRequiredError, ProviderResponseError } from "@/lib/shared/errors";
import { tourResponseSchema, type TourResponse } from "@/lib/tour-api/schemas";

const BASE_URL = "https://apis.data.go.kr/B551011/KorPetTourService2";
const ALLOWED_OPERATIONS = new Set([
  "ldongCode2",
  "lclsSystmCode2",
  "areaBasedList2",
  "searchKeyword2",
  "detailCommon2",
  "detailIntro2",
  "detailPetTour2",
  "locationBasedList2",
  "detailImage2",
  "detailInfo2",
  "petTourSyncList2",
]);

export async function requestTourOperation(
  operation: string,
  params: Record<string, string>,
): Promise<TourResponse> {
  if (!ALLOWED_OPERATIONS.has(operation)) {
    throw new ProviderResponseError("지원하지 않는 관광 API 오퍼레이션입니다.");
  }

  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) {
    throw new ConfigurationRequiredError("TOUR_API_SERVICE_KEY가 설정되지 않았습니다.");
  }

  const url = new URL(`${BASE_URL}/${operation}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("MobileOS", "ETC");
  url.searchParams.set("MobileApp", "PetPass");
  url.searchParams.set("_type", "json");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new ProviderResponseError(`관광 API 요청이 ${response.status}로 실패했습니다.`);
  }

  const parsed = tourResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ProviderResponseError("관광 API 응답 형식이 예상 계약과 다릅니다.");
  }
  return parsed.data;
}
