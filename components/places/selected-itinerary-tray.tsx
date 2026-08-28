"use client";

import { AlertTriangle, ChevronDown, ChevronUp, Route, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppDialog } from "@/components/ui/app-dialog";
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
  onContinue,
}: {
  snapshot: SelectedItinerarySnapshot;
  canContinue: boolean;
  onRemove: (placeId: string) => void;
  onContinue: () => void;
}) {
  return (
    <>
      {snapshot.places.length === 0 ? (
        <p className="selected-itinerary-tray__empty">카드의 ‘+ 일정에 담기’를 눌러 방문할 장소를 골라보세요.</p>
      ) : (
        <ul className="selected-itinerary-tray__list" aria-label="일정에 담은 장소">
          {snapshot.places.map((place) => (
            <li key={place.id}>
              <div className="min-w-0">
                <strong>{place.name}</strong>
                <span>{place.sourceLabel} · {selectedItineraryVerdictLabel(place.petAccessVerdict)}</span>
                {selectedItineraryNeedsWarning(place) ? (
                  <small><AlertTriangle size={12} aria-hidden="true" /> 방문 전 동반 조건 확인 필요</small>
                ) : null}
              </div>
              <button type="button" onClick={() => onRemove(place.id)} aria-label={`${place.name} 일정에서 빼기`}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="selected-itinerary-tray__continue"
        disabled={!canContinue}
        onClick={onContinue}
      >
        <Route size={16} aria-hidden="true" /> 선택한 장소로 조건 확인
      </button>
      <p className="selected-itinerary-tray__hint">
        자동 채우기를 켜면 1곳부터, 끄면 2곳부터 일정을 만들 수 있어요.
      </p>
    </>
  );
}

export function SelectedItineraryTray({
  snapshot,
  onRemove,
  onContinue,
  variant,
}: {
  snapshot: SelectedItinerarySnapshot;
  onRemove: (placeId: string) => void;
  onContinue: () => void;
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
          <button type="button" disabled={!canContinue} onClick={onContinue}>조건 확인</button>
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
              onContinue={onContinue}
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
            onContinue={onContinue}
          />
        </div>
      ) : null}
    </section>
  );
}
