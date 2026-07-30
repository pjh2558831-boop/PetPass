import Link from "next/link";
import { Map, PawPrint } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#dfe5df]/90 bg-[#f7f5ef]/92 backdrop-blur">
      <div className="page-shell flex min-h-16 items-center justify-between gap-5">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-black tracking-[-0.03em] text-[#21312a]"
          aria-label="PetPass 홈"
        >
          <span className="grid size-9 place-items-center rounded-full bg-[#236148] text-white">
            <PawPrint size={19} aria-hidden="true" />
          </span>
          PetPass
        </Link>
        <nav aria-label="주요 메뉴" className="flex items-center gap-1 sm:gap-2">
          <Link
            className="rounded-full px-3 py-2 text-sm font-semibold text-[#52645b] hover:bg-white"
            href="/results"
          >
            장소 찾기
          </Link>
          <Link
            className="hidden rounded-full px-3 py-2 text-sm font-semibold text-[#52645b] hover:bg-white sm:inline-flex"
            href="/itinerary"
          >
            내 일정
          </Link>
          <Link
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#236148] px-4 text-sm font-bold text-white"
            href="/planner/pet"
          >
            <Map size={16} aria-hidden="true" />
            여행 만들기
          </Link>
        </nav>
      </div>
    </header>
  );
}
