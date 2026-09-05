"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Cat,
  Check,
  Dog,
  PawPrint,
} from "lucide-react";
import { usePlannerState } from "@/components/planner/planner-state";
import { Button } from "@/components/ui/button";
import type { PetProfile, PetSize, PetSpecies } from "@/types/pet";

const speciesOptions: Array<{
  value: PetSpecies;
  label: string;
  icon: typeof Dog;
}> = [
  { value: "DOG", label: "강아지", icon: Dog },
  { value: "CAT", label: "고양이", icon: Cat },
  { value: "OTHER", label: "기타 반려동물", icon: PawPrint },
];

const sizeOptions: Array<{ value: PetSize; label: string; note: string }> = [
  { value: "SMALL", label: "소형", note: "약 10kg 미만" },
  { value: "MEDIUM", label: "중형", note: "약 10–25kg" },
  { value: "LARGE", label: "대형", note: "약 25kg 이상" },
];


const speciesLabels: Record<PetSpecies, string> = {
  DOG: "강아지",
  CAT: "고양이",
  OTHER: "기타 반려동물",
};

const sizeLabels: Record<PetSize, string> = {
  SMALL: "소형",
  MEDIUM: "중형",
  LARGE: "대형",
};

export function PetProfileForm() {
  const router = useRouter();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { profile, setProfile, confirmProfile } = usePlannerState();
  const [nameError, setNameError] = useState("");

  const update = <K extends keyof PetProfile>(key: K, value: PetProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };


  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <form
        className="surface-panel p-5 sm:p-7 lg:p-8"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedName = profile.name.trim();
          if (!trimmedName || trimmedName.length > 30) {
            setNameError("반려동물 이름을 1자 이상 30자 이하로 입력해 주세요.");
            nameInputRef.current?.focus();
            return;
          }
          if (trimmedName !== profile.name) update("name", trimmedName);
          setNameError("");
          confirmProfile();
          router.push("/planner/trip");
        }}
      >
        <div className="flex items-center gap-3 border-b border-[var(--line)] pb-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
            <PawPrint size={21} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-black">반려동물 프로필</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              현재 지원되는 조건만 정확하게 입력해요.
            </p>
          </div>
        </div>

        <div className="mt-7">
          <label htmlFor="pet-name" className="mb-2 block text-sm font-extrabold">
            반려동물 이름
          </label>
          <input
            ref={nameInputRef}
            id="pet-name"
            value={profile.name}
            maxLength={30}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "pet-name-error" : "pet-name-help"}
            onChange={(event) => {
              update("name", event.target.value);
              if (nameError) setNameError("");
            }}
            className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 text-base font-semibold shadow-sm placeholder:text-[#9aa49f]"
            placeholder="이름을 입력하세요"
          />
          <p id="pet-name-help" className="mt-2 text-xs text-[var(--muted)]">
            추천 결과와 일정에서 반려동물을 구분할 때 사용해요.
          </p>
          {nameError ? (
            <p id="pet-name-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">
              {nameError}
            </p>
          ) : null}
        </div>

        <fieldset className="mt-8 border-t border-[var(--line)] pt-7">
          <legend className="text-sm font-extrabold">어떤 반려동물과 여행하나요?</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {speciesOptions.map((option) => {
              const selected = profile.species === option.value;
              const Icon = option.icon;
              return (
                <label
                  key={option.value}
                  className={`relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border p-3 text-center text-sm font-extrabold transition-colors focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[#3d8b6859] ${
                    selected
                      ? "border-[var(--mint-500)] bg-[var(--brand-soft)] text-[var(--brand)]"
                      : "border-[var(--line)] bg-white text-[#607168] hover:border-[#91ae9e]"
                  }`}
                >
                  <input
                    type="radio"
                    name="species"
                    className="sr-only"
                    value={option.value}
                    checked={selected}
                    onChange={() => update("species", option.value)}
                  />
                  {selected ? (
                    <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-[var(--brand)] text-white">
                      <Check size={12} aria-hidden="true" />
                    </span>
                  ) : null}
                  <Icon size={23} aria-hidden="true" />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-8 border-t border-[var(--line)] pt-7">
          <legend className="text-sm font-extrabold">크기를 알려주세요</legend>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            시설마다 기준이 다르므로 실제 원문의 무게·크기 표현을 우선합니다.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {sizeOptions.map((option) => {
              const selected = profile.size === option.value;
              return (
                <label
                  key={option.value}
                  className={`relative min-h-20 cursor-pointer rounded-[var(--radius-card)] border p-4 transition-colors focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[#3d8b6859] ${
                    selected
                      ? "border-[var(--mint-500)] bg-[var(--brand-soft)]"
                      : "border-[var(--line)] bg-white hover:border-[#91ae9e]"
                  }`}
                >
                  <input
                    type="radio"
                    name="size"
                    className="sr-only"
                    value={option.value}
                    checked={selected}
                    onChange={() => update("size", option.value)}
                  />
                  {selected ? (
                    <Check className="absolute right-3 top-3 text-[var(--brand)]" size={16} aria-hidden="true" />
                  ) : null}
                  <span className="block text-sm font-extrabold">{option.label}</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">{option.note}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-8 flex justify-end">
          <Button type="submit" variant="brand" className="w-full sm:w-auto">
            여행 조건 정하기 <ArrowRight size={17} aria-hidden="true" />
          </Button>
        </div>
      </form>

      <aside
        className="surface-panel bg-[var(--surface-sage)] p-5 sm:p-6 lg:sticky lg:top-24"
        aria-labelledby="pet-summary-heading"
      >
        <p className="eyebrow">현재 선택</p>
        <h2 id="pet-summary-heading" className="mt-2 text-xl font-black">
          입력한 정보 요약
        </h2>
        <div className="mt-5 flex items-center gap-3 rounded-[var(--radius-card)] border border-white/80 bg-white/75 p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
            <PawPrint size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-black">{profile.name.trim() || "이름 미입력"}</p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
              {speciesLabels[profile.species]} · {sizeLabels[profile.size]}
            </p>
          </div>
        </div>

        <p className="mt-6 rounded-[var(--radius-control)] border border-[#d9c5aa] bg-[var(--orange-soft)] p-4 text-xs font-semibold leading-5 text-[#6f543f]">
          이 값은 시설이 공개한 반려동물 동반 원문과 비교하는 조건으로만 사용합니다.
        </p>
      </aside>
    </div>
  );
}
