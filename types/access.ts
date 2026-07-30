export const PET_ACCESS_STATUSES = [
  "AVAILABLE",
  "CONDITIONAL",
  "NEEDS_CONFIRMATION",
  "NOT_MATCHED",
] as const;

export type PetAccessStatus = (typeof PET_ACCESS_STATUSES)[number];

export interface PetPolicy {
  allowedSpecies: Array<"DOG" | "CAT" | "OTHER">;
  allowedSizes: Array<"SMALL" | "MEDIUM" | "LARGE">;
  allowedAreas: string[];
  requiredItems: string[];
  restrictions: string[];
  originalText: string;
  isAmbiguous: boolean;
}

export interface AssessmentEvidence {
  sourceName: string;
  sourceText: string;
  retrievedAt: string;
  matchedFragments: string[];
}

export interface ContactAction {
  label: string;
  href?: string;
  suggestedQuestion: string;
}

export interface PetAccessAssessment {
  status: PetAccessStatus;
  reason: string;
  matchedUserConditions: string[];
  requiredItems: string[];
  restrictions: string[];
  originalSourceText: string;
  sourceName: string;
  retrievedAt: string;
  contactAction?: ContactAction;
}
