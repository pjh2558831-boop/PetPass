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
    <div ref={rootRef} className="site-mobile-navigation">
      <button
        ref={triggerRef}
        type="button"
        aria-controls={menuId}
        aria-expanded={open}
        aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        onClick={() => setOpen((value) => !value)}
        className="site-mobile-menu-trigger"
      >
        {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>
      {open ? (
        <nav
          id={menuId}
          aria-label="모바일 주요 메뉴"
          className="site-mobile-menu"
        >
          <div className="site-mobile-menu-list">
            {items.map((item) =>
              item.kind === "link" ? (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="site-mobile-menu-link"
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  aria-disabled="true"
                  title={`${item.label} 준비 중`}
                  className="site-mobile-menu-future"
                >
                  <span>{item.label}</span>
                  <span className="site-mobile-menu-future-label">
                    준비 중
                  </span>
                </button>
              ),
            )}
          </div>
          {accountItems.length > 0 ? (
            <div className="site-mobile-account-list">
              {accountItems.map((item) =>
                item.kind === "link" ? (
                  <Link
                    key={`${item.href}-${item.label}`}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="site-mobile-account-link"
                  >
                    {"avatarUrl" in item ? (
                      <span className="site-mobile-account-avatar">
                        {item.avatarUrl ? (
                          <Image src={item.avatarUrl} alt="" width={28} height={28} unoptimized className="site-mobile-account-avatar-image" />
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
                    className="site-mobile-account-future"
                  >
                    <span>{item.label}</span>
                    <span className="site-mobile-account-future-label">준비 중</span>
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
