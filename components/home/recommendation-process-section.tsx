import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ListChecks,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  WEEKENDOG_PROCESS_STEPS,
  type RecommendationProcessIcon,
} from "@/lib/homepage/editorial-content";

const PROCESS_ICONS: Record<RecommendationProcessIcon, LucideIcon> = {
  evidence: ShieldCheck,
  compare: ListChecks,
  schedule: CalendarDays,
  "travel-time": Clock3,
  verify: CheckCircle2,
};

export function RecommendationProcessSection() {
  return (
    <section
      className="recommendation-process-section py-10 sm:py-12 lg:py-[72px]"
      aria-labelledby="recommendation-process-heading"
    >
      <div className="weekendoog-shell mx-auto w-[calc(100%-24px)] max-w-[1280px] sm:w-[calc(100%-32px)]">
        <h2
          id="recommendation-process-heading"
          className="text-center text-2xl font-black leading-[1.3] tracking-[-0.04em] text-[var(--foreground)] sm:text-[26px] lg:text-[30px]"
        >
          WEEKENDOG는 이렇게 여행을 만듭니다
        </h2>
        <ol className="mt-8 grid gap-7 md:grid-cols-2 md:gap-8 lg:grid-cols-5 lg:gap-5">
          {WEEKENDOG_PROCESS_STEPS.map((step, index) => {
            const Icon = PROCESS_ICONS[step.icon];
            return (
              <li
                key={step.number}
                className="relative flex gap-4 border-l border-[var(--brand-border)] pl-5 md:border-l-0 md:pl-0 lg:block lg:text-center"
              >
                <div className="grid size-12 shrink-0 place-items-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)] md:mx-0 lg:mx-auto">
                  <Icon size={21} aria-hidden="true" />
                </div>
                <div className="min-w-0 lg:mt-4">
                  <p className="text-xs font-black text-[var(--brand)]">
                    {step.number}. {step.title}
                  </p>
                  <p className="mt-2 text-[13px] font-medium leading-[1.65] text-[var(--muted)]">
                    {step.description}
                  </p>
                </div>
                {index < WEEKENDOG_PROCESS_STEPS.length - 1 ? (
                  <ArrowRight
                    className="absolute -right-3 top-4 hidden text-[var(--brand-border)] lg:block"
                    size={17}
                    aria-hidden="true"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
