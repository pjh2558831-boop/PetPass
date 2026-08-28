"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function AppDialog({
  open,
  title,
  description,
  onClose,
  children,
  variant = "dialog",
  closeLabel = "닫기",
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  variant?: "dialog" | "sheet";
  closeLabel?: string;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const portalRoot = surfaceRef.current?.closest<HTMLElement>("[data-app-dialog-layer]") ?? null;
    const background = [...document.body.children].filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== portalRoot,
    );
    const previousOverflow = document.body.style.overflow;
    for (const element of background) element.inert = true;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      const focusable = surfaceRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (focusable ?? surfaceRef.current)?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !surfaceRef.current) return;
      const focusable = [...surfaceRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      if (focusable.length === 0) {
        event.preventDefault();
        surfaceRef.current.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      for (const element of background) element.inert = false;
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  const titleId = "app-dialog-title";
  const descriptionId = description ? "app-dialog-description" : undefined;

  return createPortal(
    <div className="app-dialog-layer" data-app-dialog-layer="true">
      <button
        type="button"
        className="app-dialog-backdrop"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`app-dialog-surface app-dialog-surface--${variant}`}
      >
        <div className="app-dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label={closeLabel}>
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
