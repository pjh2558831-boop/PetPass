import Image from "next/image";
import {
  WEEKENDOG_PUBLIC_DATA_SOURCES,
  type PublicDataSourceIcon,
} from "@/lib/homepage/editorial-content";

interface PartnerAsset {
  src: string;
  width: number;
  height: number;
}

const PARTNER_ASSETS: Record<PublicDataSourceIcon, PartnerAsset> = {
  tourism: {
    src: "/brand/partners/kto-horizontal-ko-transparent.png",
    width: 710,
    height: 242,
  },
  map: {
    src: "/brand/partners/kakaomap-horizontal-ko.png",
    width: 1434,
    height: 504,
  },
  administration: {
    src: "/brand/partners/mois-horizontal-ko-transparent-trimmed.png",
    width: 419,
    height: 108,
  },
};

export function PublicDataTrustCard() {
  return (
    <article className="weekendoog-public-data-card" data-layout="partner-strip">
      <div className="weekendoog-trust-intro">
        <h2>
          신뢰할 수 있는 공공데이터를 사용합니다
        </h2>
        <p>
          WEEKENDOG은 공식 기관의 정보를 바탕으로 더 안전한 여행을 돕습니다.
        </p>
      </div>

      <ul className="weekendoog-partner-list" aria-label="WEEKENDOG 데이터 제공 기관">
        {WEEKENDOG_PUBLIC_DATA_SOURCES.map((source) => {
          const partnerAsset = PARTNER_ASSETS[source.icon];
          return (
            <li
              key={source.name}
              className="weekendoog-partner-card"
              data-partner={source.icon}
            >
              <div className="weekendoog-partner-mark">
                <Image
                  src={partnerAsset.src}
                  alt={`${source.name} 공식 로고`}
                  width={partnerAsset.width}
                  height={partnerAsset.height}
                  sizes="(max-width: 767px) 150px, 180px"
                />
              </div>
              <span className="sr-only">{source.name} — {source.detail}</span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
