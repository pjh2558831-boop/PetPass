import type { PetAccessAssessment, PetPolicy } from "@/types/access";
import type { LicenseVerification } from "@/types/license";
import type { PlaceCategory } from "@/types/pet";

export interface DataSourceMetadata {
  sourceName: string;
  sourceUrl?: string;
  retrievedAt: string;
  modifiedAt?: string;
  isDemo: boolean;
  copyrightCode?: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PetPlace {
  contentId: string;
  contentTypeId: string;
  name: string;
  category: PlaceCategory;
  address: string;
  coordinates: Coordinates;
  phone?: string;
  imageUrl?: string;
  summary: string;
  openingHours?: string;
  closedDays?: string;
  parking?: string;
  petPolicy: PetPolicy;
  accessAssessment: PetAccessAssessment;
  licenseVerification: LicenseVerification;
  source: DataSourceMetadata;
}
