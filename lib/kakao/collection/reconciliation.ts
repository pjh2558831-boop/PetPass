import type {
  PlaceCandidateCollectionRunStatus,
  PlaceCandidateCollectionState,
  PlaceCandidateReconciliationResult,
  PlaceCandidateReviewFields,
} from "@/types/place-candidate";

export function createNewCandidateCollectionState(): PlaceCandidateCollectionState {
  return {
    reviewStatus: "unreviewed",
    publicVisibility: true,
    lifecycleStatus: "current",
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
    verificationEvidence: null,
  };
}

export function preserveCandidateReviewFields<
  T extends PlaceCandidateReviewFields,
>(existing: PlaceCandidateReviewFields, incoming: T): T {
  return {
    ...incoming,
    reviewStatus: existing.reviewStatus,
    reviewedAt: existing.reviewedAt,
    reviewedBy: existing.reviewedBy,
    reviewNote: existing.reviewNote,
    verificationEvidence: existing.verificationEvidence,
  };
}

export function stateForRediscoveredCandidate(
  existing: PlaceCandidateCollectionState,
): PlaceCandidateCollectionState {
  const publicVisibility =
    existing.reviewStatus === "rejected"
      ? false
      : existing.reviewStatus === "confirmed"
        ? existing.publicVisibility
        : true;
  return {
    ...existing,
    lifecycleStatus: "current",
    publicVisibility,
  };
}

export function reconcileCandidateAfterCollection(input: {
  existing: PlaceCandidateCollectionState;
  seenInCompletedRun: boolean;
  runStatus: PlaceCandidateCollectionRunStatus;
}): PlaceCandidateReconciliationResult {
  const { existing, runStatus, seenInCompletedRun } = input;
  if (runStatus !== "completed") {
    return { state: { ...existing }, changed: false, requiresRecheck: false };
  }

  if (seenInCompletedRun) {
    const state = stateForRediscoveredCandidate(existing);
    return {
      state,
      changed:
        state.lifecycleStatus !== existing.lifecycleStatus ||
        state.publicVisibility !== existing.publicVisibility,
      requiresRecheck: false,
    };
  }

  if (existing.reviewStatus === "confirmed") {
    const state = {
      ...existing,
      lifecycleStatus: "stale" as const,
      publicVisibility: true,
    };
    return { state, changed: true, requiresRecheck: true };
  }

  const state = {
    ...existing,
    lifecycleStatus: "stale" as const,
    publicVisibility: false,
  };
  return {
    state,
    changed:
      state.lifecycleStatus !== existing.lifecycleStatus ||
      state.publicVisibility !== existing.publicVisibility,
    requiresRecheck: false,
  };
}
