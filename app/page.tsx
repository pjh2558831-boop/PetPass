import { ContactCard } from "@/components/home/contact-card";
import { EmotionalCtaCard } from "@/components/home/emotional-cta-card";
import { ExampleCourseCard } from "@/components/home/example-course-card";
import { HomepageLiveExperience } from "@/components/home/homepage-live-experience";
import { PublicDataTrustCard } from "@/components/home/public-data-trust-card";
import { RecommendationProcessSection } from "@/components/home/recommendation-process-section";
import { WeekendoogHero } from "@/components/home/weekendoog-hero";

export default function HomePage() {
  return (
    <div className="weekendoog-home">
      <WeekendoogHero />

      <div className="homepage-shell weekendoog-live-shell">
        <HomepageLiveExperience />
      </div>

      <RecommendationProcessSection />

      <section
        className="homepage-shell weekendoog-lower-section"
        aria-label="여행 예시와 시작하기"
      >
        <div className="weekendoog-editorial-grid">
          <ExampleCourseCard />
          <EmotionalCtaCard />
        </div>
      </section>

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
