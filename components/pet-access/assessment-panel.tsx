import { Check, ExternalLink, Phone, Quote } from "lucide-react";
import { StatusBadge } from "@/components/pet-access/status-badge";
import type { PetAccessAssessment } from "@/types/access";

export function AssessmentPanel({
  assessment,
}: {
  assessment: PetAccessAssessment;
}) {
  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="access-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">내 조건과 비교한 결과</p>
          <h2 id="access-heading" className="mt-2 text-xl font-black tracking-[-0.03em]">
            동반 이용 판정
          </h2>
        </div>
        <StatusBadge status={assessment.status} />
      </div>
      <p className="mt-4 text-[15px] font-semibold leading-7 text-[#344a40]">
        {assessment.reason}
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-[#f1f7f3] p-4">
          <p className="text-xs font-extrabold text-[#4d6559]">준비물</p>
          <ul className="mt-2 space-y-2 text-sm font-semibold">
            {assessment.requiredItems.length > 0 ? (
              assessment.requiredItems.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check size={15} className="text-[#3d8b68]" aria-hidden="true" />
                  {item}
                </li>
              ))
            ) : (
              <li className="text-[#738078]">원문에 명시된 준비물 없음</li>
            )}
          </ul>
        </div>
        <div className="rounded-2xl bg-[#faf5ed] p-4">
          <p className="text-xs font-extrabold text-[#725a43]">이용 제한</p>
          <ul className="mt-2 space-y-2 text-sm font-semibold">
            {assessment.restrictions.length > 0 ? (
              assessment.restrictions.map((item) => <li key={item}>· {item}</li>)
            ) : (
              <li className="text-[#83786d]">원문에 명시된 제한 없음</li>
            )}
          </ul>
        </div>
      </div>

      <blockquote className="mt-5 rounded-2xl border border-[#dce6df] bg-white p-4">
        <div className="flex items-center gap-2 text-xs font-extrabold text-[#607269]">
          <Quote size={15} aria-hidden="true" />
          원문 근거 · {assessment.sourceName}
        </div>
        <p className="mt-2 text-sm leading-7 text-[#344a40]">
          “{assessment.originalSourceText || "제공된 원문이 없습니다."}”
        </p>
      </blockquote>

      {assessment.contactAction ? (
        <div className="mt-5 rounded-2xl border border-[#e8d2bd] bg-[#fff8f1] p-4">
          <p className="text-sm font-extrabold text-[#6f4429]">전화할 때 이렇게 물어보세요</p>
          <p className="mt-2 text-sm leading-6 text-[#6a5547]">
            {assessment.contactAction.suggestedQuestion}
          </p>
          {assessment.contactAction.href ? (
            <a
              href={assessment.contactAction.href}
              className="mt-3 inline-flex items-center gap-2 text-sm font-extrabold text-[#9b4b24]"
            >
              <Phone size={16} aria-hidden="true" />
              {assessment.contactAction.label}
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
