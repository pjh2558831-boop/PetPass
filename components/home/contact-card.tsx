import { Headphones, MessageCircle } from "lucide-react";

export function ContactCard() {
  return (
    <article className="weekendoog-contact-card flex min-h-[200px] flex-col justify-between rounded-[24px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
      <div>
        <span className="grid size-11 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
          <Headphones size={21} aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-xl font-black tracking-[-0.035em] text-[var(--foreground)] sm:text-2xl">
          문의가 필요하신가요?
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-[var(--muted)]">
          서비스 이용 중 궁금한 점을 전할 수 있는 문의 채널을 준비하고 있습니다.
        </p>
      </div>
      <button
        type="button"
        aria-disabled="true"
        title="문의 채널 준비 중"
        className="mt-5 inline-flex min-h-11 w-fit cursor-not-allowed items-center gap-2 rounded-[var(--radius-control)] border border-[var(--brand-border)] bg-white px-4 text-sm font-extrabold text-[var(--brand)]"
      >
        <MessageCircle size={16} aria-hidden="true" />
        문의하기 · 준비 중
      </button>
    </article>
  );
}
