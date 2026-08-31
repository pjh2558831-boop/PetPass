"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, MapPin, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlannerFormProgress } from "@/components/layout/planner-progress";
import { DepartureMapPicker } from "@/components/planner/departure-map-picker";
import { DepartureSearch } from "@/components/planner/departure-search";
import {
  DEFAULT_PLANNER_PREFERENCES,
  DEFAULT_PLANNER_PROFILE,
  usePlannerState,
} from "@/components/planner/planner-state";
import { Button } from "@/components/ui/button";
import {
  getTripPacePlanning,
  TRIP_PACE_OPTIONS,
} from "@/lib/itinerary/trip-pace";
import {
  REGION_CONFIGS,
  getRegionConfig,
  getRegionConfigByService2LegalDongCode,
  getRegionDistrict,
} from "@/lib/regions/config";
import {
  createPlanDraft,
  loadPlanDraft,
  savePlanDraft,
  updatePlanDraftFromPlanner,
  updatePlanDraftSelection,
  type PlanDraft,
} from "@/lib/storage/plan-draft-storage";
import {
  getSelectedItineraryCategories,
  loadSelectedItinerary,
  saveSelectedItinerary,
  selectedItineraryNeedsWarning,
  setSelectedItineraryVerificationAcknowledged,
  type SelectedItinerarySnapshot,
} from "@/lib/storage/selected-itinerary-storage";
import type {
  PetProfile,
  PetSize,
  PetSpecies,
  PlaceCategory,
  TravelPreferences,
  TripType,
} from "@/types/pet";

const speciesOptions: Array<{ value: PetSpecies; label: string }> = [
  { value: "DOG", label: "강아지" },
  { value: "CAT", label: "고양이" },
  { value: "OTHER", label: "기타" },
];

const sizeOptions: Array<{ value: PetSize; label: string; note: string }> = [
  { value: "SMALL", label: "소형", note: "약 10kg 미만" },
  { value: "MEDIUM", label: "중형", note: "약 10–25kg" },
  { value: "LARGE", label: "대형", note: "약 25kg 이상" },
];

const equipmentOptions = [
  { key: "hasCarrier" as const, label: "이동장" },
  { key: "hasLeash" as const, label: "목줄" },
  { key: "hasMuzzle" as const, label: "입마개" },
  { key: "acceptsOutdoorOnly" as const, label: "야외 공간 가능" },
];

const environmentOptions = [
  { value: "any" as const, label: "상관없음" },
  { value: "indoor_preferred" as const, label: "실내 우선" },
  { value: "outdoor_preferred" as const, label: "야외 우선" },
];

const tripTypeOptions: Array<{ value: TripType; label: string; note: string }> = [
  { value: "DAY_TRIP", label: "당일치기", note: "하루 안에 마치는 일정" },
  { value: "OVERNIGHT", label: "1박 여행", note: "숙소를 마지막 방문지로 배치" },
];

const categoryOptions: Array<{ value: PlaceCategory; label: string }> = [
  { value: "ATTRACTION", label: "관광지" },
  { value: "RESTAURANT", label: "음식점" },
  { value: "CAFE", label: "카페" },
  { value: "WALK", label: "산책·공원" },
  { value: "ACCOMMODATION", label: "숙소" },
];

const categoryLabels: Record<PlaceCategory, string> = {
  ATTRACTION: "관광지",
  RESTAURANT: "음식점",
  CAFE: "카페",
  WALK: "산책·공원",
  ACCOMMODATION: "숙소",
};

const AUTOMATIC_REGIONS = REGION_CONFIGS.filter(
  ({ routeCapabilities }) => routeCapabilities.fullyAutomaticRecommendation,
);

function preferencesFromDraft(
  draft: PlanDraft,
  current: TravelPreferences,
): TravelPreferences {
  const region = getRegionConfig(draft.regionId);
  const categoryMap: Partial<Record<PlanDraft["requestedCategories"][number], PlaceCategory>> = {
    attraction: "ATTRACTION",
    food: "RESTAURANT",
    leisure: "WALK",
    accommodation: "ACCOMMODATION",
  };
  const preferredCategories = [...new Set(draft.requestedCategories.flatMap((category) => {
    const mapped = categoryMap[category];
    return mapped ? [mapped] : [];
  }))];
  return {
    ...current,
    regionCode: region.providerCodes.korPetTourService2.legalDongRegionCode,
    regionName: region.displayName,
    districtCode: draft.districtId ?? undefined,
    districtName: draft.districtId
      ? getRegionDistrict(region, draft.districtId)?.name
      : undefined,
    tripDate: draft.travelDate ?? current.tripDate,
    startTime: draft.startTime ?? current.startTime,
    tripType: draft.tripType === "overnight" ? "OVERNIGHT" : "DAY_TRIP",
    tripPace: draft.pace,
    preferredCategories: preferredCategories.length > 0
      ? preferredCategories
      : current.preferredCategories,
    includeShopping: draft.requestedCategories.includes("shopping"),
    desiredStopCount: draft.requestedStopCount,
    planningMode: "stop_count",
    roundTrip: draft.roundTrip,
    departure: draft.origin ? {
      label: draft.origin.name,
      source: draft.origin.source,
      coordinates: {
        latitude: draft.origin.latitude,
        longitude: draft.origin.longitude,
      },
    } : current.departure,
  };
}

const speciesLabels: Record<PetSpecies, string> = {
  DOG: "강아지",
  CAT: "고양이",
  OTHER: "기타",
};

const sizeLabels: Record<PetSize, string> = {
  SMALL: "소형",
  MEDIUM: "중형",
  LARGE: "대형",
};

type FieldErrors = Partial<
  Record<
    | "name"
    | "species"
    | "size"
    | "departure"
    | "tripDate"
    | "startTime"
    | "planning"
    | "categories"
    | "selection",
    string
  >
>;

type FieldName = keyof FieldErrors;
type ValidationScope = 1 | 2 | 3 | "all";

const stepFields: Record<1 | 2 | 3, FieldName[]> = {
  1: ["name", "species", "size"],
  2: ["departure", "tripDate", "startTime"],
  3: ["selection", "planning", "categories"],
};

const validationOrder: FieldName[] = [
  "selection",
  "name",
  "species",
  "size",
  "departure",
  "tripDate",
  "startTime",
  "planning",
  "categories",
];

const fieldStep: Record<FieldName, 1 | 2 | 3> = {
  selection: 3,
  name: 1,
  species: 1,
  size: 1,
  departure: 2,
  tripDate: 2,
  startTime: 2,
  planning: 3,
  categories: 3,
};

export interface SavedPetPlannerOption {
  profile: PetProfile;
  imageUrl: string | null;
}

function SelectedPlaceImage({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-[var(--brand-soft)]">
      {imageUrl && !failed ? (
        <Image
          src={imageUrl}
          alt={`${name} 장소 사진`}
          fill
          sizes="80px"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="grid size-full place-items-center text-[var(--brand)]"
          role="img"
          aria-label={`${name} 사진 준비 중`}
        >
          <MapPin size={24} aria-hidden="true" />
        </span>
      )}
    </div>
  );
}

interface UnifiedPlannerFormProps {
  initialSavedPets?: SavedPetPlannerOption[];
  isSignedIn?: boolean;
  savedPetsUnavailable?: boolean;
  mode?: "automatic" | "selected";
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function UnifiedPlannerForm({
  initialSavedPets = [],
  isSignedIn = false,
  savedPetsUnavailable = false,
  mode = "automatic",
}: UnifiedPlannerFormProps) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const composingRef = useRef(false);
  const pendingFocusRef = useRef<string | null>(null);
  const {
    profile,
    preferences,
    profileConfirmed,
    setProfile,
    setPreferences,
    confirmPlannerAndRequestGeneration,
  } = usePlannerState();
  const [species, setSpecies] = useState<PetSpecies | null>(
    profileConfirmed ? profile.species : null,
  );
  const [size, setSize] = useState<PetSize | null>(
    profileConfirmed ? profile.size : null,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [searchVersion, setSearchVersion] = useState(0);
  const [selectedSavedPetId, setSelectedSavedPetId] = useState<string | null>(
    profileConfirmed &&
      initialSavedPets.some(
        ({ profile: savedProfile }) => savedProfile.id === profile.id,
      )
      ? profile.id
      : null,
  );
  const [selectedItinerary, setSelectedItinerary] =
    useState<SelectedItinerarySnapshot | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [includeVerificationRequired, setIncludeVerificationRequired] =
    useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const selectedMode = mode === "selected";
  const preferenceRegion = getRegionConfigByService2LegalDongCode(
    preferences.regionCode,
  );
  const activeRegion = selectedItinerary
    ? getRegionConfig(selectedItinerary.regionId)
    : preferenceRegion?.routeCapabilities.fullyAutomaticRecommendation
      ? preferenceRegion
      : AUTOMATIC_REGIONS[0] ?? REGION_CONFIGS[0];
  const activeDistricts = activeRegion.districts;
  const automaticFillSupported = activeRegion.routeCapabilities.automaticFill;

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const draft = loadPlanDraft();
      const stored = selectedMode ? loadSelectedItinerary() : null;
      if (draft) {
        setIncludeVerificationRequired(draft.includeVerificationRequired);
        if (draft.petProfile) {
          setProfile({ ...draft.petProfile });
          setSpecies(draft.petProfile.species);
          setSize(draft.petProfile.size);
        }
        if (
          selectedMode ||
          getRegionConfig(draft.regionId).routeCapabilities.fullyAutomaticRecommendation
        ) {
          setPreferences((current) => preferencesFromDraft(draft, current));
        }
      }
      if (!selectedMode) return;
      setSelectedItinerary(stored);
      if (!stored || stored.places.length === 0) {
        setSelectionError(
          "일정에 담은 장소가 없습니다. 장소 찾기에서 먼저 방문지를 골라 주세요.",
        );
        return;
      }
      const selectedRegion = getRegionConfig(stored.regionId);
      setPreferences((current) => ({
        ...current,
        regionCode: selectedRegion.providerCodes.korPetTourService2.legalDongRegionCode,
        regionName: selectedRegion.displayName,
        districtCode: draft?.regionId === stored.regionId
          ? draft.districtId ?? undefined
          : undefined,
        districtName: draft?.regionId === stored.regionId && draft.districtId
          ? getRegionDistrict(selectedRegion, draft.districtId)?.name
          : undefined,
      }));
    });
    return () => {
      active = false;
    };
  }, [selectedMode, setPreferences, setProfile]);

  useEffect(() => {
    const focusId = pendingFocusRef.current;
    if (!focusId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(focusId)?.focus();
      pendingFocusRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentStep]);

  const updateProfile = <K extends keyof PetProfile>(
    key: K,
    value: PetProfile[K],
  ) => {
    setSelectedSavedPetId(null);
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const updatePreferences = <K extends keyof TravelPreferences>(
    key: K,
    value: TravelPreferences[K],
  ) => setPreferences((current) => ({ ...current, [key]: value }));

  const clearError = (field: FieldName) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const applySavedPet = ({ profile: savedProfile }: SavedPetPlannerOption) => {
    setProfile({ ...savedProfile });
    setSpecies(savedProfile.species);
    setSize(savedProfile.size);
    setSelectedSavedPetId(savedProfile.id);
    setErrors((current) => {
      const next = { ...current };
      delete next.name;
      delete next.species;
      delete next.size;
      return next;
    });
  };

  const toggleCategory = (category: PlaceCategory) => {
    setPreferences((current) => ({
      ...current,
      preferredCategories: current.preferredCategories.includes(category)
        ? current.preferredCategories.filter((value) => value !== category)
        : [...current.preferredCategories, category],
    }));
    clearError("categories");
  };

  const planningMode = preferences.planningMode ?? "stop_count";
  const desiredStopCount = preferences.desiredStopCount ?? 3;
  const desiredDurationMinutes = preferences.desiredDurationMinutes ?? 360;
  const includeShopping = preferences.includeShopping ?? false;

  const validate = (scope: ValidationScope): FieldErrors => {
    const nextErrors: FieldErrors = {};
    const includes = (field: FieldName) =>
      scope === "all" || stepFields[scope].includes(field);
    const trimmedName = profile.name.trim();
    const selectedPlaces = selectedItinerary?.places ?? [];
    const autoFill = selectedItinerary?.autoFill ?? true;
    const selectedCategories = getSelectedItineraryCategories(selectedPlaces);
    const unacknowledgedVerificationPlaces = selectedPlaces.filter(
      (place) => selectedItineraryNeedsWarning(place) &&
        !selectedItinerary?.acknowledgedVerificationRequiredPlaceIds.includes(place.id),
    );

    if (includes("selection")) {
      if (selectedMode && selectedPlaces.length === 0) {
        nextErrors.selection =
          "일정에 담은 장소가 없습니다. 장소를 한 곳 이상 골라 주세요.";
      } else if (selectedMode && unacknowledgedVerificationPlaces.length > 0) {
        nextErrors.selection =
          "확인이 필요한 선택 장소의 동반·운영 조건을 직접 확인한다는 항목에 동의해 주세요.";
      } else if (
        selectedMode &&
        !autoFill &&
        preferences.tripType === "OVERNIGHT" &&
        !selectedCategories.includes("accommodation")
      ) {
        nextErrors.selection =
          "자동 채우기를 끈 1박 여행에는 숙소를 직접 담아 주세요.";
      }
    }

    if (includes("name") && (!trimmedName || trimmedName.length > 30)) {
      nextErrors.name =
        "반려동물 이름을 1자 이상 30자 이하로 입력해 주세요.";
    }
    if (includes("species") && !species) {
      nextErrors.species = "반려동물 종류를 선택해 주세요.";
    }
    if (includes("size") && !size) {
      nextErrors.size = "반려동물 크기를 선택해 주세요.";
    }
    if (includes("departure") && !preferences.departure) {
      nextErrors.departure =
        "검색 결과나 지도에서 실제 출발지를 선택해 주세요.";
    }
    if (includes("tripDate") && !isValidIsoDate(preferences.tripDate)) {
      nextErrors.tripDate = "여행 날짜를 선택해 주세요.";
    }
    if (
      includes("startTime") &&
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(preferences.startTime)
    ) {
      nextErrors.startTime = "시작 시간을 선택해 주세요.";
    }

    if (includes("planning")) {
      if (planningMode === "duration") {
        if (
          desiredDurationMinutes < 120 ||
          desiredDurationMinutes > 600
        ) {
          nextErrors.planning =
            "전체 일정 시간은 2시간에서 10시간 사이여야 합니다.";
        } else if (
          /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(preferences.startTime)
        ) {
          const [hours, minutes] = preferences.startTime.split(":").map(Number);
          if (
            hours !== undefined &&
            minutes !== undefined &&
            hours * 60 + minutes + desiredDurationMinutes > 24 * 60
          ) {
            nextErrors.planning =
              "선택한 일정이 자정을 넘지 않도록 조정해 주세요.";
          }
        }
      } else if (desiredStopCount < 1 || desiredStopCount > 5) {
        nextErrors.planning =
          "방문 장소 수는 1곳에서 5곳 사이여야 합니다.";
      }
    }

    if (includes("categories")) {
      if (
        !selectedMode &&
        preferences.preferredCategories.length === 0 &&
        !includeShopping
      ) {
        nextErrors.categories =
          "방문하고 싶은 장소 유형을 하나 이상 선택해 주세요.";
      } else if (
        !selectedMode &&
        preferences.tripType === "OVERNIGHT" &&
        !preferences.preferredCategories.includes("ACCOMMODATION")
      ) {
        nextErrors.categories = "1박 여행은 숙소 유형을 함께 선택해 주세요.";
      }
    }

    return nextErrors;
  };

  const replaceStepErrors = (step: 1 | 2 | 3, nextErrors: FieldErrors) => {
    setErrors((current) => {
      const next = { ...current };
      for (const field of stepFields[step]) delete next[field];
      return { ...next, ...nextErrors };
    });
    if (step === 3) setSelectionError(nextErrors.selection ?? "");
  };

  const fieldFocusId = (field: FieldName): string => {
    if (field === "selection") return "selected-itinerary-summary";
    if (field === "name") return "pet-name";
    if (field === "species") return "pet-species-DOG";
    if (field === "size") return "pet-size-SMALL";
    if (field === "departure") return "departure-search";
    if (field === "tripDate") return "trip-date";
    if (field === "startTime") return "start-time";
    if (field === "planning") {
      return planningMode === "duration"
        ? "planning-duration"
        : "planning-stop-count";
    }
    return "category-ATTRACTION";
  };

  const focusError = (field: FieldName) => {
    const step = fieldStep[field];
    pendingFocusRef.current = fieldFocusId(field);
    if (step !== currentStep) {
      setCurrentStep(step);
      return;
    }
    window.requestAnimationFrame(() => {
      document.getElementById(pendingFocusRef.current ?? "")?.focus();
      pendingFocusRef.current = null;
    });
  };

  const moveToStep = (step: 1 | 2 | 3) => {
    pendingFocusRef.current = `planner-step-heading-${step}`;
    setCurrentStep(step);
  };

  const nextStep = (step: 1 | 2) => {
    const nextErrors = validate(step);
    replaceStepErrors(step, nextErrors);
    const firstField = stepFields[step].find((field) => nextErrors[field]);
    if (firstField) {
      focusError(firstField);
      return;
    }
    moveToStep((step + 1) as 2 | 3);
  };

  const resetForm = () => {
    submittingRef.current = false;
    setSubmitting(false);
    setErrors({});
    setSpecies(null);
    setSize(null);
    setSelectedSavedPetId(null);
    setProfile({ ...DEFAULT_PLANNER_PROFILE });
    setPreferences({ ...DEFAULT_PLANNER_PREFERENCES });
    setSearchVersion((value) => value + 1);
    pendingFocusRef.current = "pet-name";
    setCurrentStep(1);
    window.requestAnimationFrame(() =>
      document.getElementById("pet-name")?.focus(),
    );
  };

  const selectedCategorySummary = preferences.preferredCategories
    .map((category) => categoryLabels[category])
    .concat(includeShopping ? ["쇼핑"] : []);

  return (
    <form
      className="planner-form mt-8"
      noValidate
      onCompositionStartCapture={() => {
        composingRef.current = true;
      }}
      onCompositionEndCapture={() => {
        composingRef.current = false;
      }}
      onKeyDownCapture={(event) => {
        if (event.key !== "Enter" || currentStep === 3) return;
        const target = event.target as HTMLElement;
        if (target.id === "departure-search") return;
        if (event.nativeEvent.isComposing || composingRef.current) return;
        event.preventDefault();
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          submittingRef.current ||
          composingRef.current ||
          currentStep !== 3
        ) {
          return;
        }

        const nextErrors = validate("all");
        if (Object.keys(nextErrors).length > 0) {
          setErrors(nextErrors);
          setSelectionError(nextErrors.selection ?? "");
          const firstField = validationOrder.find(
            (field) => nextErrors[field],
          );
          if (firstField) focusError(firstField);
          return;
        }

        const confirmedProfile: PetProfile = {
          ...profile,
          name: profile.name.trim(),
          species: species!,
          size: size!,
        };
        submittingRef.current = true;
        setSubmitting(true);
        setErrors({});
        setSelectionError("");

        const confirmedPreferences = preferences;
        let draft = loadPlanDraft() ?? createPlanDraft(activeRegion.id);
        if (selectedMode && selectedItinerary) {
          draft = updatePlanDraftSelection(draft, {
            ...selectedItinerary,
            districtId: confirmedPreferences.districtCode ?? null,
          });
        }
        draft = updatePlanDraftFromPlanner(draft, {
          petProfile: confirmedProfile,
          preferences: confirmedPreferences,
        });
        draft = {
          ...draft,
          includeVerificationRequired: selectedMode
            ? selectedItinerary?.includeVerificationRequired ?? false
            : includeVerificationRequired,
        };
        if (!savePlanDraft(draft)) {
          submittingRef.current = false;
          setSubmitting(false);
          setSelectionError("여행 계획을 이 브라우저에 저장하지 못했습니다.");
          return;
        }
        confirmPlannerAndRequestGeneration(
          confirmedProfile,
          confirmedPreferences,
        );
        const resultRegion = activeRegion.id;
        router.push(
          selectedMode
            ? `/results?tab=recommendations&region=${resultRegion}&mode=selected`
            : `/results?tab=recommendations&region=${resultRegion}`,
        );
      }}
    >
      <PlannerFormProgress current={currentStep} />

      <div className="planner-workspace">
        <main className="planner-step-column">
          <section
            className="planner-step"
            hidden={currentStep !== 1}
            aria-labelledby="planner-step-heading-1"
          >
            <header className="planner-step-header">
              <p>1 / 3</p>
              <h2 id="planner-step-heading-1" tabIndex={-1}>
                반려동물 정보
              </h2>
              <span>동반 조건을 판단하는 데 필요한 정보만 입력해 주세요.</span>
            </header>

            {initialSavedPets.length > 0 ? (
              <fieldset className="planner-saved-pets">
                <legend>저장된 반려동물 불러오기</legend>
                <div>
                  {initialSavedPets.map((savedPet) => {
                    const selected =
                      selectedSavedPetId === savedPet.profile.id;
                    return (
                      <button
                        key={savedPet.profile.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => applySavedPet(savedPet)}
                        className="planner-saved-pet"
                      >
                        <span>
                          {savedPet.imageUrl ? (
                            <Image
                              src={savedPet.imageUrl}
                              alt=""
                              width={40}
                              height={40}
                              unoptimized
                            />
                          ) : null}
                        </span>
                        <b>{savedPet.profile.name}</b>
                        <small>
                          {speciesLabels[savedPet.profile.species]} ·{" "}
                          {sizeLabels[savedPet.profile.size]}
                        </small>
                        {selected ? (
                          <Check size={16} aria-hidden="true" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : savedPetsUnavailable ? (
              <p className="planner-notice" role="status">
                저장된 반려동물 정보를 불러오지 못했어요. 아래에서 직접
                입력할 수 있습니다.
              </p>
            ) : isSignedIn ? (
              <p className="planner-notice">
                마이페이지에 등록한 반려동물이 아직 없습니다.{" "}
                <Link href="/account/pets/new">반려동물 등록하기</Link>
              </p>
            ) : null}

            <div className="planner-fields-grid">
              <div className="planner-field">
                <label htmlFor="pet-name">반려동물 이름</label>
                <input
                  id="pet-name"
                  value={profile.name}
                  maxLength={30}
                  placeholder="예: 보리"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "pet-name-error" : undefined}
                  onChange={(event) => {
                    updateProfile("name", event.target.value);
                    clearError("name");
                  }}
                />
                {errors.name ? (
                  <p id="pet-name-error" className="planner-error" role="alert">
                    {errors.name}
                  </p>
                ) : null}
              </div>

              <fieldset
                className="planner-field"
                aria-describedby={
                  errors.species ? "pet-species-error" : undefined
                }
              >
                <legend>반려동물 종류</legend>
                <div className="planner-segments planner-segments--three">
                  {speciesOptions.map((option) => (
                    <label
                      key={option.value}
                      data-selected={species === option.value}
                    >
                      <input
                        id={`pet-species-${option.value}`}
                        type="radio"
                        name="species"
                        value={option.value}
                        checked={species === option.value}
                        onChange={() => {
                          setSelectedSavedPetId(null);
                          setSpecies(option.value);
                          clearError("species");
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                {errors.species ? (
                  <p
                    id="pet-species-error"
                    className="planner-error"
                    role="alert"
                  >
                    {errors.species}
                  </p>
                ) : null}
              </fieldset>

              <fieldset
                className="planner-field"
                aria-describedby={errors.size ? "pet-size-error" : undefined}
              >
                <legend>크기</legend>
                <div className="planner-segments planner-segments--three">
                  {sizeOptions.map((option) => (
                    <label
                      key={option.value}
                      data-selected={size === option.value}
                    >
                      <input
                        id={`pet-size-${option.value}`}
                        type="radio"
                        name="size"
                        value={option.value}
                        checked={size === option.value}
                        onChange={() => {
                          setSelectedSavedPetId(null);
                          setSize(option.value);
                          clearError("size");
                        }}
                      />
                      <span>
                        <b>{option.label}</b>
                        <small>{option.note}</small>
                      </span>
                    </label>
                  ))}
                </div>
                {errors.size ? (
                  <p id="pet-size-error" className="planner-error" role="alert">
                    {errors.size}
                  </p>
                ) : null}
              </fieldset>
            </div>

            <div className="planner-divider-grid">
              <fieldset className="planner-field">
                <legend>
                  준비 및 이용 조건 <small>(선택)</small>
                </legend>
                <div className="planner-check-rows">
                  {equipmentOptions.map(({ key, label }) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={profile[key]}
                        onChange={(event) =>
                          updateProfile(key, event.target.checked)
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="planner-field">
                <legend>실내·야외 선호</legend>
                <div className="planner-radio-rows">
                  {environmentOptions.map((option) => (
                    <label key={option.value}>
                      <input
                        type="radio"
                        name="environmentPreference"
                        value={option.value}
                        checked={
                          (preferences.environmentPreference ?? "any") ===
                          option.value
                        }
                        onChange={() =>
                          updatePreferences(
                            "environmentPreference",
                            option.value,
                          )
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                <p className="planner-help">
                  선호만 반영하며 다른 공간의 장소를 제외하지 않아요.
                </p>
              </fieldset>
            </div>
          </section>

          <section
            className="planner-step"
            hidden={currentStep !== 2}
            aria-labelledby="planner-step-heading-2"
          >
            <header className="planner-step-header">
              <p>2 / 3</p>
              <h2 id="planner-step-heading-2" tabIndex={-1}>
                출발지와 시간
              </h2>
              <span>검색이나 지도에서 실제 출발 좌표를 확정해 주세요.</span>
            </header>

            <div className="planner-map-workarea">
              <div>
                <DepartureSearch
                  key={searchVersion}
                  value={preferences.departure}
                  invalid={Boolean(errors.departure)}
                  errorId={errors.departure ? "departure-error" : undefined}
                  onChange={(departure) => {
                    updatePreferences("departure", departure);
                    clearError("departure");
                  }}
                />
                {errors.departure ? (
                  <p
                    id="departure-error"
                    className="planner-error"
                    role="alert"
                  >
                    {errors.departure}
                  </p>
                ) : null}
              </div>
              <DepartureMapPicker
                key={activeRegion.id}
                regionId={activeRegion.id}
                value={preferences.departure}
                onChange={(departure) => {
                  updatePreferences("departure", departure);
                  clearError("departure");
                  setSearchVersion((value) => value + 1);
                }}
              />
            </div>

            <div
              className={
                selectedMode
                  ? "planner-time-grid planner-time-grid--three"
                  : "planner-time-grid"
              }
            >
              <div className="planner-field">
                <label htmlFor="region">여행 지역</label>
                <select
                  id="region"
                  value={activeRegion.providerCodes.korPetTourService2.legalDongRegionCode}
                  disabled={selectedMode || AUTOMATIC_REGIONS.length <= 1}
                  onChange={(event) => {
                    const region = AUTOMATIC_REGIONS.find(({ providerCodes }) =>
                      providerCodes.korPetTourService2.legalDongRegionCode === event.target.value);
                    if (!region) return;
                    setPreferences((current) => ({
                      ...current,
                      regionCode: region.providerCodes.korPetTourService2.legalDongRegionCode,
                      regionName: region.displayName,
                      districtCode: undefined,
                      districtName: undefined,
                      departure: undefined,
                    }));
                  }}
                >
                  {(selectedMode ? [activeRegion] : AUTOMATIC_REGIONS).map((region) => (
                    <option
                      key={region.id}
                      value={region.providerCodes.korPetTourService2.legalDongRegionCode}
                    >
                      {region.displayName}
                    </option>
                  ))}
                </select>
              </div>
              {!selectedMode ? (
                <div className="planner-field">
                  <label htmlFor="district">세부 지역</label>
                  <select
                    id="district"
                    value={preferences.districtCode ?? "all"}
                    onChange={(event) => {
                      const district = activeDistricts.find(
                        ({ legalDongDistrictCode }) =>
                          legalDongDistrictCode === event.target.value,
                      );
                      setPreferences((current) => ({
                        ...current,
                        regionCode: activeRegion.providerCodes.korPetTourService2.legalDongRegionCode,
                        regionName: activeRegion.displayName,
                        districtCode: district?.legalDongDistrictCode,
                        districtName: district?.name,
                      }));
                    }}
                  >
                    <option value="all">{activeRegion.displayName} 전체</option>
                    {activeDistricts.map((district) => (
                      <option
                        key={district.legalDongDistrictCode}
                        value={district.legalDongDistrictCode}
                      >
                        {district.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="planner-field">
                <label htmlFor="trip-date">여행 날짜</label>
                <input
                  id="trip-date"
                  type="date"
                  value={preferences.tripDate}
                  aria-invalid={Boolean(errors.tripDate)}
                  aria-describedby={
                    errors.tripDate ? "trip-date-error" : undefined
                  }
                  onChange={(event) => {
                    updatePreferences("tripDate", event.target.value);
                    clearError("tripDate");
                  }}
                />
                {errors.tripDate ? (
                  <p
                    id="trip-date-error"
                    className="planner-error"
                    role="alert"
                  >
                    {errors.tripDate}
                  </p>
                ) : null}
              </div>
              <div className="planner-field">
                <label htmlFor="start-time">시작 시간</label>
                <input
                  id="start-time"
                  type="time"
                  value={preferences.startTime}
                  aria-invalid={Boolean(errors.startTime)}
                  aria-describedby={
                    errors.startTime ? "start-time-error" : undefined
                  }
                  onChange={(event) => {
                    updatePreferences("startTime", event.target.value);
                    clearError("startTime");
                    clearError("planning");
                  }}
                />
                {errors.startTime ? (
                  <p
                    id="start-time-error"
                    className="planner-error"
                    role="alert"
                  >
                    {errors.startTime}
                  </p>
                ) : null}
              </div>
            </div>

            <fieldset className="planner-field planner-block">
              <legend>여행 형태</legend>
              <div className="planner-trip-types">
                {tripTypeOptions.map((option) => (
                  <label
                    key={option.value}
                    data-selected={preferences.tripType === option.value}
                  >
                    <input
                      type="radio"
                      name="tripType"
                      value={option.value}
                      checked={preferences.tripType === option.value}
                      onChange={() =>
                        updatePreferences("tripType", option.value)
                      }
                    />
                    <span>
                      <b>{option.label}</b>
                      <small>{option.note}</small>
                    </span>
                  </label>
                ))}
              </div>
              <label className="planner-inline-check">
                <input
                  type="checkbox"
                  checked={preferences.roundTrip ?? false}
                  onChange={(event) =>
                    updatePreferences("roundTrip", event.target.checked)
                  }
                />
                <span>마지막 장소 방문 후 출발지로 돌아오기</span>
              </label>
            </fieldset>
          </section>

          <section
            className="planner-step"
            hidden={currentStep !== 3}
            aria-labelledby="planner-step-heading-3"
          >
            <header className="planner-step-header">
              <p>3 / 3</p>
              <h2 id="planner-step-heading-3" tabIndex={-1}>
                원하는 하루
              </h2>
              <span>하루의 길이와 방문하고 싶은 장소를 정해 주세요.</span>
            </header>

            {selectedMode ? (
              <section
                id="selected-itinerary-summary"
                tabIndex={-1}
                className="planner-selected-summary"
                aria-labelledby="selected-itinerary-summary-heading"
              >
                <div>
                  <h3 id="selected-itinerary-summary-heading">
                    선택한 장소 {selectedItinerary?.places.length ?? 0}곳
                  </h3>
                  <Link href={`/results?tab=catalog&region=${activeRegion.id}&mode=select`}>
                    장소 다시 선택
                  </Link>
                </div>
                {selectedItinerary?.places.length ? (
                  <ul aria-label="고정할 선택 장소">
                    {selectedItinerary.places.map((place) => (
                      <li key={place.id}>
                        <SelectedPlaceImage
                          name={place.name}
                          imageUrl={place.imageUrl}
                        />
                        <span>
                          <small>
                            <LockKeyhole size={13} aria-hidden="true" /> 일정에
                            고정
                          </small>
                          <b>{place.name}</b>
                          <em>
                            {place.sourceLabel} · {place.publicLabel}
                          </em>
                          {selectedItineraryNeedsWarning(place) ? (
                            <em className="planner-selected-summary__warning">
                              동반 가능 여부 확인 필요 · 사용자가 선택한 장소이며 공식 확인 전입니다
                            </em>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="planner-notice">
                    선택한 장소를 불러오지 못했습니다.
                  </p>
                )}
                <label className="planner-inline-check">
                  <input
                    type="checkbox"
                    checked={selectedItinerary?.autoFill ?? true}
                    disabled={!selectedItinerary || !automaticFillSupported}
                    onChange={(event) => {
                      if (!selectedItinerary) return;
                      const next = {
                        ...selectedItinerary,
                        autoFill: automaticFillSupported && event.target.checked,
                      };
                      setSelectedItinerary(next);
                      setSelectionError("");
                      clearError("selection");
                      if (!saveSelectedItinerary(next)) {
                        setSelectionError(
                          "자동 채우기 설정을 저장하지 못했습니다.",
                        );
                      }
                    }}
                  />
                  <span>
                    부족한 장소는 WEEKENDOG가 추천
                  </span>
                </label>
                {!automaticFillSupported ? (
                  <p className="planner-notice" role="status">
                    {activeRegion.displayName}에서는 직접 고른 장소의 순서와 실제 이동 경로를 만들 수 있으며, 자동 채우기는 아직 지원하지 않습니다.
                  </p>
                ) : null}
                <label className="planner-inline-check">
                  <input
                    type="checkbox"
                    checked={selectedItinerary?.includeVerificationRequired ?? false}
                    disabled={!selectedItinerary || !automaticFillSupported}
                    onChange={(event) => {
                      if (!selectedItinerary) return;
                      const next = {
                        ...selectedItinerary,
                        includeVerificationRequired: event.target.checked,
                      };
                      setSelectedItinerary(next);
                      if (!saveSelectedItinerary(next)) {
                        setSelectionError("후보 확인 범위 설정을 저장하지 못했습니다.");
                      } else {
                        setSelectionError("");
                      }
                    }}
                  />
                  <span>확인 필요한 장소도 후보에 포함</span>
                </label>
                {selectedItinerary?.places.some(selectedItineraryNeedsWarning) ? (
                  <label className="planner-inline-check">
                    <input
                      type="checkbox"
                      checked={selectedItinerary.places
                        .filter(selectedItineraryNeedsWarning)
                        .every(({ id }) => selectedItinerary
                          .acknowledgedVerificationRequiredPlaceIds.includes(id))}
                      onChange={(event) => {
                        let next = selectedItinerary;
                        for (const place of selectedItinerary.places.filter(selectedItineraryNeedsWarning)) {
                          next = setSelectedItineraryVerificationAcknowledged(
                            next,
                            place.id,
                            event.target.checked,
                          );
                        }
                        setSelectedItinerary(next);
                        clearError("selection");
                        if (!saveSelectedItinerary(next)) {
                          setSelectionError("확인 동의를 저장하지 못했습니다.");
                        } else {
                          setSelectionError("");
                        }
                      }}
                    />
                    <span>
                      확인 필요 장소의 반려동물 동반 조건과 운영시간을 방문 전에 직접 확인하겠습니다
                    </span>
                  </label>
                ) : null}
                {selectionError ? (
                  <p className="planner-error" role="alert">
                    {selectionError}
                  </p>
                ) : null}
              </section>
            ) : null}

            {!selectedMode ? (
              <label className="planner-inline-check planner-block">
                <input
                  type="checkbox"
                  checked={includeVerificationRequired}
                  onChange={(event) =>
                    setIncludeVerificationRequired(event.target.checked)}
                />
                <span>확인 필요한 장소도 후보에 포함</span>
              </label>
            ) : null}

            <fieldset
              className="planner-field"
              aria-describedby={errors.planning ? "planning-error" : undefined}
            >
              <legend>일정 기준</legend>
              <div className="planner-segments planner-segments--two">
                <label data-selected={planningMode === "stop_count"}>
                  <input
                    type="radio"
                    name="planningMode"
                    checked={planningMode === "stop_count"}
                    onChange={() => {
                      updatePreferences("planningMode", "stop_count");
                      clearError("planning");
                    }}
                  />
                  <span>방문 장소 수 기준</span>
                </label>
                <label data-selected={planningMode === "duration"}>
                  <input
                    type="radio"
                    name="planningMode"
                    checked={planningMode === "duration"}
                    onChange={() => {
                      updatePreferences("planningMode", "duration");
                      clearError("planning");
                    }}
                  />
                  <span>전체 일정 시간 기준</span>
                </label>
              </div>
              {planningMode === "stop_count" ? (
                <div className="planner-number-field">
                  <label htmlFor="planning-stop-count">방문 장소 수</label>
                  <input
                    id="planning-stop-count"
                    type="number"
                    min={1}
                    max={5}
                    step={1}
                    value={desiredStopCount}
                    onChange={(event) => {
                      updatePreferences(
                        "desiredStopCount",
                        Number(event.target.value),
                      );
                      clearError("planning");
                    }}
                  />
                  <span>1–5곳</span>
                </div>
              ) : (
                <div className="planner-number-field">
                  <label htmlFor="planning-duration">전체 일정 시간</label>
                  <input
                    id="planning-duration"
                    type="number"
                    min={120}
                    max={600}
                    step={30}
                    value={desiredDurationMinutes}
                    onChange={(event) => {
                      updatePreferences(
                        "desiredDurationMinutes",
                        Number(event.target.value),
                      );
                      clearError("planning");
                    }}
                  />
                  <span>분 · 120–600</span>
                </div>
              )}
              {errors.planning ? (
                <p id="planning-error" className="planner-error" role="alert">
                  {errors.planning}
                </p>
              ) : null}
            </fieldset>

            <fieldset className="planner-field planner-block">
              <legend>일정 페이스</legend>
              <p className="planner-help">
                페이스를 바꾸면 기존과 동일하게 방문 장소 수 기준으로
                변환됩니다.
              </p>
              <div className="planner-pace-options">
                {TRIP_PACE_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    data-selected={preferences.tripPace === option.id}
                  >
                    <input
                      type="radio"
                      name="tripPace"
                      value={option.id}
                      checked={preferences.tripPace === option.id}
                      onChange={() => {
                        const planning = getTripPacePlanning(option.id);
                        setPreferences((current) => ({
                          ...current,
                          tripPace: option.id,
                          planningMode: "stop_count",
                          desiredStopCount: planning.desiredStopCount,
                        }));
                        clearError("planning");
                      }}
                    />
                    <span>
                      <b>{option.label}</b>
                      <small>
                        {option.rangeLabel} · {option.description}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {!selectedMode ? (
              <fieldset
                className="planner-field planner-block"
                aria-describedby={
                  errors.categories ? "categories-error" : undefined
                }
              >
                <legend>
                  방문하고 싶은 장소 <small>(복수 선택)</small>
                </legend>
                <div className="planner-category-grid">
                  {categoryOptions.map((option) => (
                    <label
                      key={option.value}
                      data-selected={preferences.preferredCategories.includes(
                        option.value,
                      )}
                    >
                      <input
                        id={`category-${option.value}`}
                        type="checkbox"
                        checked={preferences.preferredCategories.includes(
                          option.value,
                        )}
                        onChange={() => toggleCategory(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                  <label data-selected={includeShopping}>
                    <input
                      type="checkbox"
                      checked={includeShopping}
                      onChange={(event) => {
                        updatePreferences(
                          "includeShopping",
                          event.target.checked,
                        );
                        clearError("categories");
                      }}
                    />
                    <span>쇼핑</span>
                  </label>
                </div>
                {errors.categories ? (
                  <p
                    id="categories-error"
                    className="planner-error"
                    role="alert"
                  >
                    {errors.categories}
                  </p>
                ) : null}
              </fieldset>
            ) : null}
          </section>

          <div className="planner-step-actions">
            <button
              type="button"
              onClick={resetForm}
              className="planner-reset-action"
            >
              <RotateCcw size={16} aria-hidden="true" />
              초기화
            </button>
            <div>
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    moveToStep((currentStep - 1) as 1 | 2)
                  }
                  className="planner-previous-action"
                >
                  <ArrowLeft size={17} aria-hidden="true" />
                  이전 단계
                </button>
              ) : null}
              {currentStep < 3 ? (
                <Button
                  type="button"
                  variant="brand"
                  onClick={(event) => {
                    event.preventDefault();
                    nextStep(currentStep as 1 | 2);
                  }}
                >
                  {currentStep === 1
                    ? "출발지와 시간 입력"
                    : "원하는 하루 입력"}
                  <ArrowRight size={17} aria-hidden="true" />
                </Button>
              ) : (
                <Button type="submit" variant="brand" disabled={submitting}>
                  {submitting
                    ? "일정 준비 중"
                    : selectedMode
                      ? "선택한 장소로 일정 만들기"
                      : "여행 추천 받기"}
                  <ArrowRight size={17} aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </main>

        <aside className="planner-live-summary" aria-labelledby="planner-summary-heading">
          <h2 id="planner-summary-heading">입력한 여행 조건</h2>
          <dl>
            <div>
              <dt>반려동물</dt>
              <dd>
                {profile.name.trim() || "이름 입력 전"}
                {species ? ` · ${speciesLabels[species]}` : ""}
                {size ? ` · ${sizeLabels[size]}` : ""}
              </dd>
            </div>
            <div>
              <dt>출발·시간</dt>
              <dd>
                {preferences.departure?.label ?? "출발지 선택 전"}
                {preferences.tripDate
                  ? ` · ${preferences.tripDate}`
                  : ""}
                {preferences.startTime
                  ? ` ${preferences.startTime}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>여행 형태</dt>
              <dd>
                {preferences.tripType === "DAY_TRIP"
                  ? "당일치기"
                  : "1박 여행"}
                {preferences.roundTrip ? " · 왕복" : ""}
              </dd>
            </div>
            <div>
              <dt>일정 기준</dt>
              <dd>
                {planningMode === "duration"
                  ? `전체 ${desiredDurationMinutes}분`
                  : `방문 ${desiredStopCount}곳`}
                {" · "}
                {
                  TRIP_PACE_OPTIONS.find(
                    ({ id }) => id === preferences.tripPace,
                  )?.label
                }
              </dd>
            </div>
            <div>
              <dt>장소 유형</dt>
              <dd>
                {selectedMode
                  ? `직접 고른 장소 ${selectedItinerary?.places.length ?? 0}곳`
                  : selectedCategorySummary.length > 0
                    ? selectedCategorySummary.join(" · ")
                    : "선택 전"}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </form>
  );
}
