import { describe, expect, it } from "vitest";
import {
  WEEKENDOG_EXAMPLE_COURSE,
  WEEKENDOG_PROCESS_STEPS,
} from "@/lib/homepage/editorial-content";

describe("homepage editorial content", () => {
  it("keeps the approved three-stage process in order", () => {
    expect(WEEKENDOG_PROCESS_STEPS.map(({ number, title }) => ({ number, title }))).toEqual([
      { number: 1, title: "여행 정보 입력" },
      { number: 2, title: "동반 가능한 장소 확인" },
      { number: 3, title: "이동시간을 반영한 맞춤 일정" },
    ]);
  });

  it("changes only the course image while preserving the approved four-stop copy", () => {
    expect(WEEKENDOG_EXAMPLE_COURSE.imageSrc).toBe(
      "/images/home/hero/weekendog-busan-city-ver2.webp",
    );
    expect(WEEKENDOG_EXAMPLE_COURSE.title).toBe("부산에서 보내는 반려견과의 하루");
    expect(WEEKENDOG_EXAMPLE_COURSE.stops).toEqual([
      { time: "09:00", title: "바닷가 산책", note: "현장 안내 확인" },
      { time: "11:30", title: "점심 식사", note: "동반 조건 확인" },
      { time: "14:00", title: "여유로운 휴식", note: "운영시간 확인" },
      { time: "17:00", title: "마무리 산책", note: "귀가 동선 확인" },
    ]);
    expect(WEEKENDOG_EXAMPLE_COURSE.disclosure).toMatch(/개인화 결과가 아니며/u);
  });
});
