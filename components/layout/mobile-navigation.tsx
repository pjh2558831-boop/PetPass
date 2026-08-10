"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type NavigationLink = {
  href: string;
  label: string;
};

export function MobileNavigation({
  links,
}: {
  links: readonly NavigationLink[];
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
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="flex min-h-12 items-center rounded-xl px-4 text-sm font-extrabold text-[#385246] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
