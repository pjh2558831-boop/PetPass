import { ArrowRight, PawPrint, ShieldCheck } from "lucide-react";
import { HeroPhotoCarousel } from "@/components/home/hero-photo-carousel";
import { HeroPlannerLauncher } from "@/components/home/hero-planner-launcher";
import { ButtonLink } from "@/components/ui/button";

export function WeekendoogHero() {
  return (
    <section className="weekendoog-hero overflow-hidden bg-[var(--background)]">
      <div className="weekendoog-shell weekendoog-hero-layout">
        <div className="weekendoog-hero-copy relative z-10 max-w-[590px]">
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-extrabold text-[var(--brand)]">
              <ShieldCheck size={15} aria-hidden="true" />
              공식 데이터 기반 반려동물 여행
            </p>
            <h1 className="mt-5 text-[34px] font-black leading-[1.08] tracking-[-0.055em] text-[var(--foreground)] sm:text-[46px] lg:text-[64px]">
              반려견과 함께,
              <br />
              어디로 떠나볼까요?
            </h1>
            <p className="mt-5 max-w-[520px] text-[15px] font-medium leading-[1.75] text-[var(--muted)] sm:text-[17px]">
              공식 반려동물 동반 정보를 확인하고,
              <br />
              이동시간과 여행 조건을 고려해
              <br />
              가장 자연스러운 하루를 만들어드려요.
            </p>
            <ButtonLink
              href="/planner/pet"
              variant="brand"
              className="weekendoog-hero-direct-cta mt-6 w-full sm:w-auto"
            >
              <PawPrint size={17} aria-hidden="true" />
              여행 일정 만들기
              <ArrowRight size={17} aria-hidden="true" />
            </ButtonLink>
        </div>

        <div className="weekendoog-hero-media">
          <HeroPhotoCarousel />
        </div>

        <div className="weekendoog-hero-launcher relative z-20">
          <HeroPlannerLauncher />
        </div>
      </div>
    </section>
  );
}
