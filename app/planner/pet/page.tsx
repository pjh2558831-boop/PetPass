import type { Metadata } from "next";
import { PlannerProgress } from "@/components/layout/planner-progress";
import { PetProfileForm } from "@/components/planner/pet-profile-form";

export const metadata: Metadata = {
  title: "반려동물 프로필",
};

export default function PetProfilePage() {
  return (
    <div className="page-shell py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <PlannerProgress current={1} />
        <div className="mt-10">
          <p className="eyebrow">Step 1</p>
          <h1 className="balance mt-3 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
            함께 여행할 반려동물을 알려주세요.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#65746c]">
            여기서 고른 조건은 시설의 원문 규정과 비교할 때만 사용하고, 이
            브라우저에 버전이 표시된 형태로 저장해요.
          </p>
        </div>
        <div className="surface-card mt-8 p-5 sm:p-8">
          <PetProfileForm />
        </div>
      </div>
    </div>
  );
}
