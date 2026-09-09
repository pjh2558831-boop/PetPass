import { z } from "zod";
import type { RegionId } from "@/types/region";
import { readVersionedValue, writeVersionedValue, type StorageLike } from "./versioned-storage";

// Match the API's bounded exposure window; keep duplicates to retain frequency.
const historySchema = z.object({
  recentRouteSignatures: z.array(z.string().trim().min(1).max(512)).max(12),
  recentlySelectedCandidateIds: z.array(z.string().trim().min(1).max(128)).max(30),
  historyContextKey: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
});
type RecommendationHistory = z.infer<typeof historySchema>;

export function loadRecommendationHistory(regionId: RegionId, storage?: StorageLike | null): RecommendationHistory | null {
  return readVersionedValue(`petpass:recommendation-history:${regionId}`, historySchema, { version: 1, storage });
}

export function saveRecommendationHistory(regionId: RegionId, history: RecommendationHistory, storage?: StorageLike | null): boolean {
  return writeVersionedValue(`petpass:recommendation-history:${regionId}`, {
    ...history,
    recentRouteSignatures: history.recentRouteSignatures.slice(-12),
    recentlySelectedCandidateIds: history.recentlySelectedCandidateIds.slice(-30),
  }, historySchema, { version: 1, storage });
}
