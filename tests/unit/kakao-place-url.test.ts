import { describe, expect, it } from "vitest";
import { parseKakaoPlaceUrl } from "@/lib/kakao/place-url";

describe("Kakao place URL trust boundary", () => {
  it.each([
    "https://place.map.kakao.com/123",
    "https://place.map.kakao.com/shared-kakao-place",
    "https://place.map.kakao.com/center-1291131_351456",
  ])("accepts the existing exact Kakao place form: %s", (value) => {
    expect(parseKakaoPlaceUrl(value)).toBe(value);
  });

  it("accepts the standard HTTPS port without preserving it", () => {
    expect(parseKakaoPlaceUrl("https://place.map.kakao.com:443/123")).toBe(
      "https://place.map.kakao.com/123",
    );
  });

  it.each([
    "",
    "not a URL",
    "http://place.map.kakao.com/123",
    "//place.map.kakao.com/123",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "ftp://place.map.kakao.com/123",
    "https://user@place.map.kakao.com/123",
    "https://user:password@place.map.kakao.com/123",
    "https://place.map.kakao.com:444/123",
    "https://place.map.kakao.com.evil.example/123",
    "https://place-map-kakao.com/123",
    "https://place.map.kakao.com@evil.example/123",
    "https://evil.example/place.map.kakao.com/123",
    "https://place.map.kakao.com/",
    "https://place.map.kakao.com/123/extra",
    "https://place.map.kakao.com/../123",
    "https://place.map.kakao.com/%31%32%33",
    "https://place.map.kakao.com/123?redirect=https://evil.example",
    "https://place.map.kakao.com/123#unsafe",
    " https://place.map.kakao.com/123",
    "https://place.map.kakao.com/123\n",
    "https://place.map.kakao.com/12%0a3",
  ])("rejects an unsupported or ambiguous URL: %s", (value) => {
    expect(parseKakaoPlaceUrl(value)).toBeNull();
  });
});
