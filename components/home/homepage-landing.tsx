"use client";

import { useState } from "react";
import { ChevronDown, Heart, Map, Route } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { WeekendoogHero } from "./weekendoog-hero";
import { HomepageLiveExperience } from "./homepage-live-experience";
import { HomepageNationwidePlaces } from "./homepage-nationwide-places";
import { REGION_CONFIGS } from "@/lib/regions/config";
import type { RegionId } from "@/types/region";

export type HomeSearchRequest = { query: string; regionId: RegionId };

const FEATURED_REGION_IDS: RegionId[] = ["seoul", "incheon", "daejeon", "daegu", "gwangju", "busan", "ulsan", "sejong", "jeju"];
const regionImage = (regionId: RegionId) => `/images/regions/${regionId}.png`;

export function HomepageLanding({ staticMapEnabled }: { staticMapEnabled: boolean }) {
  const [region, setRegion] = useState<RegionId>("seoul");
  const [showAllRegions, setShowAllRegions] = useState(false);
  const [searchRequest, setSearchRequest] = useState<HomeSearchRequest>();
  return <>
    <WeekendoogHero onSearch={(query, regionId) => {
      setSearchRequest({ query, regionId });
      document.getElementById("home-discovery")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }} />
    <section className="homepage-shell home-value-row" aria-label="WEEKENDOG 여행 안내">
      <Link href="#home-discovery"><Map aria-hidden="true" /><span><strong>지도에서 한눈에</strong><small>전국의 반려동물 동반 장소를 지도로</small></span></Link>
      <Link href="/results?tab=catalog&mode=select"><Route aria-hidden="true" /><span><strong>우리만의 일정</strong><small>원하는 장소를 담아 만드는 하루</small></span></Link>
      <Link href="/planner/pet"><Heart aria-hidden="true" /><span><strong>특별한 하루</strong><small>반려견의 조건에 맞춰 함께하는 여행</small></span></Link>
    </section>
    <div className="homepage-shell weekendoog-live-shell">
      <section className="home-recommendations" aria-labelledby="home-recommendations-title">
        <h2 id="home-recommendations-title">추천하는 장소</h2>
        <div className="home-region-chips" role="group" aria-label="추천 장소 지역">
          {REGION_CONFIGS.filter((item) => item.mapEnabled && (showAllRegions || FEATURED_REGION_IDS.includes(item.id))).map((item) => {
            return <button key={item.id} type="button" aria-pressed={region === item.id} onClick={() => setRegion(item.id)}><Image src={regionImage(item.id)} alt="" width={72} height={72} className="home-region-image" /><span>{item.displayName}</span></button>;
          })}
          <button type="button" className="home-region-more" aria-expanded={showAllRegions} onClick={() => setShowAllRegions(value => !value)}><ChevronDown aria-hidden="true" /><span>{showAllRegions ? "접기" : "더보기"}</span></button>
        </div>
        <HomepageLiveExperience cardsOnly regionId={region} staticMapEnabled={staticMapEnabled} />
      </section>
      <div id="home-discovery" tabIndex={-1}>
        <HomepageNationwidePlaces staticMapEnabled={staticMapEnabled} searchRequest={searchRequest} />
      </div>
    </div>
  </>;
}
