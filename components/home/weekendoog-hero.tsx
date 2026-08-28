import { HeroPhotoCarousel } from "@/components/home/hero-photo-carousel";
import { HeroPlannerLauncher } from "@/components/home/hero-planner-launcher";

export function WeekendoogHero() {
  return (
    <section className="weekendoog-hero overflow-hidden bg-[var(--background)]">
      <div className="weekendoog-shell weekendoog-hero-layout">
        <div className="weekendoog-hero-copy relative z-10 max-w-[590px]">
            <h1 className="text-[34px] font-black leading-[1.08] tracking-[-0.055em] text-[var(--foreground)] sm:text-[46px] lg:text-[64px]">
              반려견과 함께,
              <br />
              어디로 떠나볼까요?
            </h1>
            <p className="mt-5 max-w-[540px] text-[15px] font-medium leading-[1.75] text-[var(--muted)] sm:text-[17px]">
              공식 반려동물 동반 정보와 이동 동선을 바탕으로
              <br />
              가장 자연스러운 하루 일정을 제안해드려요.
            </p>
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
