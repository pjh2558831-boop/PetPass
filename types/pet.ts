export type PetSpecies = "DOG" | "CAT" | "OTHER";
export type PetSize = "SMALL" | "MEDIUM" | "LARGE";

export interface PetProfile {
  id: string;
  name: string;
  species: PetSpecies;
  size: PetSize;
  hasCarrier: boolean;
  hasLeash: boolean;
  hasMuzzle: boolean;
  acceptsOutdoorOnly: boolean;
}

export type TripType = "DAY_TRIP" | "OVERNIGHT";
export type TripPace = "relaxed" | "balanced" | "packed";
export type PlannerPlanningMode = "stop_count" | "duration";
export type PlannerIndoorAccessPreference = "any" | "preferred" | "required";
export type PlaceCategory =
  | "ATTRACTION"
  | "RESTAURANT"
  | "CAFE"
  | "ACCOMMODATION"
  | "WALK";

export interface ResolvedDeparture {
  label: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
}

export interface TravelPreferences {
  regionCode: string;
  regionName: string;
  districtCode?: string;
  districtName?: string;
  tripDate: string;
  tripType: TripType;
  tripPace: TripPace;
  startTime: string;
  preferredCategories: PlaceCategory[];
  departure?: ResolvedDeparture;
  planningMode?: PlannerPlanningMode;
  desiredStopCount?: number;
  desiredDurationMinutes?: number;
  indoorAccessPreference?: PlannerIndoorAccessPreference;
  includeShopping?: boolean;
}
