import { describe, expect, it } from "vitest";
import { parseKakaoPlaceUrl } from "@/lib/kakao/place-url";

describe("Kakao place URL trust boundary", () => {
  it("normalizes the official HTTP provider form to canonical HTTPS", () => {
    expect(parseKakaoPlaceUrl("http://place.map.kakao.com/26338954")).toBe(
      "https://place.map.kakao.com/26338954",
    );
  });

  it("preserves the already canonical HTTPS provider form", () => {
    expect(parseKakaoPlaceUrl("https://place.map.kakao.com/26338954")).toBe(
      "https://place.map.kakao.com/26338954",
    );
  });

  it.each([
    "",
    "not a URL",
    "//place.map.kakao.com/123",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "ftp://place.map.kakao.com/123",
    "HTTP://place.map.kakao.com/123",
    "https://PLACE.map.kakao.com/123",
    "https://user@place.map.kakao.com/123",
    "https://user:password@place.map.kakao.com/123",
    "http://place.map.kakao.com:80/123",
    "https://place.map.kakao.com:443/123",
    "https://place.map.kakao.com:444/123",
    "https://sub.place.map.kakao.com/123",
    "https://place.map.kakao.com.evil.example/123",
    "https://place-map-kakao.com/123",
    "https://place.map.kakao.com@evil.example/123",
    "https://evil.example/place.map.kakao.com/123",
    "https://place.map.kakao.com/",
    "https://place.map.kakao.com/not-numeric",
    "https://place.map.kakao.com/12_3",
    "https://place.map.kakao.com/12-3",
    "https://place.map.kakao.com/123/extra",
    "https://place.map.kakao.com/../123",
    "https://place.map.kakao.com/%31%32%33",
    "https://place.map.kakao.com/%2e%2e/123",
    "https://place.map.kakao.com/12%2f3",
    "https://place.map.kakao.com/123?redirect=https://evil.example",
    "https://place.map.kakao.com/123#unsafe",
    " https://place.map.kakao.com/123",
    "https://place.map.kakao.com/123\n",
    "https://place.map.kakao.com/12%0a3",
  ])("rejects an unsupported or ambiguous URL: %s", (value) => {
    expect(parseKakaoPlaceUrl(value)).toBeNull();
  });

  it("rejects a missing value", () => {
    expect(parseKakaoPlaceUrl(undefined)).toBeNull();
    expect(parseKakaoPlaceUrl(null)).toBeNull();
  });
});
