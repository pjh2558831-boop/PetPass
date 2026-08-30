import { Headphones, MessageCircle } from "lucide-react";

export function ContactCard() {
  return (
    <article className="weekendoog-contact-card flex flex-col justify-between border border-[var(--line)] bg-white p-5 sm:p-6">
      <div>
        <span className="grid size-11 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
          <Headphones size={21} aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-xl font-black tracking-[-0.035em] text-[var(--foreground)] sm:text-2xl">
          문의가 필요하신가요?
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-[var(--muted)]">
          GitHub 이슈에서 문의 내용을 남겨주세요.
        </p>
      </div>
      <a
        href="https://github.com/pjh2558831-boop/PetPass/issues"
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex min-h-11 w-fit items-center gap-2 rounded-[var(--radius-control)] border border-[var(--brand-border)] bg-white px-4 text-sm font-extrabold text-[var(--brand)]"
      >
        <MessageCircle size={16} aria-hidden="true" />
        문의하기
      </a>
    </article>
  );
}
