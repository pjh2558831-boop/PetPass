import type { PetEventItem } from "@/types/pet-content";
import type { TourItem } from "@/lib/tour-api/schemas";

export function safeContentUrl(value: string | null | undefined): string | null {
  if (!value || /[\u0000-\u0020\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function calendarDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

export function kstToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function offsetDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function eventStatus(start: string, end: string | null, today: string): PetEventItem["status"] | null {
  if (end && (end < start || end < today)) return null;
  if (start > today) return "upcoming";
  return end && start <= today && end >= today ? "ongoing" : null;
}

// pet-event-relevance-v1: explicit Korean pet terms only; never a bare '펫'.
export const PET_EVENT_TERMS = /반려\s*(?:동물|견|묘)|애견|펫\s*페어|펫\s*박람회|펫\s*쇼|캣\s*쇼/u;

export function selectEvents(items: TourItem[], today: string, checkedAt: string): PetEventItem[] {
  const unique = new Map<string, PetEventItem>();
  for (const item of items) {
    const title = item.title?.trim();
    const startDate = calendarDate(item.eventstartdate);
    const endDate = calendarDate(item.eventenddate);
    if (!item.contentid || !title || !PET_EVENT_TERMS.test(title) || !startDate || (item.eventenddate && !endDate)) continue;
    if (item.contenttypeid && item.contenttypeid !== "15") continue;
    if (startDate > offsetDate(today, 30)) continue;
    if (/취소|연기/u.test(item.progresstype ?? "")) continue;
    const status = eventStatus(startDate, endDate, today);
    if (!status) continue;
    const address = [item.addr1, item.addr2].filter(Boolean).join(" ").trim();
    const identity = [title, startDate, endDate ?? "", item.addr1?.trim().split(/\s+/u)[0] ?? ""]
      .map(value => value.replace(/[^가-힣a-z0-9]/giu, "").toLowerCase())
      .join(":");
    if (unique.has(identity)) continue;
    // An address is displayed as an address, never inferred as a named venue.
    unique.set(identity, {
      id: item.contentid, title, startDate, endDate, status,
      regionLabel: item.addr1?.trim().split(/\s+/)[0] || "지역 확인 필요",
      venueLabel: item.eventplace?.trim() || address || null,
      imageUrl: safeContentUrl(item.firstimage),
      informationUrl: safeContentUrl(item.homepage), source: "한국관광공사", checkedAt,
    });
  }
  return [...unique.values()].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
}
