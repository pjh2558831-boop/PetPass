const KAKAO_PLACE_ORIGIN = "https://place.map.kakao.com";
const KAKAO_PLACE_PROVIDER_URL =
  /^https?:\/\/place\.map\.kakao\.com\/(\d{1,128})$/u;
const URL_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export function parseKakaoPlaceUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    value.trim() !== value ||
    URL_CONTROL_CHARACTERS.test(value)
  ) {
    return null;
  }

  const match = KAKAO_PLACE_PROVIDER_URL.exec(value);
  if (!match) return null;

  return `${KAKAO_PLACE_ORIGIN}/${match[1]}`;
}
