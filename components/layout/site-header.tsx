import Link from "next/link";
import { PawPrint } from "lucide-react";
import {
  MobileNavigation,
  type NavigationItem,
} from "@/components/layout/mobile-navigation";

const navigationItems = [
  { kind: "link", href: "/planner/pet", label: "여행 만들기" },
  { kind: "link", href: "/results?tab=catalog", label: "장소 찾기" },
  {
    kind: "link",
    href: "/results?tab=recommendations",
    label: "추천 코스",
  },
  { kind: "future", label: "커뮤니티" },
  { kind: "future", label: "마이페이지" },
] as const satisfies readonly NavigationItem[];

const accountItems = [
  { kind: "future", label: "로그인" },
  { kind: "future", label: "회원가입" },
] as const satisfies readonly NavigationItem[];

function FutureNavigationButton({
  label,
  emphasis = false,
}: {
  label: string;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      aria-disabled="true"
      title={`${label} 준비 중`}
      className={`inline-flex min-h-11 cursor-not-allowed items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-extrabold ${
        emphasis
          ? "bg-[var(--brand)] text-white"
          : "border border-[var(--line)] bg-white text-[#53645c]"
      }`}
    >
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[9px] leading-none ${
          emphasis ? "bg-white/20 text-white" : "bg-[#eef3ef] text-[#708078]"
        }`}
      >
        준비 중
      </span>
    </button>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--background)]">
      <div className="site-shell flex min-h-[72px] items-center justify-between gap-3">
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
          className="hidden min-w-0 items-center justify-center gap-0.5 lg:flex"
        >
          {navigationItems.map((item) =>
            item.kind === "link" ? (
              <Link
                key={item.href}
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-2.5 text-xs font-bold text-[#486057] transition-colors hover:bg-white hover:text-[var(--brand)] xl:px-3 xl:text-sm"
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
                className="inline-flex min-h-11 cursor-not-allowed items-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs font-bold text-[#718078] xl:px-2.5"
              >
                <span>{item.label}</span>
                <span className="rounded-full bg-[#eef3ef] px-1.5 py-0.5 text-[9px] leading-none text-[#718078]">
                  준비 중
                </span>
              </button>
            ),
          )}
        </nav>
        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
          <FutureNavigationButton label="로그인" />
          <FutureNavigationButton label="회원가입" emphasis />
        </div>
        <div className="flex items-center lg:hidden">
          <MobileNavigation items={navigationItems} accountItems={accountItems} />
        </div>
      </div>
    </header>
  );
}
