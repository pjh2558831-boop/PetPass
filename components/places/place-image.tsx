"use client";

import Image from "next/image";
import { useState } from "react";
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
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const wrapperClassName = `relative min-h-24 overflow-hidden rounded-lg bg-[#eef3ef] ${className}`;
  if (!imageUrl) return <MissingImage label={title} className={className} />;
  if (failedUrl === imageUrl) {
    return (
      <MissingImage label={title} mode="load-error" className={className} />
    );
  }
  return (
    <div className={wrapperClassName}>
      <Image
        src={imageUrl}
        alt={`${title} 제공 이미지`}
        fill
        priority={priority}
        sizes={sizes}
        className="object-cover"
        onError={() => setFailedUrl(imageUrl)}
      />
    </div>
  );
}
