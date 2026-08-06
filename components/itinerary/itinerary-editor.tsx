"use client";

import { ButtonLink } from "@/components/ui/button";

export function ItineraryEditor() {
  return (
    <section
      className="surface-card p-8 text-center sm:p-10"
      aria-labelledby="itinerary-empty-heading"
    >
      <p className="eyebrow">실제 장소 기반 일정</p>
      <h1
        id="itinerary-empty-heading"
        className="mt-2 text-3xl font-black tracking-[-0.04em]"
      >
        추천 코스에서 일정을 만들어 주세요
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#64746c]">
        고정된 해운대 샘플 일정은 표시하지 않습니다. 부산 전체 또는 16개 구·군과
        반려동물 조건을 선택하면, 지원되는 한국관광공사 근거와 카카오 실제 경로로
        최대 세 코스를 계산합니다.
      </p>
      <ButtonLink href="/results?tab=recommendations" className="mt-5">
        추천 코스 만들기
      </ButtonLink>
    </section>
  );
}
