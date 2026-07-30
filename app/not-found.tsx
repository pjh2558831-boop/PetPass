import { MapPinned } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="page-shell py-20">
      <div className="surface-card mx-auto max-w-xl p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#edf8f2] text-[#236148]">
          <MapPinned size={23} aria-hidden="true" />
        </span>
        <p className="eyebrow mt-5">404</p>
        <h1 className="mt-2 text-2xl font-black">이 장소를 찾을 수 없어요.</h1>
        <p className="mt-3 text-sm leading-7 text-[#66756d]">
          데모 장소 목록이 바뀌었거나 주소가 잘못되었을 수 있어요.
        </p>
        <ButtonLink href="/results" className="mt-6">
          추천 장소로 돌아가기
        </ButtonLink>
      </div>
    </div>
  );
}
