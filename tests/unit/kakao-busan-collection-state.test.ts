import { describe, expect, it } from "vitest";
import {
  deduplicateKakaoCandidateRecords,
  deduplicateKakaoSearchResults,
} from "@/lib/kakao/collection/dedupe";
import {
  createNewCandidateCollectionState,
  preserveCandidateReviewFields,
  reconcileCandidateAfterCollection,
  stateForRediscoveredCandidate,
} from "@/lib/kakao/collection/reconciliation";
import type { KakaoPlaceSearchResult } from "@/types/kakao";
import type { PlaceCandidateCollectionState } from "@/types/place-candidate";

function state(
  overrides: Partial<PlaceCandidateCollectionState> = {},
): PlaceCandidateCollectionState {
  return {
    reviewStatus: "unreviewed",
    publicVisibility: true,
    lifecycleStatus: "current",
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
    verificationEvidence: null,
    ...overrides,
  };
}

const searchResult = (id: string): KakaoPlaceSearchResult => ({
  id,
  name: `장소 ${id}`,
  address: "부산광역시 수영구 광안동 1",
  coordinates: { latitude: 35.1456, longitude: 129.1131 },
});

describe("Kakao candidate dedupe and collection state", () => {
  it("deduplicates by Kakao place ID while keeping the first normalized record", () => {
    const first = searchResult("same");
    const second = { ...first, name: "중복 이름" };
    expect(deduplicateKakaoSearchResults([first, second, searchResult("other")])).toEqual({
      places: [first, searchResult("other")],
      duplicateCount: 1,
    });
    expect(
      deduplicateKakaoCandidateRecords([
        { kakaoPlaceId: "1", name: "first" },
        { kakaoPlaceId: "1", name: "duplicate" },
      ]),
    ).toEqual({
      places: [{ kakaoPlaceId: "1", name: "first" }],
      duplicateCount: 1,
    });
  });

  it("creates the mandated public unreviewed current default", () => {
    expect(createNewCandidateCollectionState()).toEqual(state());
  });

  it("preserves every manual review field during a provider refresh", () => {
    const existing = state({
      reviewStatus: "confirmed",
      reviewedAt: "2026-08-14T00:00:00.000Z",
      reviewedBy: "reviewer-1",
      reviewNote: "현장 확인",
      verificationEvidence: { source: "manual" },
    });
    const incoming = state({
      reviewStatus: "unreviewed",
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null,
      verificationEvidence: null,
    });
    expect(preserveCandidateReviewFields(existing, incoming)).toMatchObject({
      reviewStatus: "confirmed",
      reviewedAt: "2026-08-14T00:00:00.000Z",
      reviewedBy: "reviewer-1",
      reviewNote: "현장 확인",
      verificationEvidence: { source: "manual" },
    });
  });

  it("makes rediscovered rows current without republishing a rejected row", () => {
    expect(
      stateForRediscoveredCandidate(
        state({
          reviewStatus: "rejected",
          publicVisibility: true,
          lifecycleStatus: "stale",
        }),
      ),
    ).toMatchObject({
      reviewStatus: "rejected",
      publicVisibility: false,
      lifecycleStatus: "current",
    });
  });

  it.each(["unreviewed", "needs_review"] as const)(
    "republishes a rediscovered current %s row",
    (reviewStatus) => {
      expect(
        stateForRediscoveredCandidate(
          state({
            reviewStatus,
            publicVisibility: false,
            lifecycleStatus: "stale",
          }),
        ),
      ).toMatchObject({
        reviewStatus,
        publicVisibility: true,
        lifecycleStatus: "current",
      });
    },
  );

  it("preserves the existing public decision for a rediscovered confirmed row", () => {
    expect(
      stateForRediscoveredCandidate(
        state({
          reviewStatus: "confirmed",
          publicVisibility: false,
          lifecycleStatus: "stale",
        }),
      ),
    ).toMatchObject({
      reviewStatus: "confirmed",
      publicVisibility: false,
      lifecycleStatus: "current",
    });
  });

  it.each(["planned", "running", "partial", "failed"] as const)(
    "never reconciles existing visibility after a %s run",
    (runStatus) => {
      const existing = state();
      expect(
        reconcileCandidateAfterCollection({
          existing,
          seenInCompletedRun: false,
          runStatus,
        }),
      ).toEqual({
        state: existing,
        changed: false,
        requiresRecheck: false,
      });
    },
  );

  it("hides unseen unreviewed rows only after a completed run", () => {
    expect(
      reconcileCandidateAfterCollection({
        existing: state(),
        seenInCompletedRun: false,
        runStatus: "completed",
      }),
    ).toEqual({
      state: state({ lifecycleStatus: "stale", publicVisibility: false }),
      changed: true,
      requiresRecheck: false,
    });
  });

  it("keeps unseen confirmed rows public but marks them stale for recheck", () => {
    expect(
      reconcileCandidateAfterCollection({
        existing: state({ reviewStatus: "confirmed" }),
        seenInCompletedRun: false,
        runStatus: "completed",
      }),
    ).toEqual({
      state: state({
        reviewStatus: "confirmed",
        lifecycleStatus: "stale",
        publicVisibility: true,
      }),
      changed: true,
      requiresRecheck: true,
    });
  });

  it("keeps rejected rows hidden and never requests a recheck", () => {
    expect(
      reconcileCandidateAfterCollection({
        existing: state({ reviewStatus: "rejected", publicVisibility: false }),
        seenInCompletedRun: false,
        runStatus: "completed",
      }),
    ).toMatchObject({
      state: {
        reviewStatus: "rejected",
        lifecycleStatus: "stale",
        publicVisibility: false,
      },
      requiresRecheck: false,
    });
  });
});
