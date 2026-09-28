import { ContactCard } from "@/components/home/contact-card";
import { HomepagePetContent } from "@/components/home/homepage-pet-content";
import { HomepageLanding } from "@/components/home/homepage-landing";
import Image from "next/image";
import { PublicDataTrustCard } from "@/components/home/public-data-trust-card";
import { staticMapThumbnailsEnabled } from "@/lib/kakao/static-map";

export default function HomePage() {
  return (
    <div className="weekendoog-home">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "WEEKENDOG",
            url: "https://weekendog.site/",
            inLanguage: "ko-KR",
            description: "반려동물 동반 여행 장소와 일정을 찾는 서비스",
          }),
        }}
      />
      <HomepageLanding staticMapEnabled={staticMapThumbnailsEnabled()} />
      <HomepagePetContent />
      <div className="home-landscape" aria-hidden="true">
        <Image src="/images/home/landscape-v4.webp" alt="" fill unoptimized sizes="100vw" />
      </div>
      <section className="home-bottom-info" aria-label="데이터 출처와 문의">
        <div className="homepage-shell">
          <PublicDataTrustCard />
          <ContactCard />
        </div>
      </section>
    </div>
  );
}
