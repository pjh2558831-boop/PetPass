export const PLACE_TRUST_RULE_VERSION = "petpass-trust-v1";

export const PLACE_TRUST_RULES = {
  sourceBaseline: 10,
  tourismPetEvidence: 50,
  tourismWithoutPetEvidence: 15,
  businessConfirmation: 30,
  administratorConfirmation: 30,
  consistentUserReport: 12,
  maxUserReports: 2,
  kakaoDiscoveryBaseline: 5,
  kakaoOnlyMaximum: 25,
  staleVerificationPenalty: -15,
  sourceConflictPenalty: -25,
  maxConflictPenaltyCount: 2,
  missingEvidencePenalty: -10,
  closedLicensePenalty: -15,
  currentAgeDays: {
    tourism: 365,
    business: 180,
    administrator: 365,
    userReport: 90,
  },
  levels: { high: 75, medium: 45 },
} as const;
