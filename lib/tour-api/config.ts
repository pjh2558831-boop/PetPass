import "server-only";

import { TourProviderError } from "@/lib/tour-api/errors";

export interface TourApiConfig {
  baseUrl: string;
  serviceKey: string;
  mobileOs: "ETC";
  mobileApp: "PetPass";
}

export function getTourApiConfig(
  environment: NodeJS.ProcessEnv = process.env,
): TourApiConfig {
  const serviceKey = environment.TOUR_API_SERVICE_KEY;
  const baseUrl = environment.TOUR_API_BASE_URL;

  if (!serviceKey || /^\s*$/.test(serviceKey)) {
    throw new TourProviderError(
      "CONFIGURATION",
      "TOUR_API_SERVICE_KEY가 설정되지 않았습니다.",
    );
  }
  if (!baseUrl) {
    throw new TourProviderError(
      "CONFIGURATION",
      "TOUR_API_BASE_URL이 설정되지 않았습니다.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new TourProviderError(
      "CONFIGURATION",
      "TOUR_API_BASE_URL 형식이 올바르지 않습니다.",
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "apis.data.go.kr" ||
    !parsed.pathname.endsWith("/B551011/KorPetTourService2")
  ) {
    throw new TourProviderError(
      "CONFIGURATION",
      "TOUR_API_BASE_URL이 승인된 관광 API 주소와 일치하지 않습니다.",
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    serviceKey,
    mobileOs: "ETC",
    mobileApp: "PetPass",
  };
}
