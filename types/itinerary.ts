import type { PetAccessAssessment } from "@/types/access";
import type { PetPlace } from "@/types/place";
import type { TravelPreferences } from "@/types/pet";

export interface AlternativePlace {
  place: PetPlace;
  distanceKm: number;
  reason: string;
}

export interface ItineraryStop {
  id: string;
  place: PetPlace;
  plannedArrival: string;
  plannedDeparture: string;
  durationMinutes: number;
  distanceFromPreviousKm?: number;
  driveMinutesFromPrevious?: number;
  accessAssessment: PetAccessAssessment;
  alternatives: AlternativePlace[];
}

export interface Itinerary {
  id: string;
  title: string;
  preferences: TravelPreferences;
  stops: ItineraryStop[];
  totalDistanceKm: number;
  totalDriveMinutes: number;
  requiredItems: string[];
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
}
