import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer mt-14 border-t border-[var(--line)] py-7 sm:mt-16 sm:py-8">
      <div className="site-shell site-footer__inner flex flex-col gap-4 text-sm text-[#65746c] sm:flex-row sm:items-start sm:justify-between">
        <div className="site-footer__identity">
          <p className="site-footer__brand font-extrabold tracking-[-0.02em] text-[#2b4438]">WEEKENDOG</p>
          <p className="site-footer__tagline mt-1 text-xs sm:text-sm">
            공식 근거와 실제 이동시간으로 만드는 반려견 동반 여행
          </p>
          <p className="site-footer__notice mt-2 max-w-xl text-xs leading-5">
            공식 정보 원문을 우선하며, 동반 조건은 방문 전 해당 시설에 다시 확인해 주세요. © 2026 WEEKENDOG
          </p>
        </div>
        <nav aria-label="하단 메뉴" className="site-footer__navigation flex flex-wrap gap-x-4 gap-y-1">
          <Link
            href="/results?tab=catalog&region=busan&mode=select"
            className="site-footer__link inline-flex min-h-11 items-center font-semibold hover:text-[var(--brand)]"
          >
            일정 만들기
          </Link>
          <Link
            href="/results?tab=catalog&region=busan"
            className="site-footer__link inline-flex min-h-11 items-center font-semibold hover:text-[var(--brand)]"
          >
            장소 찾기
          </Link>
          <Link
            href="/planner/pet"
            className="site-footer__link inline-flex min-h-11 items-center font-semibold hover:text-[var(--brand)]"
          >
            맞춤 일정
          </Link>
        </nav>
      </div>
    </footer>
  );
}
