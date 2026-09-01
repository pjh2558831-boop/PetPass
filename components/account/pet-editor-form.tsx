import Image from "next/image";
import Link from "next/link";
import {
  Cat,
  Circle,
  Dog,
  Link2,
  Package,
  PawPrint,
  ShieldAlert,
  Trees,
  Upload,
  type LucideIcon,
} from "lucide-react";
import type { SavedPetProfile } from "@/lib/auth/pet-profile";
import { FormErrorMessage } from "@/components/ui/form-error-message";

type PetEditorFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  pet?: SavedPetProfile;
  imageUrl?: string | null;
  error?: string;
  submitLabel: string;
};

const optionClass =
  "flex min-h-12 items-center gap-2.5 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-bold has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-soft)]";

type ChoiceOption = {
  value: string;
  label: string;
  Icon: LucideIcon;
  iconClassName?: string;
};

const speciesOptions: readonly ChoiceOption[] = [
  { value: "DOG", label: "강아지", Icon: Dog },
  { value: "CAT", label: "고양이", Icon: Cat },
  { value: "OTHER", label: "기타", Icon: PawPrint },
];

const sizeOptions: readonly ChoiceOption[] = [
  { value: "SMALL", label: "소형", Icon: Circle, iconClassName: "size-3" },
  { value: "MEDIUM", label: "중형", Icon: Circle, iconClassName: "size-4" },
  { value: "LARGE", label: "대형", Icon: Circle, iconClassName: "size-5" },
];

export function PetEditorForm({ action, pet, imageUrl, error, submitLabel }: PetEditorFormProps) {
  return (
    <form action={action} className="account-form-document mx-auto max-w-2xl">
      <label className="block text-sm font-extrabold">
        이름
        <input
          required
          name="name"
          defaultValue={pet?.name ?? ""}
          maxLength={30}
          className="mt-2 min-h-12 w-full rounded-lg border border-[var(--line)] bg-white px-4"
        />
      </label>

      <fieldset className="mt-6">
        <legend className="text-sm font-extrabold">반려동물 종류</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {speciesOptions.map(({ value, label, Icon }) => (
            <label key={value} className={optionClass}>
              <input type="radio" name="species" value={value} required defaultChecked={(pet?.species ?? "DOG") === value} />
              <Icon size={18} strokeWidth={1.9} className="shrink-0 text-[var(--brand)]" aria-hidden="true" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="text-sm font-extrabold">크기</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {sizeOptions.map(({ value, label, Icon, iconClassName }) => (
            <label key={value} className={optionClass}>
              <input type="radio" name="size" value={value} required defaultChecked={(pet?.size ?? "SMALL") === value} />
              <span className="grid size-5 shrink-0 place-items-center text-[var(--brand)]" aria-hidden="true">
                <Icon strokeWidth={2} className={iconClassName} />
              </span>
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="text-sm font-extrabold">준비 및 이용 조건</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {[
            { value: "hasCarrier", label: "이동장 사용 가능", checked: pet?.hasCarrier, Icon: Package },
            { value: "hasLeash", label: "목줄 착용 가능", checked: pet?.hasLeash, Icon: Link2 },
            { value: "hasMuzzle", label: "입마개 착용 가능", checked: pet?.hasMuzzle, Icon: ShieldAlert },
            { value: "acceptsOutdoorOnly", label: "야외 공간만 이용 가능", checked: pet?.acceptsOutdoorOnly, Icon: Trees },
          ].map(({ value, label, checked, Icon }) => (
            <label key={value} className={optionClass}>
              <input type="checkbox" name={value} defaultChecked={Boolean(checked)} />
              <Icon size={18} strokeWidth={1.9} className="shrink-0 text-[var(--brand)]" aria-hidden="true" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6">
        <p className="text-sm font-extrabold">반려동물 사진</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
          {imageUrl ? <Image src={imageUrl} alt={`${pet?.name ?? "반려동물"} 사진`} width={80} height={80} unoptimized className="size-20 shrink-0 rounded-lg object-cover" /> : null}
          <div>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[var(--brand)] transition-colors hover:bg-[var(--brand-soft)]">
              <Upload size={17} aria-hidden="true" />
              사진 추가
              <input name="image" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" />
            </label>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">PNG, JPEG, WebP · 최대 2MB</p>
            {imageUrl ? (
              <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-bold text-[#5d6963]">
                <input type="checkbox" name="removeImage" /> 기존 사진 삭제
              </label>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <FormErrorMessage id="pet-editor-form-error" className="mt-5 text-sm font-bold text-red-700">{error}</FormErrorMessage> : null}
      <div className="mt-7 flex flex-wrap gap-3">
        <button type="submit" className="min-h-12 rounded-lg bg-[var(--brand)] px-5 text-sm font-extrabold text-white">
          {submitLabel}
        </button>
        <Link href="/account" className="inline-flex min-h-12 items-center rounded-lg border border-[var(--line)] bg-white px-5 text-sm font-extrabold">
          취소
        </Link>
      </div>
    </form>
  );
}
