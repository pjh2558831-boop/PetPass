import { ContactCard } from "@/components/home/contact-card";
import { ExampleCourseCard } from "@/components/home/example-course-card";
import { HomepageLiveExperience } from "@/components/home/homepage-live-experience";
import { HomepageNationwidePlaces } from "@/components/home/homepage-nationwide-places";
import { PublicDataTrustCard } from "@/components/home/public-data-trust-card";
import { RecommendationProcessSection } from "@/components/home/recommendation-process-section";
import { WeekendoogHero } from "@/components/home/weekendoog-hero";
import { staticMapThumbnailsEnabled } from "@/lib/kakao/static-map";

export default function HomePage() {
  return (
    <div className="weekendoog-home">
      <WeekendoogHero />

      <RecommendationProcessSection />

      <section
        className="homepage-shell weekendoog-lower-section"
        aria-label="여행 예시"
      >
        <ExampleCourseCard />
      </section>

      <div className="homepage-shell weekendoog-live-shell">
        <HomepageNationwidePlaces staticMapEnabled={staticMapThumbnailsEnabled()} />
        <HomepageLiveExperience
          cardsOnly
          staticMapEnabled={staticMapThumbnailsEnabled()}
        />
      </div>

      <section
        className="homepage-shell weekendoog-trust-section"
        aria-label="데이터 출처와 문의"
      >
        <div className="weekendoog-trust-grid">
          <PublicDataTrustCard />
          <ContactCard />
        </div>
      </section>
    </div>
  );
}
