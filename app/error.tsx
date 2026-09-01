"use client";

import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";
import { ProductState } from "@/components/ui/product-state";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page-shell py-12 sm:py-16">
      <ProductState
        status="alert"
        title="페이지를 불러오지 못했어요."
        description="잠시 후 다시 시도하거나 홈에서 다른 메뉴를 이용해 주세요."
        headingProps={{ id: "page-error-heading" }}
      >
          <Button type="button" onClick={reset}>
            다시 시도
          </Button>
          <ButtonLink href="/" variant="secondary">
            홈으로
          </ButtonLink>
      </ProductState>
    </div>
  );
}
