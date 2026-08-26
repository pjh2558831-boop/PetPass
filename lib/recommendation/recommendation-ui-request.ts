import type { TourCatalogCategory } from "@/lib/tour-api/catalog";
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
): RouteRecommendationRequest {
  if (!preferences.departure) {
    throw new TypeError("A resolved departure is required.");
  }
  return {
    departure: {
      label: preferences.departure.label,
      latitude: preferences.departure.coordinates.latitude,
      longitude: preferences.departure.coordinates.longitude,
      source: preferences.departure.source ?? "kakao_place_search",
    },
    trip: {
      regionId: "busan",
      districtId: preferences.districtCode ?? null,
      date: preferences.tripDate,
      startTime: preferences.startTime,
      tripType:
        preferences.tripType === "OVERNIGHT" ? "overnight" : "day_trip",
      tripPace: preferences.tripPace,
      selectedCategories: selectedCategories(preferences),
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
      availableEquipment: {
        carrier: profile.hasCarrier,
        leash: profile.hasLeash,
        muzzle: profile.hasMuzzle,
      },
      acceptsOutdoorOnlyPlaces: profile.acceptsOutdoorOnly,
    },
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
}
