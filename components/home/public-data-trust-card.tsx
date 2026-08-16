import Image from "next/image";
import { ShieldCheck } from "lucide-react";
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
    src: "/brand/partners/mois-horizontal-ko-transparent.png",
    width: 942,
    height: 228,
  },
};

export function PublicDataTrustCard() {
  return (
    <article className="weekendoog-public-data-card rounded-[24px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
          <ShieldCheck size={21} aria-hidden="true" />
        </span>
        <h2 className="text-xl font-black tracking-[-0.035em] text-[var(--foreground)] sm:text-2xl">
          신뢰할 수 있는 공공데이터를 사용합니다
        </h2>
      </div>

      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {WEEKENDOG_PUBLIC_DATA_SOURCES.map((source) => {
          const partnerAsset = PARTNER_ASSETS[source.icon];
          return (
            <li
              key={source.name}
              className="weekendoog-partner-card rounded-[18px] bg-[var(--surface-muted)] p-4"
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
              <p className="weekendoog-partner-title text-sm font-black text-[var(--foreground)]">
                {source.name}
              </p>
              <p className="weekendoog-partner-description text-xs font-medium leading-5 text-[var(--muted)]">
                {source.detail}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 text-xs font-medium leading-6 text-[var(--muted)]">
        공식 데이터를 중심으로 정보를 제공하며, 운영 여부와 현장 조건은 변경될 수
        있어 방문 전 추가 확인이 필요할 수 있습니다.
      </p>
    </article>
  );
}
