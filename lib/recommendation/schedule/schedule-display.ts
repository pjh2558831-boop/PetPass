import type { RouteSchedule } from "@/types/schedule";

export function formatScheduleTime(value: string | null, offsetSeconds = 0, schedule?: RouteSchedule): string {
  if (schedule?.timingBasis === "relative" || (!value && !schedule?.effective.startTime)) return `출발 후 ${Math.round(offsetSeconds / 60)}분`;
  if (!value) {
    const [hours, minutes] = schedule!.effective.startTime!.split(":").map(Number);
    const total = hours! * 60 + minutes! + Math.round(offsetSeconds / 60);
    const days = Math.floor(total / 1440);
    return `${days ? `다음 ${days}일 ` : ""}${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")} (예시)`;
  }
  const date = new Date(value);
  const label = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  const localDate = new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  return schedule?.effective.date && localDate !== schedule.effective.date ? `${localDate} ${label}` : label;
}
