import { ImageOff } from "lucide-react";

export function MissingImage({
  label,
  mode = "missing",
  className = "",
}: {
  label: string;
  mode?: "missing" | "load-error";
  className?: string;
}) {
  const loadError = mode === "load-error";
  return (
    <div
      className={`flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-[#cbd8d0] bg-[#eef3ef] text-[#6d7d74] ${className}`}
      role="img"
      aria-label={`${label} 이미지 ${loadError ? "불러오기 실패" : "없음"}`}
    >
      <div className="text-center">
        <ImageOff className="mx-auto mb-2" size={24} aria-hidden="true" />
        <p className="text-xs font-semibold">
          {loadError ? "이미지를 불러올 수 없어요" : "제공된 이미지가 없어요"}
        </p>
      </div>
    </div>
  );
}
