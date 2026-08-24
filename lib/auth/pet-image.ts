import { z } from "zod";

export const PET_IMAGE_BUCKET = "pet-images";
export const PET_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const allowedPetImageTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export function petImageExtension(file: File): string {
  const extension = allowedPetImageTypes[file.type as keyof typeof allowedPetImageTypes];
  if (!extension || file.size <= 0 || file.size > PET_IMAGE_MAX_BYTES) {
    throw new Error("2MB 이하의 PNG, JPEG, WebP 이미지만 올릴 수 있습니다.");
  }
  return extension;
}

export async function assertPetImageSignature(file: File, extension: string): Promise<void> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpeg = extension === "jpg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = extension === "png" && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  const isWebp = extension === "webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!isJpeg && !isPng && !isWebp) {
    throw new Error("이미지 파일 형식을 확인해 주세요.");
  }
}

export function petImagePath(userId: string, petId: string, extension: string): string {
  const ownerId = z.string().uuid().parse(userId);
  const profileId = z.string().uuid().parse(petId);
  const safeExtension = z.enum(["jpg", "png", "webp"]).parse(extension);
  return `${ownerId}/${profileId}/${crypto.randomUUID()}.${safeExtension}`;
}
