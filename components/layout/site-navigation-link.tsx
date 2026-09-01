"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { MouseEventHandler, ReactNode } from "react";

export type SiteNavigationIntent =
  | "create"
  | "catalog"
  | "recommendation"
  | "account"
  | "direct";

function isCurrentDestination(
  intent: SiteNavigationIntent,
  href: string,
  pathname: string,
  searchParams: URLSearchParams,
): boolean {
  if (intent === "create") {
    return pathname === "/results" && searchParams.get("mode") === "select";
  }
  if (intent === "catalog") {
    const tab = searchParams.get("tab");
    return pathname === "/results" && tab !== "recommendations" && searchParams.get("mode") !== "select";
  }
  if (intent === "recommendation") {
    if (searchParams.get("mode") === "select") return false;
    return pathname === "/planner/pet" || pathname === "/itinerary" ||
      (pathname === "/results" && searchParams.get("tab") === "recommendations");
  }
  if (intent === "account") return pathname.startsWith("/account") || pathname === "/onboarding";
  const target = new URL(href, "https://weekendog.local");
  return pathname === target.pathname;
}

export function SiteNavigationLink({
  href,
  intent = "direct",
  className,
  children,
  onClick,
}: {
  href: string;
  intent?: SiteNavigationIntent;
  className: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = isCurrentDestination(intent, href, pathname, searchParams);

  return (
    <Link
      href={href}
      className={className}
      aria-current={current ? "page" : undefined}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
