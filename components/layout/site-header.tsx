import Link from "next/link";
import { Suspense } from "react";
import { PawPrint } from "lucide-react";
import {
  type NavigationItem,
} from "@/components/layout/mobile-navigation";
import {
  SiteHeaderAccount,
  SiteHeaderAccountAsync,
} from "@/components/layout/site-header-account";

const navigationItems = [
  { kind: "link", href: "/results?tab=catalog&region=busan&mode=select", label: "일정 만들기" },
  { kind: "link", href: "/results?tab=catalog&region=busan", label: "장소 찾기" },
  {
    kind: "link",
    href: "/planner/pet",
    label: "자동 추천",
  },
  { kind: "future", label: "커뮤니티" },
  { kind: "link", href: "/account", label: "마이페이지" },
] as const satisfies readonly NavigationItem[];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-t-[3px] border-b-[#D5E2D9] border-t-[#0B503A] bg-[#EDF4EF] text-[#102019]">
      <div className="site-shell flex min-h-[61px] items-center justify-between gap-3 lg:min-h-[69px]">
        <Link
          href="/"
          className="flex min-h-11 shrink-0 items-center gap-2.5 text-lg font-black tracking-[-0.04em] text-[var(--foreground)] xl:text-xl"
          aria-label="WEEKENDOG 홈"
        >
          <span className="grid size-9 place-items-center rounded-full bg-[var(--brand)] text-white xl:size-10">
            <PawPrint size={19} aria-hidden="true" />
          </span>
          WEEKENDOG
        </Link>
        <nav
          aria-label="주요 메뉴"
          className="hidden min-w-0 items-center justify-center gap-2 lg:flex xl:gap-3"
        >
          {navigationItems.map((item) =>
            item.kind === "link" ? (
              <Link
                key={item.href}
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-xs font-bold text-[#486057] transition-colors hover:bg-white hover:text-[var(--brand)] xl:px-3.5 xl:text-sm"
                href={item.href}
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                aria-disabled="true"
                title={`${item.label} 준비 중`}
                className="inline-flex min-h-11 cursor-not-allowed items-center gap-1 whitespace-nowrap rounded-lg px-3 text-xs font-bold text-[#718078] xl:px-3.5"
              >
                <span>{item.label}</span>
                <span className="rounded-full bg-[#eef3ef] px-1.5 py-0.5 text-[9px] leading-none text-[#718078]">
                  준비 중
                </span>
              </button>
            ),
          )}
        </nav>
        <Suspense fallback={<SiteHeaderAccount navigationItems={navigationItems} />}>
          <SiteHeaderAccountAsync navigationItems={navigationItems} />
        </Suspense>
      </div>
    </header>
  );
}
