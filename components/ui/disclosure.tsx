"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function Disclosure({
  label,
  children,
  idPrefix,
  className = "",
}: {
  label: string;
  children: ReactNode;
  idPrefix: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const generatedId = useId().replaceAll(":", "");
  const panelId = `${idPrefix}-${generatedId}`;

  return (
    <div className={`place-detail-disclosure ${className}`.trim()}>
      <button
        type="button"
        className="place-detail-disclosure__trigger"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{label}</span>
        <span className="place-detail-disclosure__state">
          {isOpen ? "접기" : "펼치기"}
          <ChevronDown
            className="place-detail-disclosure__icon"
            data-open={isOpen ? "true" : "false"}
            size={17}
            aria-hidden="true"
          />
        </span>
      </button>
      <div
        id={panelId}
        className="place-detail-disclosure__panel"
        hidden={!isOpen}
      >
        {children}
      </div>
    </div>
  );
}
