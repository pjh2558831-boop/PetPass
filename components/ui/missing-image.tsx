import { ImageOff } from "lucide-react";

export function MissingImage({ label }: { label: string }) {
  return (
    <div
      className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-[#cbd8d0] bg-[#eef3ef] text-[#6d7d74]"
      role="img"
      aria-label={`${label} 이미지 없음`}
    >
      <div className="text-center">
        <ImageOff className="mx-auto mb-2" size={24} aria-hidden="true" />
        <p className="text-xs font-semibold">제공된 이미지가 없어요</p>
      </div>
    </div>
  );
}
