import { z } from "zod";

export const petSpeciesSchema = z.enum(["DOG", "CAT", "OTHER"]);
export const petSizeSchema = z.enum(["SMALL", "MEDIUM", "LARGE"]);
export const placeCategorySchema = z.enum([
  "ATTRACTION",
  "RESTAURANT",
  "CAFE",
  "ACCOMMODATION",
  "WALK",
]);

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const petProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(30),
  species: petSpeciesSchema,
  size: petSizeSchema,
  hasCarrier: z.boolean(),
  hasLeash: z.boolean(),
  hasMuzzle: z.boolean(),
  acceptsOutdoorOnly: z.boolean(),
});

export const travelPreferencesSchema = z.object({
  regionCode: z.string().min(1),
  regionName: z.string().min(1),
  districtCode: z.string().min(1).optional(),
  districtName: z.string().min(1).optional(),
  tripDate: z.string().date(),
  tripType: z.enum(["DAY_TRIP", "OVERNIGHT"]),
  tripPace: z.enum(["relaxed", "balanced", "packed"]).default("balanced"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  preferredCategories: z.array(placeCategorySchema).min(1),
  departure: z
    .object({
      label: z.string().trim().min(1).max(80),
      coordinates: coordinatesSchema,
    })
    .optional(),
  planningMode: z.enum(["stop_count", "duration"]).optional(),
  desiredStopCount: z.number().int().min(1).max(5).optional(),
  desiredDurationMinutes: z.number().int().min(120).max(600).optional(),
  indoorAccessPreference: z.enum(["any", "preferred", "required"]).optional(),
  includeShopping: z.boolean().optional(),
});

export const petPolicySchema = z.object({
  allowedSpecies: z.array(petSpeciesSchema),
  allowedSizes: z.array(petSizeSchema),
  allowedAreas: z.array(z.string().min(1)),
  requiredItems: z.array(z.string().min(1)),
  restrictions: z.array(z.string().min(1)),
  originalText: z.string(),
  isAmbiguous: z.boolean(),
});

export const petAccessStatusSchema = z.enum([
  "AVAILABLE",
  "CONDITIONAL",
  "NEEDS_CONFIRMATION",
  "NOT_MATCHED",
]);

export const assessmentEvidenceSchema = z.object({
  sourceName: z.string().min(1),
  sourceText: z.string(),
  retrievedAt: z.string().datetime(),
  matchedFragments: z.array(z.string()),
});

export const contactActionSchema = z.object({
  label: z.string().min(1),
  href: z.string().optional(),
  suggestedQuestion: z.string().min(1),
});

export const petAccessAssessmentSchema = z.object({
  status: petAccessStatusSchema,
  reason: z.string().min(1),
  matchedUserConditions: z.array(z.string()),
  requiredItems: z.array(z.string()),
  restrictions: z.array(z.string()),
  originalSourceText: z.string(),
  sourceName: z.string().min(1),
  retrievedAt: z.string().datetime(),
  contactAction: contactActionSchema.optional(),
});

export const licenseVerificationSchema = z.object({
  status: z.enum([
    "VERIFIED_ACTIVE",
    "NO_MATCH",
    "NEEDS_CONFIRMATION",
    "NOT_APPLICABLE",
  ]),
  reason: z.string().min(1),
  matchedBusinessName: z.string().optional(),
  matchedAddress: z.string().optional(),
  verifiedAt: z.string().datetime().optional(),
  sourceName: z.string().min(1),
});

export const dataSourceMetadataSchema = z.object({
  sourceName: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  retrievedAt: z.string().datetime(),
  modifiedAt: z.string().datetime().optional(),
  isDemo: z.boolean(),
  copyrightCode: z.string().optional(),
});

export const petPlaceSchema = z.object({
  contentId: z.string().min(1),
  contentTypeId: z.string().min(1),
  name: z.string().min(1),
  category: placeCategorySchema,
  address: z.string().min(1),
  coordinates: coordinatesSchema,
  phone: z.string().optional(),
  imageUrl: z.string().url().optional(),
  summary: z.string().min(1),
  openingHours: z.string().optional(),
  closedDays: z.string().optional(),
  parking: z.string().optional(),
  petPolicy: petPolicySchema,
  accessAssessment: petAccessAssessmentSchema,
  licenseVerification: licenseVerificationSchema,
  source: dataSourceMetadataSchema,
});

export const alternativePlaceSchema = z.object({
  place: petPlaceSchema,
  distanceKm: z.number().nonnegative(),
  reason: z.string().min(1),
});

export const itineraryStopSchema = z.object({
  id: z.string().min(1),
  place: petPlaceSchema,
  plannedArrival: z.string().regex(/^\d{2}:\d{2}$/),
  plannedDeparture: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().positive(),
  distanceFromPreviousKm: z.number().nonnegative().optional(),
  driveMinutesFromPrevious: z.number().int().nonnegative().optional(),
  accessAssessment: petAccessAssessmentSchema,
  alternatives: z.array(alternativePlaceSchema),
});

export const itinerarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  preferences: travelPreferencesSchema,
  stops: z.array(itineraryStopSchema),
  totalDistanceKm: z.number().nonnegative(),
  totalDriveMinutes: z.number().int().nonnegative(),
  requiredItems: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  isDemo: z.boolean(),
});

export const apiErrorSchema = z.object({
  code: z.enum([
    "CONFIGURATION_REQUIRED",
    "UPSTREAM_ERROR",
    "UPSTREAM_TIMEOUT",
    "UPSTREAM_AUTHENTICATION",
    "UPSTREAM_FORBIDDEN",
    "UPSTREAM_QUOTA",
    "INVALID_RESPONSE",
    "INVALID_REQUEST",
    "REGION_NOT_ENABLED_FOR_MAP",
    "RATE_LIMITED",
    "NOT_FOUND",
  ]),
  message: z.string().min(1),
  retryable: z.boolean(),
});
