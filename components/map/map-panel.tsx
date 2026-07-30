import { LocateFixed, MapPinned } from "lucide-react";

export function MapPanel({
  compact = false,
  title = "부산 해운대 데모 경로",
}: {
  compact?: boolean;
  title?: string;
}) {
  return (
    <section className="relative" aria-label={title}>
      <div className={`map-canvas ${compact ? "!min-h-[300px]" : ""}`}>
        <div className="map-label left-[12%] top-[16%]">청사포</div>
        <div className="map-label right-[16%] top-[28%]">달맞이길</div>
        <div className="map-label bottom-[18%] left-[32%]">해운대</div>
        <div
          className="route-line left-[25%] top-[34%] w-[34%] rotate-[19deg]"
          aria-hidden="true"
        />
        <div
          className="route-line left-[54%] top-[50%] w-[25%] rotate-[48deg]"
          aria-hidden="true"
        />
        <div className="map-pin left-[19%] top-[28%]" aria-label="첫 번째 장소">
          <span>1</span>
        </div>
        <div className="map-pin left-[54%] top-[43%]" aria-label="두 번째 장소">
          <span>2</span>
        </div>
        <div className="map-pin bottom-[19%] right-[17%]" aria-label="세 번째 장소">
          <span>3</span>
        </div>
        <div className="map-watermark">Kakao Maps 연결 예정 · 데모 지도</div>
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-xs font-bold text-[#314b3f] shadow-sm">
          <MapPinned size={15} aria-hidden="true" />
          부산 · 해운대구
        </div>
        <button
          type="button"
          disabled
          title="실제 지도 연결 후 사용할 수 있어요"
          className="absolute bottom-4 left-4 z-10 grid size-10 cursor-not-allowed place-items-center rounded-full border border-white/80 bg-white/90 text-[#8a9690] shadow-sm"
          aria-label="지도 위치 맞추기 — 실제 지도 연결 전 비활성"
        >
          <LocateFixed size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
