"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, UserRound, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type NavigationItem =
  | { kind: "link"; href: string; label: string; avatarUrl?: string | null }
  | { kind: "future"; label: string };

export function MobileNavigation({
  items,
  accountItems = [],
}: {
  items: readonly NavigationItem[];
  accountItems?: readonly NavigationItem[];
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-controls={menuId}
        aria-expanded={open}
        aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        onClick={() => setOpen((value) => !value)}
        className="grid size-11 place-items-center rounded-xl border border-[var(--line)] bg-white text-[var(--foreground)] transition-colors hover:border-[#a8bcae] hover:bg-[var(--surface-muted)]"
      >
        {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>
      {open ? (
        <nav
          id={menuId}
          aria-label="모바일 주요 메뉴"
          className="surface-card absolute right-0 top-[calc(100%+10px)] w-64 max-w-[calc(100vw-24px)] p-2"
        >
          <div className="space-y-1">
            {items.map((item) =>
              item.kind === "link" ? (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center rounded-xl px-4 text-sm font-extrabold text-[#385246] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  aria-disabled="true"
                  title={`${item.label} 준비 중`}
                  className="flex min-h-12 w-full cursor-not-allowed items-center justify-between rounded-xl px-4 text-left text-sm font-extrabold text-[#718078]"
                >
                  <span>{item.label}</span>
                  <span className="rounded-full bg-[#eef3ef] px-2 py-1 text-[10px] leading-none">
                    준비 중
                  </span>
                </button>
              ),
            )}
          </div>
          {accountItems.length > 0 ? (
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-2">
              {accountItems.map((item) =>
                item.kind === "link" ? (
                  <Link
                    key={`${item.href}-${item.label}`}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-2 text-xs font-extrabold text-[#385246]"
                  >
                    {"avatarUrl" in item ? (
                      <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
                        {item.avatarUrl ? (
                          <Image src={item.avatarUrl} alt="" width={28} height={28} unoptimized className="size-full object-cover" />
                        ) : (
                          <UserRound size={16} aria-hidden="true" />
                        )}
                      </span>
                    ) : null}
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    aria-disabled="true"
                    title={`${item.label} 준비 중`}
                    className="flex min-h-12 cursor-not-allowed flex-col items-center justify-center rounded-xl border border-[var(--line)] px-2 text-xs font-extrabold text-[#718078]"
                  >
                    <span>{item.label}</span>
                    <span className="mt-0.5 text-[9px] font-bold">준비 중</span>
                  </button>
                ),
              )}
            </div>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
