import { ButtonLink } from "@/components/ui/button";
import { ProductState } from "@/components/ui/product-state";

export default function NotFound() {
  return (
    <div className="page-shell py-12 sm:py-16">
      <ProductState
        title="요청한 페이지를 찾을 수 없어요."
        description="주소를 다시 확인하거나 장소 목록에서 원하는 곳을 찾아보세요."
      >
        <ButtonLink href="/results" className="mt-6">
          장소 목록 보기
        </ButtonLink>
      </ProductState>
    </div>
  );
}
