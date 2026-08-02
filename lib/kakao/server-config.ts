import "server-only";

import { ConfigurationRequiredError } from "@/lib/shared/errors";

export function getKakaoRestApiKey(): string {
  const key = process.env.KAKAO_REST_API_KEY?.trim();

  if (!key) {
    throw new ConfigurationRequiredError(
      "서버 환경변수 KAKAO_REST_API_KEY가 설정되지 않았습니다.",
    );
  }

  return key;
}
