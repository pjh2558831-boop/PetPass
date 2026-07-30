import type { AssessmentEvidence, PetAccessAssessment } from "@/types/access";

export function createAssessmentEvidence(
  assessment: PetAccessAssessment,
): AssessmentEvidence {
  return {
    sourceName: assessment.sourceName,
    sourceText: assessment.originalSourceText,
    retrievedAt: assessment.retrievedAt,
    matchedFragments: [
      ...assessment.requiredItems,
      ...assessment.restrictions,
    ].filter((fragment) => assessment.originalSourceText.includes(fragment)),
  };
}
