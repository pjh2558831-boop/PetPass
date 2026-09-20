import { Search } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import Image from "next/image";
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
    label: "AI 맞춤 일정",
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
          <Image src="/brand/weekendog-horizontal.png" alt="" width={690} height={120} unoptimized className="weekendog-logo weekendog-logo--header" />
          <Image src="/brand/weekendog-symbol.png" alt="" width={492} height={342} unoptimized className="weekendog-logo weekendog-logo--compact" />
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
        <Link className="home-header-search" href="/#home-discovery" aria-label="장소 검색"><Search size={22} aria-hidden="true" /></Link>
        <div className="site-header-account-slot">
          <Suspense fallback={<SiteHeaderAccount navigationItems={navigationItems} />}>
            <SiteHeaderAccountAsync navigationItems={navigationItems} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
