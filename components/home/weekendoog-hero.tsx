import Image from "next/image";
import { ArrowRight, PawPrint, ShieldCheck } from "lucide-react";
import { HeroPlannerLauncher } from "@/components/home/hero-planner-launcher";
import { ButtonLink } from "@/components/ui/button";

export function WeekendoogHero() {
  return (
    <section className="weekendoog-hero overflow-hidden bg-[var(--background)] pb-8 pt-7 sm:pb-12 sm:pt-10 lg:pb-32 lg:pt-12">
      <div className="weekendoog-shell relative mx-auto w-[calc(100%-24px)] max-w-[1280px] sm:w-[calc(100%-32px)]">
        <div className="grid items-center gap-7 lg:grid-cols-[.9fr_1.1fr] lg:gap-10">
          <div className="weekendoog-hero-copy relative z-10 max-w-[620px] py-2 lg:pb-20 lg:pt-8">
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

          <div className="weekendoog-hero-media relative min-h-[300px] overflow-hidden rounded-[24px] bg-[#eaf2e9] sm:min-h-[390px] lg:min-h-[500px]">
            <Image
              src="/og.png"
              alt="여행을 준비하는 반려견과 이동장 일러스트"
              fill
              loading="eager"
              fetchPriority="high"
              sizes="(max-width: 767px) 760px, (max-width: 1023px) 1200px, 1400px"
              className="origin-bottom-left scale-[2.12] object-cover object-[50%_100%]"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#faf8f3]/70 via-transparent to-transparent lg:from-[#faf8f3]/50"
              aria-hidden="true"
            />
            <div className="absolute bottom-4 right-4 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-xs font-extrabold text-[var(--brand)] shadow-sm">
              부산에서 시작하는 반려동물 여행
            </div>
          </div>
        </div>

        <div className="relative z-20 mt-5 lg:absolute lg:-bottom-32 lg:left-0 lg:mt-0 lg:w-[660px]">
          <HeroPlannerLauncher />
        </div>
      </div>
    </section>
  );
}
