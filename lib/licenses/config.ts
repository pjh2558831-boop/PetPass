import "server-only";

import { LocalDataProviderError } from "@/lib/licenses/errors";
import type { LocalDataDataset } from "@/types/license";

const EXPECTED_BASE_ENDPOINTS: Record<LocalDataDataset, string> = {
  general_restaurants: "https://apis.data.go.kr/1741000/general_restaurants",
  rest_cafes: "https://apis.data.go.kr/1741000/rest_cafes",
  lodgings: "https://apis.data.go.kr/1741000/lodgings",
  tourist_accommodations:
    "https://apis.data.go.kr/1741000/tourist_accommodations",
  tourist_pensions: "https://apis.data.go.kr/1741000/tourist_pensions",
};

const ENVIRONMENT_NAMES: Record<LocalDataDataset, string> = {
  general_restaurants: "LOCALDATA_GENERAL_RESTAURANTS_ENDPOINT",
  rest_cafes: "LOCALDATA_REST_CAFES_ENDPOINT",
  lodgings: "LOCALDATA_LODGINGS_ENDPOINT",
  tourist_accommodations: "LOCALDATA_TOURIST_ACCOMMODATIONS_ENDPOINT",
  tourist_pensions: "LOCALDATA_TOURIST_PENSIONS_ENDPOINT",
};

export interface LocalDataConfig {
  serviceKey: string;
  /** Canonical operation endpoints, each ending in `/info`. */
  endpoints: Record<LocalDataDataset, string>;
}

export function normalizeLocalDataInfoEndpoint(
  value: string | undefined,
  dataset: LocalDataDataset,
): string {
  if (!value) {
    throw new LocalDataProviderError(
      "CONFIGURATION",
      `${dataset} LocalData 엔드포인트가 설정되지 않았습니다.`,
      { dataset },
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new LocalDataProviderError(
      "CONFIGURATION",
      `${dataset} LocalData 엔드포인트 형식이 올바르지 않습니다.`,
      { dataset },
    );
  }
  const pathname = parsed.pathname.replace(/\/+$/u, "").replace(/\/info$/u, "");
  const normalizedBase = `${parsed.origin}${pathname}`;
  if (
    parsed.protocol !== "https:" ||
    parsed.search ||
    parsed.hash ||
    normalizedBase !== EXPECTED_BASE_ENDPOINTS[dataset]
  ) {
    throw new LocalDataProviderError(
      "CONFIGURATION",
      `${dataset} LocalData 엔드포인트가 승인된 주소와 일치하지 않습니다.`,
      { dataset },
    );
  }
  return `${normalizedBase}/info`;
}

export function getLocalDataConfig(
  environment: NodeJS.ProcessEnv = process.env,
): LocalDataConfig {
  const serviceKey = environment.LOCALDATA_SERVICE_KEY;
  if (!serviceKey || /^\s*$/u.test(serviceKey)) {
    throw new LocalDataProviderError(
      "CONFIGURATION",
      "LOCALDATA_SERVICE_KEY가 설정되지 않았습니다.",
    );
  }

  return {
    serviceKey,
    endpoints: Object.fromEntries(
      Object.entries(ENVIRONMENT_NAMES).map(([dataset, environmentName]) => [
        dataset,
        normalizeLocalDataInfoEndpoint(
          environment[environmentName],
          dataset as LocalDataDataset,
        ),
      ]),
    ) as Record<LocalDataDataset, string>,
  };
}
