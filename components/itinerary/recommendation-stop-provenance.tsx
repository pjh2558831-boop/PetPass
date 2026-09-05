import { LockKeyhole, RefreshCw } from "lucide-react";
import type { RecommendedRouteStopV1 } from "@/types/recommendation";

type StopProvenance = Pick<
  RecommendedRouteStopV1,
  "title" | "provenance" | "locked" | "verificationWarning"
>;

export function RecommendationStopProvenance({
  stop,
  replacementSupported = false,
  onReplace,
}: {
  stop: StopProvenance;
  replacementSupported?: boolean;
  onReplace?: () => void;
}) {
  if (!stop.provenance) return null;
  const selected = stop.provenance === "user_selected";
  const canReplace = stop.provenance === "auto_fill" && replacementSupported && onReplace;

  return (
    <div className="mt-3 space-y-2">
      {stop.provenance ? (
        <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold">
          <span className={selected
            ? "inline-flex min-h-7 items-center gap-1 rounded-full bg-[var(--brand)] px-3 text-white"
            : "inline-flex min-h-7 items-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-soft)] px-3 text-[var(--brand)]"}
          >
            {selected ? "내가 선택한 장소" : "WEEKENDOG 추천"}
          </span>
          {selected && stop.locked ? (
            <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-[var(--line)] bg-white px-3 text-[#52665b]">
              <LockKeyhole size={13} aria-hidden="true" /> 일정에 고정
            </span>
          ) : null}
          {canReplace ? (
            <button
              type="button"
              onClick={onReplace}
              aria-label={`${stop.title} 자동 장소 바꾸기`}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--brand-border)] bg-white px-3 text-[11px] font-extrabold text-[var(--brand)]"
            >
              <RefreshCw size={13} aria-hidden="true" /> 자동 장소 바꾸기
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
