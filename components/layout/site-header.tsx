import Link from "next/link";
import { Map, PawPrint } from "lucide-react";
import { MobileNavigation } from "@/components/layout/mobile-navigation";

const navigationLinks = [
  { href: "/results", label: "장소 찾기" },
  { href: "/itinerary", label: "내 일정" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--background)]">
      <div className="page-shell flex min-h-[72px] items-center justify-between gap-4">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2.5 text-xl font-black tracking-[-0.04em] text-[var(--foreground)]"
          aria-label="PetPass 홈"
        >
          <span className="grid size-10 place-items-center rounded-full bg-[var(--brand)] text-white">
            <PawPrint size={20} aria-hidden="true" />
          </span>
          PetPass
        </Link>
        <nav aria-label="주요 메뉴" className="hidden items-center gap-1 md:flex">
          {navigationLinks.map((link) => (
            <Link
              key={link.href}
              className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-bold text-[#486057] transition-colors hover:bg-white hover:text-[var(--brand)]"
              href={link.href}
            >
              {link.label}
            </Link>
          ))}
          <Link
            className="ml-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--brand)] px-5 text-sm font-extrabold text-white shadow-[var(--shadow-button)] transition-colors hover:bg-[var(--brand-deep)]"
            href="/planner/pet"
          >
            <Map size={16} aria-hidden="true" />
            여행 만들기
          </Link>
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <Link
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--brand)] px-3.5 text-sm font-extrabold text-white shadow-[var(--shadow-button)] transition-colors hover:bg-[var(--brand-deep)]"
            href="/planner/pet"
          >
            <Map size={16} aria-hidden="true" />
            여행 만들기
          </Link>
          <MobileNavigation links={navigationLinks} />
        </div>
      </div>
    </header>
  );
}
