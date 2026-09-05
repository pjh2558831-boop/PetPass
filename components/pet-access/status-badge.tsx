import { Check } from "lucide-react";
import type { PetAccessStatus } from "@/types/access";

export function StatusBadge({ status }: { status: PetAccessStatus }) {
  void status;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[#abd2bc] bg-[#e8f6ee] px-2.5 py-1 text-xs font-extrabold text-[#236148]"
    >
      <Check size={13} aria-hidden="true" />
      반려동물 동반 가능
    </span>
  );
}
