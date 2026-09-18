export type PetSpecies = "DOG" | "CAT" | "OTHER";
export type PetSize = "SMALL" | "MEDIUM" | "LARGE";

export interface PetProfile {
  id: string;
  name: string;
  species: PetSpecies;
  size: PetSize;
  hasCarrier: boolean | null;
  hasLeash: boolean | null;
  hasMuzzle: boolean | null;
  acceptsOutdoorOnly: boolean | null;
}

export type TripType = "DAY_TRIP" | "OVERNIGHT";
export type TripPace = "relaxed" | "balanced" | "packed";
export type PlannerPlanningMode = "stop_count" | "duration";
export type PlannerEnvironmentPreference =
  | "any"
  | "indoor_preferred"
  | "outdoor_preferred";
export type PlaceCategory =
  | "ATTRACTION"
  | "RESTAURANT"
  | "CAFE"
  | "ACCOMMODATION"
  | "WALK";

export interface ResolvedDeparture {
  label: string;
  source?:
    | "kakao_place_search"
    | "address_search"
    | "map_selection"
    | "current_location";
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
  searchScope?: "nearby" | "district" | "region";
  recommendationBasis?: "departure" | "selected_places";
  tripDate: string;
  tripType: TripType;
  tripPace: TripPace;
  startTime: string;
  preferredCategories: PlaceCategory[];
  departure?: ResolvedDeparture;
  planningMode?: PlannerPlanningMode;
  desiredStopCount?: number;
  desiredDurationMinutes?: number;
  environmentPreference?: PlannerEnvironmentPreference;
  includeShopping?: boolean;
  roundTrip?: boolean;
}
