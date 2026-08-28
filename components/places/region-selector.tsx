"use client";

import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visibleIds = new Set(filterRegionSelectorOptions(query).map(({ id }) => id));
  const selected = getRegionConfig(value);

  const closePicker = (restoreFocus = false) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const focusFrame = requestAnimationFrame(() => searchRef.current?.focus());
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setQuery("");
      queueMicrotask(() => triggerRef.current?.focus());
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
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
    <div className="explorer-region-picker" ref={rootRef} data-open={open ? "true" : "false"}>
      <button
        ref={triggerRef}
        type="button"
        className="explorer-region-picker__trigger"
        aria-label={`여행 지역 선택, 현재 ${selected.displayName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        onClick={() => {
          if (open) closePicker();
          else setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="explorer-region-picker__trigger-icon"><MapPin size={17} aria-hidden="true" /></span>
        <span className="explorer-region-picker__trigger-copy"><small>여행 지역</small><strong>{selected.displayName}</strong></span>
        <ChevronDown className="explorer-region-picker__chevron" size={17} aria-hidden="true" />
      </button>
      {open ? (
        <div
          className="explorer-region-picker__popup"
          id={popupId}
          role="region"
          aria-label="여행 지역 선택"
        >
          <header className="explorer-region-picker__header">
            <span className="explorer-region-picker__header-icon"><MapPin size={18} aria-hidden="true" /></span>
            <span>
              <h2 id={`${popupId}-title`}>어디로 떠날까요?</h2>
              <p>지도를 볼 여행 지역을 골라주세요.</p>
            </span>
          </header>
          <label className="explorer-region-picker__search">
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              aria-label="지역 검색"
              value={query}
              placeholder="지역명 검색"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusOption(1);
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  focusOption(-1);
                }
              }}
            />
            {query ? (
              <button
                type="button"
                className="explorer-region-picker__search-clear"
                aria-label="지역 검색어 지우기"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <div className="explorer-region-picker__list" role="listbox" aria-label="전국 지역 선택">
            {REGION_SELECTOR_GROUPS.map((group) => {
              const regionIds = group.regionIds.filter((id) => visibleIds.has(id));
              const groupId = `${popupId}-${group.regionIds[0]}`;
              return regionIds.length > 0 ? (
                <section key={group.label} role="group" aria-labelledby={groupId}>
                  <h3 id={groupId}>{group.label}</h3>
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
                            closePicker(true);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                              event.preventDefault();
                              focusOption(event.key === "ArrowDown" ? 1 : -1, event.currentTarget);
                            }
                            if (event.key === "Home" || event.key === "End") {
                              event.preventDefault();
                              const options = rootRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
                              options?.[event.key === "Home" ? 0 : options.length - 1]?.focus();
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
