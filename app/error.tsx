"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page-shell py-20">
      <div className="surface-card mx-auto max-w-xl p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#fff0e6] text-[#a65025]">
          <AlertTriangle size={23} aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-black">페이지를 준비하지 못했어요.</h1>
        <p className="mt-3 text-sm leading-7 text-[#66756d]">
          입력한 여행 조건은 브라우저에 남아 있어요. 다시 시도하거나 홈으로
          돌아가 주세요.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button type="button" onClick={reset}>
            다시 시도
          </Button>
          <ButtonLink href="/" variant="secondary">
            홈으로
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
