import { z } from "zod";
import {
  readVersionedValue,
  writeVersionedValue,
  type StorageLike,
} from "@/lib/storage/versioned-storage";
import type {
  ProductRouteV1,
  RouteRecommendationReadyResponseV1,
} from "@/types/recommendation";

const STORAGE_VERSION = 1;
const STORAGE_KEY = "petpass:saved-route-recommendation";
const storedRouteSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["optimized", "manual"]),
  label: z.string().min(1),
  routeSummary: z.object({
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    stopCount: z.number().int().min(1).max(5),
    totalDistanceMeters: z.number().nonnegative(),
    totalDrivingSeconds: z.number().nonnegative(),
    totalVisitSeconds: z.number().nonnegative(),
    totalWaitSeconds: z.number().nonnegative(),
  }),
  temporalBasis: z.object({
    searchMatrix: z.string().min(1),
    finalRoute: z.string().min(1),
  }),
  stops: z.array(
    z.object({
      placeId: z.string().min(1),
      sequence: z.number().int().min(1).max(5),
      title: z.string().min(1),
      arrivalAt: z.string().datetime(),
      departureAt: z.string().datetime(),
    }),
  ).min(1).max(5),
});

export interface SavedRouteRecommendationSnapshotV1 {
  engineVersion: RouteRecommendationReadyResponseV1["engineVersion"];
  objectiveVersion: RouteRecommendationReadyResponseV1["objectiveVersion"];
  solverVersion: RouteRecommendationReadyResponseV1["solverVersion"];
  requestSummary: RouteRecommendationReadyResponseV1["requestSummary"];
  route: Pick<
    ProductRouteV1,
    "id" | "kind" | "label" | "routeSummary" | "temporalBasis"
  > & {
    stops: Array<
      Pick<
        ProductRouteV1["stops"][number],
        "placeId" | "sequence" | "title" | "arrivalAt" | "departureAt"
      >
    >;
  };
  selectedProviderContentIds: string[];
  optimality: RouteRecommendationReadyResponseV1["optimality"];
  warningCodes: string[];
  manuallyModified: boolean;
  savedAt: string;
}

const savedRouteSchema: z.ZodType<SavedRouteRecommendationSnapshotV1> = z.object({
  engineVersion: z.literal("petpass-route-engine-v1"),
  objectiveVersion: z.literal("route-objective-v1"),
  solverVersion: z.literal("route-solver-v1"),
  requestSummary: z.object({
    departureLabel: z.string().min(1),
    tripDate: z.string().date(),
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u),
    tripType: z.enum(["day_trip", "overnight"]),
    tripPace: z.enum(["relaxed", "balanced", "packed"]),
    selectedCategories: z.array(z.string().min(1)).min(1),
    roundTrip: z.boolean(),
  }),
  route: storedRouteSchema,
  selectedProviderContentIds: z.array(z.string().min(1)).min(1).max(5),
  optimality: z.enum([
    "optimal_within_candidate_set_current_matrix",
    "best_found_within_time_limit",
  ]),
  warningCodes: z.array(z.string().min(1)),
  manuallyModified: z.boolean(),
  savedAt: z.string().datetime(),
});

export function loadSavedRouteRecommendation(
  storage?: StorageLike | null,
): SavedRouteRecommendationSnapshotV1 | null {
  return readVersionedValue(STORAGE_KEY, savedRouteSchema, {
    version: STORAGE_VERSION,
    storage,
  });
}

export function saveRouteRecommendation(
  recommendation: RouteRecommendationReadyResponseV1,
  route: ProductRouteV1 = recommendation.route,
  storage?: StorageLike | null,
  now = new Date(),
): boolean {
  const value: SavedRouteRecommendationSnapshotV1 = {
    engineVersion: recommendation.engineVersion,
    objectiveVersion: recommendation.objectiveVersion,
    solverVersion: recommendation.solverVersion,
    requestSummary: recommendation.requestSummary,
    route: {
      id: route.id,
      kind: route.kind,
      label: route.label,
      routeSummary: route.routeSummary,
      temporalBasis: route.temporalBasis,
      stops: route.stops.map(
        ({ placeId, sequence, title, arrivalAt, departureAt }) => ({
          placeId,
          sequence,
          title,
          arrivalAt,
          departureAt,
        }),
      ),
    },
    selectedProviderContentIds: route.stops.map(({ placeId }) => placeId),
    optimality: recommendation.optimality,
    warningCodes: recommendation.warnings,
    manuallyModified: route.kind === "manual",
    savedAt: now.toISOString(),
  };
  return writeVersionedValue(STORAGE_KEY, value, savedRouteSchema, {
    version: STORAGE_VERSION,
    storage,
  });
}
