import Link from "next/link";
import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="site-footer mt-14 border-t border-[var(--line)] py-7 sm:mt-16 sm:py-8">
      <div className="site-shell site-footer__inner flex flex-col gap-4 text-sm text-[#65746c] sm:flex-row sm:items-start sm:justify-between">
        <div className="site-footer__identity">
          <Image src="/brand/weekendog-horizontal.png" alt="WEEKENDOG" width={690} height={120} unoptimized className="weekendog-logo weekendog-logo--footer" />
          <p className="site-footer__tagline mt-1 text-xs sm:text-sm">
            공식 근거와 실제 이동시간으로 만드는 반려견 동반 여행
          </p>
          <p className="site-footer__notice mt-2 max-w-xl text-xs leading-5">
            공식 정보 원문을 우선하며, 동반 조건은 방문 전 해당 시설에 다시 확인해 주세요. © 2026 WEEKENDOG
          </p>
          <nav aria-label="서비스 정책" className="mt-3 flex flex-wrap gap-x-5">
            <Link href="/privacy" className="inline-flex min-h-11 items-center text-xs font-bold underline-offset-4 hover:underline">개인정보처리방침</Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center text-xs underline-offset-4 hover:underline">이용약관</Link>
          </nav>
        </div>
        <nav aria-label="하단 메뉴" className="site-footer__navigation flex flex-wrap gap-x-4 gap-y-1">
          <Link
            href="/results?tab=catalog&mode=select"
            className="site-footer__link inline-flex min-h-11 items-center font-semibold hover:text-[var(--brand)]"
          >
            일정 만들기
          </Link>
          <Link
            href="/results?tab=catalog"
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
