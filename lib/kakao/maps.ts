import { ConfigurationRequiredError } from "@/lib/shared/errors";

declare global {
  interface Window {
    kakao?: unknown;
  }
}

export function getKakaoMapJavaScriptKey(): string {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;
  if (!key) {
    throw new ConfigurationRequiredError(
      "NEXT_PUBLIC_KAKAO_MAP_JS_KEY가 설정되지 않았습니다.",
    );
  }
  return key;
}

export function isKakaoMapsReady(): boolean {
  return typeof window !== "undefined" && Boolean(window.kakao);
}
