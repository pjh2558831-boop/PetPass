import Link from "next/link";
import { Suspense } from "react";
import { PawPrint } from "lucide-react";
import { HomepageSkipLink } from "@/components/home/homepage-skip-link";
import { type NavigationItem } from "@/components/layout/mobile-navigation";
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
    label: "맞춤 일정",
  },
  { kind: "link", href: "/account", label: "마이페이지" },
] as const satisfies readonly NavigationItem[];

export function SiteHeader() {
  return (
    <header className="site-header">
      <HomepageSkipLink />
      <div className="site-shell site-header-inner">
        <Link
          href="/"
          className="site-brand"
          aria-label="WEEKENDOG 홈"
        >
          <span className="site-brand-mark">
            <PawPrint size={19} aria-hidden="true" />
          </span>
          <span className="site-brand-wordmark">WEEKENDOG</span>
        </Link>
        <nav
          aria-label="주요 메뉴"
          className="site-header-navigation"
        >
          {navigationItems.map((item) =>
            item.kind === "link" ? (
              <Link
                key={item.href}
                className="site-header-link"
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
                className="site-header-future"
              >
                <span>{item.label}</span>
                <span className="site-header-future-label">
                  준비 중
                </span>
              </button>
            ),
          )}
        </nav>
        <div className="site-header-account-slot">
          <Suspense fallback={<SiteHeaderAccount navigationItems={navigationItems} />}>
            <SiteHeaderAccountAsync navigationItems={navigationItems} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
