import { FlaskConical } from "lucide-react";

export function DemoBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[#efc7a9] bg-[#fff5ec] px-2.5 py-1 text-[11px] font-extrabold text-[#9b4b24]"
      aria-label="로컬 데모 데이터"
    >
      <FlaskConical size={13} aria-hidden="true" />
      {compact ? "데모" : "로컬 데모 데이터"}
    </span>
  );
}
