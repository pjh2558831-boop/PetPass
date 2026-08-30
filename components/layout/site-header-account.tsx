import Image from "next/image";
import Link from "next/link";
import { UserRound } from "lucide-react";
import {
  MobileNavigation,
  type NavigationItem,
} from "@/components/layout/mobile-navigation";
import { createAuthServerClient } from "@/lib/supabase/server";

interface SiteHeaderAccountProps {
  navigationItems: readonly NavigationItem[];
  displayName?: string | null;
  avatarUrl?: string | null;
  needsOnboarding?: boolean;
}

export function SiteHeaderAccount({
  navigationItems,
  displayName = null,
  avatarUrl = null,
  needsOnboarding = false,
}: SiteHeaderAccountProps) {
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
    <>
      <div className="hidden shrink-0 items-center gap-1.5 min-[900px]:flex">
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
      <div className="flex items-center min-[900px]:hidden">
        <MobileNavigation items={navigationItems} accountItems={accountItems} />
      </div>
    </>
  );
}

export async function SiteHeaderAccountAsync({
  navigationItems,
}: Pick<SiteHeaderAccountProps, "navigationItems">) {
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
      } else {
        needsOnboarding = true;
      }
    }
  } catch {
    // The streamed anonymous actions remain usable when auth cannot be resolved.
  }

  return (
    <SiteHeaderAccount
      navigationItems={navigationItems}
      displayName={displayName}
      avatarUrl={avatarUrl}
      needsOnboarding={needsOnboarding}
    />
  );
}
