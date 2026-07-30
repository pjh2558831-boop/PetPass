import { Check } from "lucide-react";

const steps = ["반려동물", "여행 조건", "추천 결과", "일정 편집"];

export function PlannerProgress({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="여행 만들기 단계">
      {steps.map((step, index) => {
        const number = index + 1;
        const complete = number < current;
        const active = number === current;
        return (
          <li key={step} className="min-w-0">
            <div
              className={`mb-2 h-1 rounded-full ${
                number <= current ? "bg-[#3d8b68]" : "bg-[#dce4df]"
              }`}
            />
            <div className="flex items-center gap-2">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                  active
                    ? "bg-[#236148] text-white"
                    : complete
                      ? "bg-[#dcefe5] text-[#236148]"
                      : "bg-[#e8ece9] text-[#7b8981]"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {complete ? <Check size={13} aria-hidden="true" /> : number}
              </span>
              <span
                className={`truncate text-xs font-bold ${
                  active ? "text-[#21312a]" : "text-[#748078]"
                }`}
              >
                {step}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
