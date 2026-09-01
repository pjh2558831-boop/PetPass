import Link from "next/link";
import { Suspense } from "react";
import { PawPrint } from "lucide-react";
import { HomepageSkipLink } from "@/components/home/homepage-skip-link";
import { type NavigationItem } from "@/components/layout/mobile-navigation";
import { SiteNavigationLink } from "@/components/layout/site-navigation-link";
import {
  SiteHeaderAccount,
  SiteHeaderAccountAsync,
} from "@/components/layout/site-header-account";

const navigationItems = [
  { kind: "link", href: "/results?tab=catalog&mode=select", label: "일정 만들기", intent: "create" },
  { kind: "link", href: "/results?tab=catalog", label: "장소 찾기", intent: "catalog" },
  {
    kind: "link",
    href: "/planner/pet",
    label: "맞춤 일정",
    intent: "recommendation",
  },
  { kind: "link", href: "/account", label: "마이페이지", intent: "account" },
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
          {navigationItems.map((item) => (
            <Suspense key={item.href} fallback={<Link className="site-header-link" href={item.href}>{item.label}</Link>}>
              <SiteNavigationLink className="site-header-link" href={item.href} intent={item.intent}>
                {item.label}
              </SiteNavigationLink>
            </Suspense>
          ))}
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
