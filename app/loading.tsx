import { ProductState } from "@/components/ui/product-state";

export default function Loading() {
  return (
    <div className="page-shell py-12 sm:py-16">
      <ProductState
        status="status"
        title="페이지를 준비하고 있어요."
        description="필요한 정보를 확인하는 동안 잠시만 기다려 주세요."
        headingProps={{ id: "page-loading-heading" }}
      />
    </div>
  );
}
