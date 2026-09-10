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
    <section className="weekendoog-public-data" aria-label="데이터 제공처">
      <div className="weekendoog-partner-strip">
        <p>함께 확인하는 데이터 제공처</p>
        <ul className="weekendoog-partner-row" aria-label="WEEKENDOG 데이터 제공 기관">
          {WEEKENDOG_PUBLIC_DATA_SOURCES.map((source) => {
            const partnerAsset = PARTNER_ASSETS[source.icon];
            return (
              <li key={source.name} className="weekendoog-partner-item" data-partner={source.icon}>
                <Image
                  src={partnerAsset.src}
                  alt={`${source.name} 공식 로고`}
                  width={partnerAsset.width}
                  height={partnerAsset.height}
                  sizes="(max-width: 767px) 120px, 160px"
                />
                <span className="sr-only">{source.name} — {source.detail}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
