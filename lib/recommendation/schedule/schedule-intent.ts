import type { ScheduleIntent } from "@/types/schedule";

/** Private arithmetic anchor. Never send it to providers or render/store it as a travel date. */
export const UNDATED_REFERENCE_DATE = "2000-01-01";
export const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
export function seoulDate(now: Date): string {
  return new Date(now.getTime() + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
}
export function clockMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
export function clockLabel(minutes: number): string {
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export function firstAvailableMinute(intent: ScheduleIntent, now: Date): number {
  if (intent.date !== seoulDate(now)) return 0;
  const korea = new Date(now.getTime() + SEOUL_OFFSET_MS);
  return (Math.floor((korea.getUTCHours() * 60 + korea.getUTCMinutes()) / 15) + 1) * 15;
}
export function departureCandidates(intent: ScheduleIntent, now: Date, boundaryMinutes: number[] = []): string[] {
  const earliest = firstAvailableMinute(intent, now);
  const requested = intent.startTime ? clockMinutes(intent.startTime) : null;
  const candidates = [...new Set([...(requested === null ? [] : [requested]), Math.max(540, earliest), 1080, earliest, 1425, ...boundaryMinutes.map(Math.ceil)])]
    .filter(value => value >= earliest && value < 1440)
    .sort((a, b) => requested !== null
      ? Math.abs(a - requested) - Math.abs(b - requested) || b - a
      : Number(b >= 540 && b <= 1080) - Number(a >= 540 && a <= 1080) || a - b);
  return candidates.slice(0, 12).map(clockLabel);
}
