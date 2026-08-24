import Image from "next/image";
import Link from "next/link";
import type { SavedPetProfile } from "@/lib/auth/pet-profile";

type PetEditorFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  pet?: SavedPetProfile;
  imageUrl?: string | null;
  error?: string;
  submitLabel: string;
};

const optionClass =
  "flex min-h-12 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-bold has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-soft)]";

export function PetEditorForm({ action, pet, imageUrl, error, submitLabel }: PetEditorFormProps) {
  return (
    <form action={action} className="surface-panel mx-auto max-w-2xl p-6 sm:p-8">
      <label className="block text-sm font-extrabold">
        이름
        <input
          required
          name="name"
          defaultValue={pet?.name ?? ""}
          maxLength={30}
          className="mt-2 min-h-12 w-full rounded-xl border border-[var(--line)] bg-white px-4"
        />
      </label>

      <fieldset className="mt-6">
        <legend className="text-sm font-extrabold">반려동물 종류</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {[["DOG", "강아지"], ["CAT", "고양이"], ["OTHER", "기타"]].map(([value, label]) => (
            <label key={value} className={optionClass}>
              <input type="radio" name="species" value={value} required defaultChecked={(pet?.species ?? "DOG") === value} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="text-sm font-extrabold">크기</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {[["SMALL", "소형"], ["MEDIUM", "중형"], ["LARGE", "대형"]].map(([value, label]) => (
            <label key={value} className={optionClass}>
              <input type="radio" name="size" value={value} required defaultChecked={(pet?.size ?? "SMALL") === value} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="text-sm font-extrabold">준비 및 이용 조건</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {[
            ["hasCarrier", "이동장 사용 가능", pet?.hasCarrier],
            ["hasLeash", "목줄 착용 가능", pet?.hasLeash],
            ["hasMuzzle", "입마개 착용 가능", pet?.hasMuzzle],
            ["acceptsOutdoorOnly", "야외 공간만 이용 가능", pet?.acceptsOutdoorOnly],
          ].map(([name, label, checked]) => (
            <label key={String(name)} className={optionClass}>
              <input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} />
              {String(label)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6">
        <p className="text-sm font-extrabold">반려동물 사진</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--surface-sage)] text-sm font-bold text-[var(--muted)]">
            {imageUrl ? (
              <Image src={imageUrl} alt={`${pet?.name ?? "반려동물"} 사진`} width={112} height={112} unoptimized className="size-full object-cover" />
            ) : (
              "사진 없음"
            )}
          </div>
          <div>
            <input name="image" type="file" accept="image/png,image/jpeg,image/webp" className="block max-w-full text-sm" />
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">PNG, JPEG, WebP · 최대 2MB</p>
            {imageUrl ? (
              <label className="mt-2 flex items-center gap-2 text-sm font-bold text-[#5d6963]">
                <input type="checkbox" name="removeImage" /> 기존 사진 삭제
              </label>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <p role="alert" className="mt-5 text-sm font-bold text-red-700">{error}</p> : null}
      <div className="mt-7 flex flex-wrap gap-3">
        <button type="submit" className="min-h-12 rounded-xl bg-[var(--brand)] px-5 text-sm font-extrabold text-white">
          {submitLabel}
        </button>
        <Link href="/account" className="inline-flex min-h-12 items-center rounded-xl border border-[var(--line)] bg-white px-5 text-sm font-extrabold">
          취소
        </Link>
      </div>
    </form>
  );
}
