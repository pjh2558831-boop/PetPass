import { HeroPhotoCarousel } from "@/components/home/hero-photo-carousel";
import { HeroPlannerLauncher } from "@/components/home/hero-planner-launcher";

import type { RegionId } from "@/types/region";

export function WeekendoogHero({ onSearch }: { onSearch?: (query: string, regionId: RegionId) => void }) {
  return (
    <section className="weekendoog-hero" aria-labelledby="weekendoog-hero-heading">
      <div className="weekendoog-shell weekendoog-hero-layout">
        <div className="weekendoog-hero-media">
          <HeroPhotoCarousel />
        </div>

        <div className="weekendoog-hero-copy">
          <h1 id="weekendoog-hero-heading" tabIndex={-1}>
            반려견과 함께,
            <br />
            <em>전국 여행</em>을 계획해보세요
          </h1>
          <p>
            지도에서 찾고, 일정으로 이어지는
            <br className="weekendoog-hero-copy-break" /> WEEKENDOG의 특별한 여행을 만들어보세요.
          </p>
        </div>

        <div className="weekendoog-hero-launcher">
          <HeroPlannerLauncher onSearch={onSearch} />
        </div>
      </div>
    </section>
  );
}
