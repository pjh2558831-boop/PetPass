import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-[#dfe5df] py-10">
      <div className="page-shell flex flex-col gap-4 text-sm text-[#65746c] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-extrabold text-[#2b4438]">PetPass</p>
          <p className="mt-1">갈 수 있다는 표시보다, 함께 들어갈 수 있는 근거를 확인하세요.</p>
        </div>
        <div className="flex gap-4">
          <Link href="/planner/pet" className="font-semibold hover:text-[#236148]">
            여행 만들기
          </Link>
          <Link href="/results" className="font-semibold hover:text-[#236148]">
            데모 보기
          </Link>
        </div>
      </div>
    </footer>
  );
}
