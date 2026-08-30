import { HeroPhotoCarousel } from "@/components/home/hero-photo-carousel";
import { HeroPlannerLauncher } from "@/components/home/hero-planner-launcher";

export function WeekendoogHero() {
  return (
    <section className="weekendoog-hero" aria-labelledby="weekendoog-hero-heading">
      <div className="weekendoog-shell weekendoog-hero-layout">
        <div className="weekendoog-hero-media">
          <HeroPhotoCarousel />
        </div>

        <div className="weekendoog-hero-copy">
          <h1 id="weekendoog-hero-heading">
            반려견과 함께,
            <br />
            부산 여행을 계획해보세요
          </h1>
          <p>
            공식 반려동물 동반 정보를 확인하고 실제 이동시간을 고려해
            <br className="weekendoog-hero-copy-break" /> 우리 아이와 함께할 하루 일정을 만듭니다.
          </p>
        </div>

        <div className="weekendoog-hero-launcher">
          <HeroPlannerLauncher />
        </div>
      </div>
    </section>
  );
}
