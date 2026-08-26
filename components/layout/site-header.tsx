import Image from "next/image";
import Link from "next/link";
import { PawPrint, UserRound } from "lucide-react";
import {
  MobileNavigation,
  type NavigationItem,
} from "@/components/layout/mobile-navigation";
import { createAuthServerClient } from "@/lib/supabase/server";

const navigationItems = [
  { kind: "link", href: "/planner/pet", label: "여행 만들기" },
  { kind: "link", href: "/results?tab=catalog&region=busan", label: "장소 찾기" },
  {
    kind: "link",
    href: "/results?tab=recommendations&region=busan",
    label: "추천 코스",
  },
  { kind: "future", label: "커뮤니티" },
  { kind: "link", href: "/account", label: "마이페이지" },
] as const satisfies readonly NavigationItem[];

export async function SiteHeader() {
  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  let needsOnboarding = false;
  try {
    const supabase = await createAuthServerClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, onboarding_completed")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.onboarding_completed) {
        displayName = profile.display_name;
        avatarUrl = profile.avatar_url;
      }
      else needsOnboarding = true;
    }
  } catch {
    // Public navigation remains usable when auth status cannot be resolved.
  }

  const accountItems: readonly NavigationItem[] = displayName
    ? [{ kind: "link", href: "/account", label: displayName, avatarUrl }]
    : needsOnboarding
      ? [{ kind: "link", href: "/onboarding", label: "프로필 설정" }]
      : [
          { kind: "link", href: "/login", label: "로그인" },
          { kind: "link", href: "/login", label: "회원가입" },
        ];
  const accountHref = displayName
    ? "/account"
    : needsOnboarding
      ? "/onboarding"
      : "/login";
  const accountLabel = displayName ?? (needsOnboarding ? "프로필 설정" : "로그인");

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
        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
          <Link href={accountHref} className="inline-flex min-h-12 max-w-56 items-center gap-2.5 truncate whitespace-nowrap rounded-full border border-[var(--line)] bg-white px-3 text-sm font-extrabold text-[#53645c]">
            {displayName ? (
              <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="" width={32} height={32} unoptimized className="size-full object-cover" />
                ) : (
                  <UserRound size={18} aria-hidden="true" />
                )}
              </span>
            ) : null}
            <span className="truncate">{accountLabel}</span>
          </Link>
          {!displayName && !needsOnboarding ? <Link href="/login" className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--brand)] px-3 text-xs font-extrabold text-white">회원가입</Link> : null}
        </div>
        <div className="flex items-center lg:hidden">
          <MobileNavigation items={navigationItems} accountItems={accountItems} />
        </div>
      </div>
    </header>
  );
}
