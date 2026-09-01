"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function FormErrorMessage({
  id,
  children,
  className = "",
}: {
  id: string;
  children?: ReactNode;
  className?: string;
}) {
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    errorRef.current?.focus();
  }, []);

  return (
    <p
      ref={errorRef}
      id={id}
      role="alert"
      tabIndex={-1}
      className={`outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 ${className}`}
    >
      {children}
    </p>
  );
}
