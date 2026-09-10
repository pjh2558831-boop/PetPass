"use client";

import Image from "next/image";
import { usePlacePhotoState } from "@/lib/places/use-place-photo-state";
import { MissingImage } from "@/components/ui/missing-image";

export function PlaceImage({
  imageUrl,
  title,
  priority = false,
  className = "",
  sizes = "(max-width: 640px) 100vw, 420px",
}: {
  imageUrl: string | null;
  title: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
}) {
  const photo = usePlacePhotoState(imageUrl);
  return (
    <div className={`relative min-h-24 overflow-hidden rounded-lg bg-[#eef3ef] ${className}`} data-image-state={photo.state}>
      {!imageUrl || photo.state === "failed" ? (
        <>
          <MissingImage label={title} mode={photo.state === "failed" ? "load-error" : "missing"} className="h-full" />
          {photo.state === "failed" ? <button type="button" className="photo-retry" onClick={photo.retry} onKeyDown={(event) => event.stopPropagation()}>사진 다시 시도</button> : null}
        </>
      ) : (
        <Image
          key={imageUrl}
          src={imageUrl}
          alt={`${title} 제공 이미지`}
          fill
          priority={priority}
          sizes={sizes}
          className="object-cover"
          onLoad={photo.onLoad}
          onError={photo.onError}
        />
      )}
    </div>
  );
}
