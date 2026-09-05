import type { TourCatalogCategory } from "@/lib/tour-api/catalog";
import { getRegionConfigByService2LegalDongCode } from "@/lib/regions/config";
import { routeRecommendationRequestSchema } from "@/lib/recommendation/recommendation-request";
import type { PetProfile, TravelPreferences } from "@/types/pet";
import type { RouteRecommendationRequest } from "@/types/recommendation";

const PREFERENCE_CATEGORY_MAP = {
  ATTRACTION: "attraction",
  RESTAURANT: "food",
  CAFE: "food",
  ACCOMMODATION: "accommodation",
  WALK: "leisure",
} as const satisfies Record<
  TravelPreferences["preferredCategories"][number],
  TourCatalogCategory
>;

function selectedCategories(
  preferences: TravelPreferences,
): RouteRecommendationRequest["trip"]["selectedCategories"] {
  const values: RouteRecommendationRequest["trip"]["selectedCategories"] =
    preferences.preferredCategories.map(
      (category) => PREFERENCE_CATEGORY_MAP[category],
    );
  if (preferences.includeShopping) values.push("shopping");
  return [...new Set(values)];
}

export function createRouteRecommendationRequest(
  profile: PetProfile,
  preferences: TravelPreferences,
  personalizationOverrides: Partial<
    NonNullable<RouteRecommendationRequest["personalization"]>
  > = {},
  selection?: {
    selectedPlaces: Array<{ id: string; regionId: RouteRecommendationRequest["trip"]["regionId"] }>;
    autoFill: boolean;
    includeVerificationRequired?: boolean;
    selectedCategories: RouteRecommendationRequest["trip"]["selectedCategories"];
    acknowledgedVerificationRequiredPlaceIds?: string[];
  },
  _eligibility: { includeVerificationRequired?: boolean } = {},
): RouteRecommendationRequest {
  void _eligibility; // Legacy UI call shape; V2 collects answers only in the contextual result flow.
  if (!preferences.departure) {
    throw new TypeError("A resolved departure is required.");
  }
  const region = getRegionConfigByService2LegalDongCode(preferences.regionCode);
  if (!region) {
    throw new TypeError("The selected region is not part of the supported regional configuration.");
  }
  const request: RouteRecommendationRequest = {
    requestVersion: 2,
    departure: {
      label: preferences.departure.label,
      latitude: preferences.departure.coordinates.latitude,
      longitude: preferences.departure.coordinates.longitude,
      source: preferences.departure.source ?? "kakao_place_search",
    },
    trip: {
      regionId: region.id,
      districtId: preferences.districtCode ?? null,
      date: preferences.tripDate || null,
      startTime: preferences.startTime || null,
      tripType:
        preferences.tripType === "OVERNIGHT" ? "overnight" : "day_trip",
      tripPace: preferences.tripPace,
      selectedCategories: selection?.selectedCategories ?? selectedCategories(preferences),
      roundTrip: preferences.roundTrip ?? false,
      environmentPreference: preferences.environmentPreference ?? "any",
      ...(preferences.desiredStopCount === undefined
        ? {}
        : { desiredStopCount: preferences.desiredStopCount }),
      ...(preferences.planningMode === "duration" &&
      preferences.desiredDurationMinutes !== undefined
        ? { durationMinutes: preferences.desiredDurationMinutes }
        : {}),
      travelMode: "driving",
    },
    pet: {
      name: profile.name.trim() || null,
      species: profile.species,
      size: profile.size,
    },
    ...(selection ? {
      selectedPlaceIds: selection.selectedPlaces.map(({ id }) => id),
      selectedPlaceReferences: selection.selectedPlaces.map(({ id, regionId }) => ({
        placeId: id,
        regionId,
      })),
      acknowledgedVerificationRequiredPlaceIds: [],
      autoFill: selection.autoFill,
      includeVerificationRequired: false,
    } : {
      includeVerificationRequired: false,
    }),
    personalization: {
      petCount: 1,
      petActivityLevel: "moderate",
      walkingTolerance: "moderate",
      crowdPreference: "any",
      tripMood: "balanced",
      categoryPriorities: {},
      recentRouteSignatures: [],
      recentlySelectedCandidateIds: [],
      explicitlyExcludedPlaceIds: [],
      rerollVariant: 0,
      ...personalizationOverrides,
    },
  };
  return routeRecommendationRequestSchema.parse(request);
}
