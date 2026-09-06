"use client";

import { useFormStatus } from "react-dom";

export function OnboardingSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="mt-7 min-h-12 w-full rounded-lg bg-[var(--brand)] px-4 text-sm font-extrabold text-white active:opacity-80 disabled:cursor-wait disabled:opacity-60">
      <span role="status">{pending ? "프로필 저장 중…" : "프로필 확인 및 시작하기"}</span>
    </button>
  );
}
