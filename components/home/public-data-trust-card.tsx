import Image from "next/image";
import {
  Building2,
  Landmark,
  MapPinned,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  WEEKENDOG_PUBLIC_DATA_SOURCES,
  type PublicDataSourceIcon,
} from "@/lib/homepage/editorial-content";

const SOURCE_ICONS: Record<PublicDataSourceIcon, LucideIcon> = {
  tourism: Landmark,
  map: MapPinned,
  administration: Building2,
};

const PARTNER_ASSETS: Partial<Record<PublicDataSourceIcon, string>> = {
  map: "/brand/partners/kakaomap-horizontal-ko.png",
  administration: "/brand/partners/mois-horizontal-ko.jpg",
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
          const Icon = SOURCE_ICONS[source.icon];
          const partnerAsset = PARTNER_ASSETS[source.icon];
          return (
            <li key={source.name} className="rounded-[18px] bg-[var(--surface-muted)] p-4">
              <div className="weekendoog-partner-mark">
                {partnerAsset ? (
                  <Image
                    src={partnerAsset}
                    alt={`${source.name} 공식 로고`}
                    width={150}
                    height={40}
                    sizes="150px"
                  />
                ) : (
                  <span className="weekendoog-partner-mark-fallback">
                    <Icon className="text-[var(--brand)]" size={23} aria-hidden="true" />
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm font-black text-[var(--foreground)]">
                {source.name}
              </p>
              <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted)]">
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
