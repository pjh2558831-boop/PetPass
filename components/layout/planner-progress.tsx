import { Check } from "lucide-react";

const steps = ["정보 입력", "추천 확인", "상세 일정"];

export function PlannerProgress({ current }: { current: number }) {
  const safeCurrent = Math.min(steps.length, Math.max(1, current));

  return (
    <nav aria-label="여행 만들기 단계">
      <div className="sm:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-black text-[var(--foreground)]">
            <span className="text-[var(--brand)]">{safeCurrent} / {steps.length}</span>
            <span aria-hidden="true"> · </span>
            {steps[safeCurrent - 1]}
          </p>
          <span className="text-xs font-bold text-[var(--muted)]">진행 중</span>
        </div>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#dce4df]"
          role="progressbar"
          aria-label="여행 만들기 진행률"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={safeCurrent}
          aria-valuetext={`${steps[safeCurrent - 1]}, ${steps.length}단계 중 ${safeCurrent}단계`}
        >
          <div
            className="h-full rounded-full bg-[var(--brand)] transition-[width]"
            style={{ width: `${(safeCurrent / steps.length) * 100}%` }}
          />
        </div>
        <ol className="sr-only">
          {steps.map((step, index) => (
            <li key={step} aria-current={index + 1 === safeCurrent ? "step" : undefined}>
              {index + 1}. {step}
            </li>
          ))}
        </ol>
      </div>

      <ol className="hidden grid-cols-3 gap-3 sm:grid" aria-label="전체 단계">
        {steps.map((step, index) => {
          const number = index + 1;
          const complete = number < safeCurrent;
          const active = number === safeCurrent;
          return (
            <li key={step} className="min-w-0" aria-current={active ? "step" : undefined}>
              <div
                className={`mb-3 h-1 rounded-full ${
                  number <= safeCurrent ? "bg-[var(--brand)]" : "bg-[#dce4df]"
                }`}
              />
              <div className="flex items-center gap-2.5">
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-black ${
                    active
                      ? "bg-[var(--brand)] text-white"
                      : complete
                        ? "bg-[var(--mint-100)] text-[var(--brand)]"
                        : "bg-[#e8ece9] text-[#748078]"
                  }`}
                  aria-hidden="true"
                >
                  {complete ? <Check size={14} /> : number}
                </span>
                <span
                  className={`min-w-0 text-[13px] font-extrabold leading-5 md:text-sm ${
                    active ? "text-[var(--foreground)]" : "text-[#6f7e76]"
                  }`}
                >
                  {step}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
