import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-14 border-t border-[var(--line)] py-7 sm:mt-16 sm:py-8">
      <div className="site-shell flex flex-col gap-4 text-sm text-[#65746c] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-extrabold tracking-[-0.02em] text-[#2b4438]">WEEKENDOG</p>
          <p className="mt-1 text-xs sm:text-sm">
            공식 근거와 실제 이동시간으로 만드는 반려견 동반 여행
          </p>
        </div>
        <nav aria-label="하단 메뉴" className="flex flex-wrap gap-x-4 gap-y-1">
          <Link
            href="/planner/pet"
            className="inline-flex min-h-11 items-center font-semibold hover:text-[var(--brand)]"
          >
            여행 만들기
          </Link>
          <Link
            href="/results?tab=catalog&region=busan"
            className="inline-flex min-h-11 items-center font-semibold hover:text-[var(--brand)]"
          >
            장소 찾기
          </Link>
          <Link
            href="/itinerary"
            className="inline-flex min-h-11 items-center font-semibold hover:text-[var(--brand)]"
          >
            내 일정
          </Link>
        </nav>
      </div>
    </footer>
  );
}
