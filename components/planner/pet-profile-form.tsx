"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Backpack, Dog, House, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadPetProfile, savePetProfile } from "@/lib/storage/profile-storage";
import type { PetProfile, PetSize, PetSpecies } from "@/types/pet";

const defaultProfile: PetProfile = {
  id: "latest-pet",
  name: "보리",
  species: "DOG",
  size: "SMALL",
  hasCarrier: true,
  hasLeash: true,
  hasMuzzle: false,
  acceptsOutdoorOnly: true,
};

const speciesOptions: Array<{ value: PetSpecies; label: string }> = [
  { value: "DOG", label: "강아지" },
  { value: "CAT", label: "고양이" },
  { value: "OTHER", label: "기타 반려동물" },
];

const sizeOptions: Array<{ value: PetSize; label: string; note: string }> = [
  { value: "SMALL", label: "소형", note: "약 10kg 미만" },
  { value: "MEDIUM", label: "중형", note: "약 10–25kg" },
  { value: "LARGE", label: "대형", note: "약 25kg 이상" },
];

export function PetProfileForm() {
  const router = useRouter();
  const [profile, setProfile] = useState<PetProfile>(defaultProfile);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    const saved = loadPetProfile();
    // Hydrate validated client-only storage after the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setProfile(saved);
  }, []);

  const update = <K extends keyof PetProfile>(key: K, value: PetProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  return (
    <form
      className="space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        if (!savePetProfile(profile)) {
          setStorageError("이 브라우저에 프로필을 저장하지 못했어요. 설정을 확인해 주세요.");
          return;
        }
        router.push("/planner/trip");
      }}
    >
      <div>
        <label htmlFor="pet-name" className="mb-2 block text-sm font-extrabold">
          반려동물 이름
        </label>
        <input
          id="pet-name"
          value={profile.name}
          required
          maxLength={30}
          onChange={(event) => update("name", event.target.value)}
          className="min-h-12 w-full rounded-2xl border border-[#cfd9d3] bg-white px-4 text-base font-semibold shadow-sm placeholder:text-[#9aa49f]"
          placeholder="이름을 입력하세요"
        />
      </div>

      <fieldset>
        <legend className="text-sm font-extrabold">어떤 반려동물과 여행하나요?</legend>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {speciesOptions.map((option) => (
            <label
              key={option.value}
              className={`flex min-h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-center text-sm font-bold transition ${
                profile.species === option.value
                  ? "border-[#3d8b68] bg-[#edf8f2] text-[#236148]"
                  : "border-[#d6ded9] bg-white text-[#607168] hover:border-[#91ae9e]"
              }`}
            >
              <input
                type="radio"
                name="species"
                className="sr-only"
                value={option.value}
                checked={profile.species === option.value}
                onChange={() => update("species", option.value)}
              />
              <Dog size={20} aria-hidden="true" />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-extrabold">크기를 알려주세요</legend>
        <p className="mt-1 text-xs leading-5 text-[#748078]">
          시설마다 기준이 다르므로 실제 규정의 무게·크기 표현을 우선해요.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {sizeOptions.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-2xl border p-4 transition ${
                profile.size === option.value
                  ? "border-[#3d8b68] bg-[#edf8f2]"
                  : "border-[#d6ded9] bg-white hover:border-[#91ae9e]"
              }`}
            >
              <input
                type="radio"
                name="size"
                className="sr-only"
                value={option.value}
                checked={profile.size === option.value}
                onChange={() => update("size", option.value)}
              />
              <span className="block text-sm font-extrabold">{option.label}</span>
              <span className="mt-1 block text-xs text-[#748078]">{option.note}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-extrabold">지금 준비할 수 있는 물품</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            { key: "hasCarrier" as const, label: "이동장", icon: Backpack },
            { key: "hasLeash" as const, label: "목줄", icon: ShieldCheck },
            { key: "hasMuzzle" as const, label: "입마개", icon: Dog },
          ].map(({ key, label, icon: Icon }) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#d6ded9] bg-white p-4 text-sm font-bold hover:border-[#91ae9e]"
            >
              <input
                type="checkbox"
                checked={profile[key]}
                onChange={(event) => update(key, event.target.checked)}
                className="size-4 accent-[#236148]"
              />
              <Icon size={18} className="text-[#3d8b68]" aria-hidden="true" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#d6ded9] bg-white p-4">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-[#236148]"
          checked={profile.acceptsOutdoorOnly}
          onChange={(event) => update("acceptsOutdoorOnly", event.target.checked)}
        />
        <House size={19} className="mt-0.5 shrink-0 text-[#3d8b68]" aria-hidden="true" />
        <span>
          <span className="block text-sm font-extrabold">야외 공간만 이용해도 괜찮아요</span>
          <span className="mt-1 block text-xs leading-5 text-[#748078]">
            선택하지 않으면 실내 이용이 필요한 것으로 판단해요.
          </span>
        </span>
      </label>

      {storageError ? (
        <p className="rounded-xl bg-[#fceeee] p-3 text-sm font-semibold text-[#8d3838]" role="alert">
          {storageError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit">여행 조건 정하기</Button>
      </div>
    </form>
  );
}
