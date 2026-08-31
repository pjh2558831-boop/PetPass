import { describe, expect, it } from "vitest";
import { classifyTourTravelSuitability } from "@/lib/itinerary/travel-suitability";
import type { TourPlaceSummary } from "@/types/place";
import type { NormalizedItineraryRequest } from "@/types/route-generation";

const SEOUL_PARK: TourPlaceSummary = {
  contentId: "129501",
  contentTypeId: "12",
  providerContentTypeId: "12",
  category: "attraction",
  title: "낙산공원",
  address: "서울특별시 종로구",
  detailAddress: null,
  longitude: 127.006496092905,
  latitude: 37.5805179476871,
  phone: null,
  thumbnailUrl: null,
  imageUrl: null,
  copyrightType: null,
  createdTime: null,
  modifiedTime: null,
  legalRegionCode: "11",
  legalDistrictCode: "110",
  classificationCodes: {
    primary: null,
    secondary: null,
    tertiary: null,
    largeCategory: null,
    middleCategory: null,
    smallCategory: null,
  },
  source: {
    provider: "Korea Tourism Organization",
    operation: "areaBasedList2",
    retrievedAt: "2026-08-31T00:00:00.000Z",
    contentId: "129501",
  },
};

const SEOUL_REQUEST: NormalizedItineraryRequest = {
  scope: {
    type: "region",
    regionCode: "11",
    regionName: "서울 전체",
  },
  start: {
    coordinates: {
      latitude: SEOUL_PARK.latitude!,
      longitude: SEOUL_PARK.longitude!,
    },
    label: "낙산공원",
  },
  travelDate: "2026-09-01",
  tripType: "DAY_TRIP",
  tripPace: "relaxed",
  startTime: "09:00",
  planningMode: "stop_count",
  desiredDurationMinutes: null,
  desiredStopCount: 1,
  petSpecies: "DOG",
  petSize: "SMALL",
  acceptsOutdoorOnly: false,
  petEquipment: {
    hasCarrier: true,
    hasLeash: true,
    hasMuzzle: false,
  },
  indoorAccessPreference: "any",
  selectedCategories: ["attraction"],
  includeShopping: false,
  generationSeed: "seoul-selected-place",
  recentRouteSignatures: [],
};

describe("travel suitability region scoping", () => {
  it("accepts a Seoul tourism place when the requested Service2 region is Seoul", () => {
    expect(classifyTourTravelSuitability(SEOUL_PARK, SEOUL_REQUEST)).toMatchObject({
      travelSuitable: true,
      travelRole: "park",
      exclusionReason: null,
    });
  });
});
