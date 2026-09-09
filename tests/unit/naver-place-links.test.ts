import { describe, expect, it } from "vitest";
import { buildNaverPlaceLinks } from "@/lib/places/naver-search-links";

describe("external NAVER searches", () => {
  it.each(["부산광역시", "서울특별시", "경기도", "강원특별자치도", "제주특별자치도", "세종특별자치시", "전북특별자치도"])("preserves actual identity in %s", region => {
    const name = "카페 & 숲 강변점";
    const address = `${region} 한길 12 2층`;
    const links = buildNaverPlaceLinks({ name, address });
    expect(new URL(links!.local).searchParams.get("query")).toBe(`${name} ${address}`);
    expect(new URL(links!.image).searchParams.get("where")).toBe("image");
    expect(new URL(links!.local).origin).toBe("https://search.naver.com");
  });
  it("does not invent a locality or search placeholder names", () => {
    expect(new URL(buildNaverPlaceLinks({ name: "한강점", address: "주소 확인 필요" })!.local).searchParams.get("query")).toBe("한강점");
    expect(buildNaverPlaceLinks({ name: "이름 확인 필요" })).toBeNull();
    expect(buildNaverPlaceLinks({ name: "" })).toBeNull();
  });
});
