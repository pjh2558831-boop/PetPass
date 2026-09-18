import { z } from "zod";
import { recommendationProductRouteSchema } from "@/lib/recommendation/recommendation-response";
import { readVersionedValue, writeVersionedValue, type StorageLike } from "./versioned-storage";
import type { ProductRouteV1, RouteRecommendationReadyResponseV1 } from "@/types/recommendation";

const STORAGE_VERSION = 2;
const STORAGE_KEY = "petpass:saved-route-recommendation";
const MAX_SNAPSHOT_BYTES = 256_000;
const readCache = new WeakMap<StorageLike, { raw: string | null; value: SavedRouteRecommendationSnapshotV1 | null }>();
const product = recommendationProductRouteSchema;
// V1 summaries remain readable without inventing missing coordinates or source evidence.
const storedRouteSchema = product.partial().required({ id: true, kind: true, label: true, routeSummary: true, temporalBasis: true }).extend({
  stops: z.array(product.shape.stops.element.partial().required({ placeId: true, sequence: true, title: true, arrivalAt: true, departureAt: true })).min(1).max(5),
});
export const savedRouteSchema = z.object({
  engineVersion: z.enum(["petpass-route-engine-v1", "petpass-route-engine-v2"]),
  objectiveVersion: z.literal("route-objective-v1"), solverVersion: z.literal("route-solver-v1"),
  requestSummary: z.object({ departureLabel: z.string().min(1), tripDate: z.string().date().nullable(), startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable(), tripType: z.enum(["day_trip", "overnight"]), tripPace: z.enum(["relaxed", "balanced", "packed"]), selectedCategories: z.array(z.string().min(1)), roundTrip: z.boolean() }),
  route: storedRouteSchema,
  departure: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional(),
  saveState: z.enum(["draft", "scheduled", "legacy_summary"]).default("legacy_summary"),
  selectedProviderContentIds: z.array(z.string().min(1)).min(1).max(5),
  optimality: z.enum(["optimal_within_candidate_set_current_matrix", "best_found_within_time_limit"]),
  warningCodes: z.array(z.string().min(1)), manuallyModified: z.boolean(), savedAt: z.string().datetime(),
});
export type SavedRouteRecommendationSnapshotV1 = z.infer<typeof savedRouteSchema>;

export function parseSavedRouteRecommendation(value: unknown): SavedRouteRecommendationSnapshotV1 | null {
  const parsed = savedRouteSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function browserStorage(storage?: StorageLike | null): StorageLike | null {
  try { return storage === undefined ? typeof window === "undefined" ? null : window.localStorage : storage; } catch { return null; }
}
export function loadSavedRouteRecommendation(storage?: StorageLike | null): SavedRouteRecommendationSnapshotV1 | null {
  const resolved = browserStorage(storage);
  if (!resolved) return null;
  try {
    const raw = resolved.getItem(STORAGE_KEY);
    const cached = readCache.get(resolved);
    if (cached?.raw === raw) return cached.value;
    const value = readVersionedValue(STORAGE_KEY, savedRouteSchema, { version: STORAGE_VERSION, migrations: { 1: (data) => data }, storage: resolved });
    readCache.set(resolved, { raw, value });
    return value;
  } catch { return null; }
}

export function createSavedRouteRecommendation(recommendation: RouteRecommendationReadyResponseV1, route: ProductRouteV1 = recommendation.route, now = new Date(), departure?: { latitude: number; longitude: number }): SavedRouteRecommendationSnapshotV1 | null {
  const isGeographicDraft = route.planningPolicy === "full_public_catalog_v1";
  if (!isGeographicDraft && (route.confirmationStatus === "confirmation_required" || route.stops.some((stop) => {
    const state = stop.petConditionEligibility?.state;
    return state === "ineligible" || stop.conditionAcknowledged === false ||
      ((state === "eligible_with_confirmation" || state === "insufficient_evidence") && stop.conditionAcknowledged !== true);
  }))) return null;
  const expected = route.stops.length + Number(recommendation.requestSummary.roundTrip);
  const summary = route.routeSummary;
  if (summary.stopCount !== route.stops.length || !route.segments || route.segments.length !== expected ||
    route.segments.reduce((sum, edge) => sum + edge.travelSeconds, 0) !== summary.totalDrivingSeconds ||
    route.segments.reduce((sum, edge) => sum + edge.distanceMeters, 0) !== summary.totalDistanceMeters ||
    (summary.totalElapsedSeconds !== undefined && summary.totalElapsedSeconds !== summary.totalDrivingSeconds + summary.totalVisitSeconds + summary.totalWaitSeconds)) return null;
  if (route.segments.some((edge, index) => edge.toPlaceId !== (route.stops[index]?.placeId ?? route.segments![0]!.fromPlaceId) || (index > 0 && edge.fromPlaceId !== route.stops[index - 1]!.placeId))) return null;
  const parsed = product.safeParse({ ...route, geometry: route.geometry.filter((_, index, points) => index === 0 || index === points.length - 1 || index % Math.max(1, Math.ceil(points.length / 510)) === 0), stops: route.stops.map((stop) => ({ ...stop, evidence: stop.evidence.slice(0, 9).map((item) => ({ ...item, originalText: item.originalText.slice(0, 2_000) })) })) });
  if (!parsed.success) return null;
  const value = { engineVersion: recommendation.engineVersion, objectiveVersion: recommendation.objectiveVersion, solverVersion: recommendation.solverVersion,
    requestSummary: recommendation.requestSummary, route: parsed.data, ...(departure ? { departure } : {}),
    saveState: isGeographicDraft || !route.schedule?.requested.date || route.schedule?.state === "adjustment_proposal" ? "draft" as const : "scheduled" as const,
    selectedProviderContentIds: route.stops.map(({ placeId }) => placeId), optimality: recommendation.optimality,
    warningCodes: recommendation.warnings, manuallyModified: route.kind === "manual", savedAt: now.toISOString() };
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_SNAPSHOT_BYTES) return null;
  return savedRouteSchema.parse(value);
}

export function saveRouteRecommendation(recommendation: RouteRecommendationReadyResponseV1, route: ProductRouteV1 = recommendation.route, storage?: StorageLike | null, now = new Date(), departure?: { latitude: number; longitude: number }): boolean {
  const value = createSavedRouteRecommendation(recommendation, route, now, departure);
  if (!value) return false;
  const resolved = browserStorage(storage);
  if (!resolved) return false;
  const saved = writeVersionedValue(STORAGE_KEY, value, savedRouteSchema, { version: STORAGE_VERSION, storage: resolved });
  if (saved) readCache.delete(resolved);
  return saved;
}
