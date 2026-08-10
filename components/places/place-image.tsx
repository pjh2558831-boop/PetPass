"use client";

import Image from "next/image";
import { useState } from "react";
import { MissingImage } from "@/components/ui/missing-image";

export function PlaceImage({
  imageUrl,
  title,
  priority = false,
}: {
  imageUrl: string | null;
  title: string;
  priority?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!imageUrl) return <MissingImage label={title} />;
  if (failedUrl === imageUrl) {
    return <MissingImage label={title} mode="load-error" />;
  }
  return (
    <div className="relative min-h-40 overflow-hidden rounded-2xl bg-[#eef3ef]">
      <Image
        src={imageUrl}
        alt={`${title} 제공 이미지`}
        fill
        priority={priority}
        sizes="(max-width: 640px) 100vw, 420px"
        className="object-cover"
        onError={() => setFailedUrl(imageUrl)}
      />
    </div>
  );
}
