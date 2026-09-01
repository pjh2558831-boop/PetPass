"use client";

import { AlertTriangle, ChevronDown, ChevronUp, LockKeyhole, Route, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppDialog } from "@/components/ui/app-dialog";
import type { SelectedItineraryMoveDirection } from "@/components/places/use-selected-itinerary-selection";
import {
  mapCatalogPlaceToCategory,
  PLACE_CATEGORY_LABELS,
} from "@/lib/map-places/place-categories";
import {
  MAX_SELECTED_ITINERARY_PLACES,
  selectedItineraryNeedsWarning,
  selectedItineraryVerdictLabel,
  type SelectedItinerarySnapshot,
} from "@/lib/storage/selected-itinerary-storage";

function SelectionTrayContents({
  snapshot,
  canContinue,
  onRemove,
  onMove,
  onContinue,
  onAutomaticStart,
  onAutoFillChange,
  automaticFillSupported,
  automaticRecommendationSupported,
}: {
  snapshot: SelectedItinerarySnapshot;
  canContinue: boolean;
  onRemove: (placeId: string) => void;
  onMove: (placeId: string, direction: SelectedItineraryMoveDirection) => void;
  onContinue: () => void;
  onAutomaticStart: () => void;
  onAutoFillChange: (enabled: boolean) => void;
  automaticFillSupported: boolean;
  automaticRecommendationSupported: boolean;
}) {
  return (
    <>
      {snapshot.places.length === 0 ? (
        <p className="selected-itinerary-tray__empty">카드의 ‘+ 일정에 담기’를 눌러 방문할 장소를 골라보세요.</p>
      ) : (
        <ul className="selected-itinerary-tray__list" aria-label="일정에 담은 장소">
          {snapshot.places.map((place, index) => (
            <li key={place.id}>
              <div className="min-w-0">
                <strong>{place.name}</strong>
                <span>{PLACE_CATEGORY_LABELS[mapCatalogPlaceToCategory(place)]} · {place.sourceLabel}</span>
                <span><LockKeyhole size={12} aria-hidden="true" /> 일정에 고정 · {selectedItineraryVerdictLabel(place.petAccessVerdict)}</span>
                {selectedItineraryNeedsWarning(place) ? (
                  <small><AlertTriangle size={12} aria-hidden="true" /> 동반 가능 여부 확인 필요 · 사용자가 선택한 미확인 장소</small>
                ) : null}
              </div>
              <div className="selected-itinerary-tray__controls">
                <button type="button" disabled={index === 0} onClick={() => onMove(place.id, "forward")} aria-label={`${place.name} 앞으로 이동`}><ChevronUp size={16} aria-hidden="true" /></button>
                <button type="button" disabled={index === snapshot.places.length - 1} onClick={() => onMove(place.id, "backward")} aria-label={`${place.name} 뒤로 이동`}><ChevronDown size={16} aria-hidden="true" /></button>
                <button type="button" onClick={() => onRemove(place.id)} aria-label={`${place.name} 일정에서 빼기`}><Trash2 size={16} aria-hidden="true" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="selected-itinerary-tray__range">추천 범위 1–{MAX_SELECTED_ITINERARY_PLACES}곳</p>
      {automaticFillSupported ? (
        <label className="selected-itinerary-tray__option">
          <input type="checkbox" checked={snapshot.autoFill} onChange={(event) => onAutoFillChange(event.target.checked)} />
          <span>부족한 장소는 WEEKENDOG가 추천</span>
        </label>
      ) : null}
      <button
        type="button"
        className="selected-itinerary-tray__continue"
        disabled={!canContinue}
        onClick={onContinue}
      >
        <Route size={16} aria-hidden="true" /> 선택한 장소로 일정 만들기
      </button>
      {automaticRecommendationSupported ? <button type="button" className="selected-itinerary-tray__automatic" onClick={onAutomaticStart}>장소 없이 알아서 추천받기</button> : null}
    </>
  );
}

export function SelectedItineraryTray({
  snapshot,
  onRemove,
  onMove,
  onContinue,
  onAutomaticStart,
  onAutoFillChange,
  automaticFillSupported,
  automaticRecommendationSupported,
  variant,
}: {
  snapshot: SelectedItinerarySnapshot;
  onRemove: (placeId: string) => void;
  onMove: (placeId: string, direction: SelectedItineraryMoveDirection) => void;
  onContinue: () => void;
  onAutomaticStart: () => void;
  onAutoFillChange: (enabled: boolean) => void;
  automaticFillSupported: boolean;
  automaticRecommendationSupported: boolean;
  regionName: string;
  variant: "desktop" | "mobile";
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const canContinue = snapshot.places.length >= 1;

  if (variant === "mobile") {
    return (
      <>
        <div className="selected-itinerary-mobile-bar" aria-label="선택한 일정 장소">
          <button type="button" onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen}>
            <span><b>{snapshot.places.length}</b> / {MAX_SELECTED_ITINERARY_PLACES}곳 담음</span>
            <ChevronUp size={17} aria-hidden="true" />
          </button>
          <button type="button" disabled={!canContinue} onClick={onContinue}>일정 만들기</button>
        </div>
        <AppDialog
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          title={`일정에 담은 장소 ${snapshot.places.length}곳`}
          description={`최대 ${MAX_SELECTED_ITINERARY_PLACES}곳까지 고를 수 있습니다.`}
          variant="sheet"
        >
          <div className="selected-itinerary-sheet__body">
            <SelectionTrayContents
              snapshot={snapshot}
              canContinue={canContinue}
              onRemove={onRemove}
              onMove={onMove}
              onContinue={onContinue}
              onAutomaticStart={onAutomaticStart}
              onAutoFillChange={onAutoFillChange}
              automaticFillSupported={automaticFillSupported}
              automaticRecommendationSupported={automaticRecommendationSupported}
            />
          </div>
        </AppDialog>
      </>
    );
  }

  return (
    <section className="selected-itinerary-tray" aria-labelledby="selected-itinerary-tray-title">
      <header>
        <div>
          <p>선택한 일정</p>
          <h2 id="selected-itinerary-tray-title">{snapshot.places.length} / {MAX_SELECTED_ITINERARY_PLACES}곳 담음</h2>
        </div>
        <button type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed} aria-controls="selected-itinerary-tray-body">
          {collapsed ? <ChevronDown size={17} aria-hidden="true" /> : <ChevronUp size={17} aria-hidden="true" />}
          <span className="sr-only">선택한 일정 {collapsed ? "펼치기" : "접기"}</span>
        </button>
      </header>
      {!collapsed ? (
        <div id="selected-itinerary-tray-body">
          <SelectionTrayContents
            snapshot={snapshot}
            canContinue={canContinue}
            onRemove={onRemove}
            onMove={onMove}
            onContinue={onContinue}
            onAutomaticStart={onAutomaticStart}
            onAutoFillChange={onAutoFillChange}
            automaticFillSupported={automaticFillSupported}
            automaticRecommendationSupported={automaticRecommendationSupported}
          />
        </div>
      ) : null}
    </section>
  );
}
