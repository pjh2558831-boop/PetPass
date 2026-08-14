export const PLACE_CANDIDATE_KINDS = [
  "pet_travel_candidate",
  "veterinary",
  "pet_shop",
] as const;

export type PlaceCandidateKind = (typeof PLACE_CANDIDATE_KINDS)[number];

export const PET_TRAVEL_CANDIDATE_CATEGORIES = [
  "cafe",
  "food",
  "accommodation",
  "attraction",
  "park_walk",
  "leisure",
  "camping",
  "other",
] as const;

export type PetTravelCandidateCategory =
  (typeof PET_TRAVEL_CANDIDATE_CATEGORIES)[number];

export const PLACE_CANDIDATE_REVIEW_STATUSES = [
  "unreviewed",
  "confirmed",
  "rejected",
  "needs_review",
] as const;

export type PlaceCandidateReviewStatus =
  (typeof PLACE_CANDIDATE_REVIEW_STATUSES)[number];

export const PLACE_CANDIDATE_LIFECYCLE_STATUSES = [
  "current",
  "stale",
] as const;

export type PlaceCandidateLifecycleStatus =
  (typeof PLACE_CANDIDATE_LIFECYCLE_STATUSES)[number];

export const PLACE_CANDIDATE_COLLECTION_RUN_STATUSES = [
  "planned",
  "running",
  "completed",
  "partial",
  "failed",
] as const;

export type PlaceCandidateCollectionRunStatus =
  (typeof PLACE_CANDIDATE_COLLECTION_RUN_STATUSES)[number];

export interface PlaceCandidateReviewFields {
  reviewStatus: PlaceCandidateReviewStatus;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  verificationEvidence: Record<string, unknown> | null;
}

export interface PlaceCandidateCollectionState
  extends PlaceCandidateReviewFields {
  publicVisibility: boolean;
  lifecycleStatus: PlaceCandidateLifecycleStatus;
}

export interface PlaceCandidateReconciliationResult {
  state: PlaceCandidateCollectionState;
  changed: boolean;
  requiresRecheck: boolean;
}
