import Image from "next/image";
import { ArrowRight, PawPrint } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export function EmotionalCtaCard() {
  return (
    <article className="weekendoog-emotional-cta-card relative min-h-[330px] overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--brand-soft)] shadow-[var(--shadow-card)]">
      <div className="relative z-10 max-w-[70%] p-6 sm:p-8">
        <p className="text-[11px] font-black tracking-[0.12em] text-[var(--brand)]">
          START YOUR WEEKEND
        </p>
        <h2 className="mt-3 text-2xl font-black leading-[1.35] tracking-[-0.04em] text-[var(--foreground)] sm:text-[28px]">
          우리 아이와의 완벽한 여행,
          <br />
          지금 시작해보세요!
        </h2>
        <ButtonLink href="/planner/pet" variant="brand" className="mt-6">
          <PawPrint size={17} aria-hidden="true" />
          여행 일정 만들기
          <ArrowRight size={17} aria-hidden="true" />
        </ButtonLink>
      </div>

      <div className="absolute bottom-0 right-0 h-[72%] w-[48%] overflow-hidden" aria-hidden="true">
        <Image
          src="/og.png?weekendog-cta=1"
          alt=""
          fill
          sizes="(max-width: 767px) 640px, 760px"
          className="origin-bottom-left scale-[2.12] object-cover object-[19%_100%]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--brand-soft)] via-transparent to-transparent" />
      </div>
    </article>
  );
}
