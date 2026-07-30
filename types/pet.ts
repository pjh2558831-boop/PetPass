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
export type PlaceCategory =
  | "ATTRACTION"
  | "RESTAURANT"
  | "CAFE"
  | "ACCOMMODATION"
  | "WALK";

export interface TravelPreferences {
  regionCode: string;
  regionName: string;
  districtCode?: string;
  districtName?: string;
  tripDate: string;
  tripType: TripType;
  startTime: string;
  preferredCategories: PlaceCategory[];
}
