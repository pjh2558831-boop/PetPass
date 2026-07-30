import {
  AlertTriangle,
  Check,
  CircleHelp,
  X,
  type LucideIcon,
} from "lucide-react";
import type { PetAccessStatus } from "@/types/access";

const config: Record<
  PetAccessStatus,
  { label: string; className: string; icon: LucideIcon }
> = {
  AVAILABLE: {
    label: "이용 가능",
    className: "border-[#abd2bc] bg-[#e8f6ee] text-[#236148]",
    icon: Check,
  },
  CONDITIONAL: {
    label: "조건부 가능",
    className: "border-[#efd0a9] bg-[#fff4e6] text-[#934b20]",
    icon: AlertTriangle,
  },
  NEEDS_CONFIRMATION: {
    label: "확인 필요",
    className: "border-[#d5c9e8] bg-[#f4effb] text-[#684b8e]",
    icon: CircleHelp,
  },
  NOT_MATCHED: {
    label: "조건 불일치",
    className: "border-[#e7bbbb] bg-[#fceeee] text-[#993e3e]",
    icon: X,
  },
};

export function StatusBadge({ status }: { status: PetAccessStatus }) {
  const { label, className, icon: Icon } = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold ${className}`}
    >
      <Icon size={13} aria-hidden="true" />
      {label}
    </span>
  );
}
