import type { PetSize } from "@/types/pet";

export const PET_SIZE_COMPATIBILITY_STATES = [
  "compatible",
  "incompatible",
  "verification_required",
  "not_specified",
] as const;

export type PetSizeCompatibilityState =
  (typeof PET_SIZE_COMPATIBILITY_STATES)[number];

export type PetSizeCompatibilityReason =
  | "pet_size_not_requested"
  | "no_explicit_size_evidence"
  | "explicit_all_sizes"
  | "explicit_size_allowance"
  | "explicit_size_denial"
  | "exact_weight_required"
  | "ambiguous_size_restriction";

export interface PetSizeCompatibilityResult {
  rulesetVersion: "1";
  requestedSize: PetSize | null;
  state: PetSizeCompatibilityState;
  reason: PetSizeCompatibilityReason;
  evidenceIds: string[];
  sourceTexts: string[];
}
