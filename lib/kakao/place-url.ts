const KAKAO_PLACE_ORIGIN = "https://place.map.kakao.com";
const KAKAO_PLACE_PATH = /^\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
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

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.origin !== KAKAO_PLACE_ORIGIN ||
    url.hostname !== "place.map.kakao.com" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !KAKAO_PLACE_PATH.test(url.pathname)
  ) {
    return null;
  }

  const standardPortForm = url.href.replace(
    `${KAKAO_PLACE_ORIGIN}/`,
    `${KAKAO_PLACE_ORIGIN}:443/`,
  );
  if (value !== url.href && value !== standardPortForm) return null;

  return url.href;
}
