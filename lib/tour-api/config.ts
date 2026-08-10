import "server-only";

import { TourProviderError } from "@/lib/tour-api/errors";

export interface TourApiConfig {
  baseUrl: string;
  serviceKey: string;
  mobileOs: "ETC";
  mobileApp: "PetPass";
}

const TOUR_API_ORIGIN = "https://apis.data.go.kr";
const TOUR_API_PATH = "/B551011/KorPetTourService2";
const URL_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

function invalidTourBaseUrl(): TourProviderError {
  return new TourProviderError(
    "CONFIGURATION",
    "TOUR_API_BASE_URL이 승인된 관광 API 주소와 일치하지 않습니다.",
  );
}

export function validateTourApiBaseUrl(value: string): string {
  if (
    value.length === 0 ||
    value.trim() !== value ||
    URL_CONTROL_CHARACTERS.test(value)
  ) {
    throw invalidTourBaseUrl();
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TourProviderError(
      "CONFIGURATION",
      "TOUR_API_BASE_URL 형식이 올바르지 않습니다.",
    );
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== TOUR_API_ORIGIN ||
    parsed.hostname !== "apis.data.go.kr" ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    (parsed.pathname !== TOUR_API_PATH &&
      parsed.pathname !== `${TOUR_API_PATH}/`) ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw invalidTourBaseUrl();
  }

  const acceptedForms = new Set([
    `${TOUR_API_ORIGIN}${TOUR_API_PATH}`,
    `${TOUR_API_ORIGIN}${TOUR_API_PATH}/`,
    `https://apis.data.go.kr:443${TOUR_API_PATH}`,
    `https://apis.data.go.kr:443${TOUR_API_PATH}/`,
  ]);
  if (!acceptedForms.has(value)) throw invalidTourBaseUrl();

  return `${TOUR_API_ORIGIN}${TOUR_API_PATH}`;
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

  const validatedBaseUrl = validateTourApiBaseUrl(baseUrl);

  return {
    baseUrl: validatedBaseUrl,
    serviceKey,
    mobileOs: "ETC",
    mobileApp: "PetPass",
  };
}
