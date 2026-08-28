"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { getRegionConfig } from "@/lib/regions/config";
import {
  REGION_SELECTOR_GROUPS,
  filterRegionSelectorOptions,
} from "@/lib/regions/selector";
import type { RegionId } from "@/types/region";

interface RegionSelectorProps {
  value: RegionId;
  onChange: (regionId: RegionId, startedAt: number) => void;
}

export function RegionSelector({ value, onChange }: RegionSelectorProps) {
  const popupId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visibleIds = new Set(filterRegionSelectorOptions(query).map(({ id }) => id));
  const selected = getRegionConfig(value);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const focusOption = (direction: 1 | -1, current?: HTMLElement) => {
    const options = [...(rootRef.current?.querySelectorAll<HTMLElement>(
      '[role="option"]',
    ) ?? [])];
    if (options.length === 0) return;
    const currentIndex = current ? options.indexOf(current) : -1;
    const nextIndex = currentIndex < 0
      ? direction === 1 ? 0 : options.length - 1
      : (currentIndex + direction + options.length) % options.length;
    options[nextIndex]?.focus();
  };

  return (
    <div className="explorer-region-picker" ref={rootRef}>
      <button
        type="button"
        className="explorer-region-picker__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={popupId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            queueMicrotask(() => searchRef.current?.focus());
          }
        }}
      >
        <span><small>지역</small>{selected.displayName}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="explorer-region-picker__popup" id={popupId}>
          <label className="explorer-region-picker__search">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">지역 검색</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="지역명 검색"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusOption(1);
                }
              }}
            />
          </label>
          <div className="explorer-region-picker__list" role="listbox" aria-label="전국 지역 선택">
            {REGION_SELECTOR_GROUPS.map((group) => {
              const regionIds = group.regionIds.filter((id) => visibleIds.has(id));
              return regionIds.length > 0 ? (
                <section key={group.label} role="group" aria-label={group.label}>
                  <h3>{group.label}</h3>
                  <div>
                    {regionIds.map((id) => {
                      const region = getRegionConfig(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          role="option"
                          aria-selected={id === value}
                          onClick={(event) => {
                            onChange(id, event.timeStamp);
                            setOpen(false);
                            setQuery("");
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setOpen(false);
                            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                              event.preventDefault();
                              focusOption(event.key === "ArrowDown" ? 1 : -1, event.currentTarget);
                            }
                          }}
                        >
                          <span>{region.displayName}</span>
                          {id === value ? <Check size={15} aria-hidden="true" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null;
            })}
            {visibleIds.size === 0 ? <p role="status">일치하는 지역이 없습니다.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
