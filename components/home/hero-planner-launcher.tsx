"use client";

import { ArrowRight, MapPin, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePlannerState } from "@/components/planner/planner-state";
import {
  REGION_CONFIGS,
  getRegionConfig,
  getRegionConfigByService2LegalDongCode,
} from "@/lib/regions/config";
import {
  createPlanDraft,
  loadPlanDraft,
  savePlanDraft,
  updatePlanDraftScope,
} from "@/lib/storage/plan-draft-storage";
import type { RegionId } from "@/types/region";

export function HeroPlannerLauncher({ onSearch }: { onSearch?: (query: string, regionId: RegionId) => void }) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { preferences, setPreferences } = usePlannerState();
  const initialRegion = getRegionConfigByService2LegalDongCode(preferences.regionCode) ??
    REGION_CONFIGS[0];
  const [selectedRegion, setSelectedRegion] = useState<RegionId>(initialRegion.id);
  const region = getRegionConfig(selectedRegion);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const draft = loadPlanDraft();
      if (draft) setSelectedRegion(draft.regionId);
    });
    return () => { active = false; };
  }, []);

  const openPlanner = () => {
    setPreferences((current) => ({
      ...current,
      regionCode: region.providerCodes.korPetTourService2.legalDongRegionCode,
      regionName: region.displayName,
      districtCode: undefined,
      districtName: undefined,
    }));
    const draft = loadPlanDraft() ?? createPlanDraft(region.id);
    savePlanDraft(updatePlanDraftScope(draft, region.id, null));
    router.push(`/results?tab=catalog&region=${region.id}&mode=select`);
  };

  return (
    <form
      className="hero-planner-launcher"
      aria-label="여행 만들기 빠른 시작"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (onSearch) onSearch(query.trim(), selectedRegion);
        else openPlanner();
      }}
    >
      <span className="hero-planner-label">
        <MapPin size={16} aria-hidden="true" />
        여행 지역
      </span>
      <div className="hero-planner-fields">
        <label className="hero-planner-select-label">
          <span className="sr-only">여행 지역</span>
          <select
            id="weekendoog-home-content"
            value={selectedRegion}
            onChange={(event) => setSelectedRegion(event.target.value as RegionId)}
            className="hero-planner-select"
          >
            {REGION_CONFIGS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </select>
        </label>
        <div className="hero-search-field">
          <Search size={20} aria-hidden="true" />
          <input ref={searchRef} type="search" aria-label="여행 장소 검색" placeholder="장소, 지역, 키워드로 검색해보세요." value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} />
          {query && <button type="button" aria-label="여행 검색어 지우기" onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X size={18} aria-hidden="true" /></button>}
        </div>
        <div className="hero-planner-actions">
        <button
          type="submit"
          className="hero-planner-submit"
        >
          여행지 찾기 <ArrowRight size={18} aria-hidden="true" />
        </button>
      <button
        type="button"
        disabled={!region.routeCapabilities.fullyAutomaticRecommendation}
        onClick={() => {
          if (!region.routeCapabilities.fullyAutomaticRecommendation) return;
          setPreferences((current) => ({
            ...current,
            regionCode: region.providerCodes.korPetTourService2.legalDongRegionCode,
            regionName: region.displayName,
            districtCode: undefined,
            districtName: undefined,
          }));
          const draft = loadPlanDraft() ?? createPlanDraft(region.id);
          savePlanDraft(updatePlanDraftScope(draft, region.id, null));
          router.push("/planner/pet");
        }}
        className="hero-planner-secondary"
      >
        AI 맞춤 일정
      </button>
        </div>
      </div>
      {!region.routeCapabilities.fullyAutomaticRecommendation ? (
        <small>{region.displayName}은 선택 장소 경로부터 이용할 수 있어요.</small>
      ) : null}
    </form>
  );
}
