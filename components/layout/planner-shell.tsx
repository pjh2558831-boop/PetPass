import type { ReactNode } from "react";
import { PlannerProgress } from "@/components/layout/planner-progress";

export function PlannerShell({
  currentStep,
  eyebrow,
  title,
  description,
  progressVariant = "automatic",
  children,
}: {
  currentStep: number;
  eyebrow: string;
  title: string;
  description: string;
  progressVariant?: "automatic" | "selected";
  children: ReactNode;
}) {
  return (
    <div className="page-shell py-8 sm:py-12 lg:py-14">
      <PlannerProgress current={currentStep} variant={progressVariant} />
      <header className="mt-8 max-w-3xl sm:mt-10">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="balance mt-3 text-3xl font-black tracking-[-0.045em] sm:text-4xl lg:text-[44px] lg:leading-[1.15]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base">
          {description}
        </p>
      </header>
      {children}
    </div>
  );
}
