import { describe, expect, it } from "vitest";
import { assertPetImageSignature, petImageExtension, petImagePath } from "@/lib/auth/pet-image";

describe("pet image upload validation", () => {
  const userId = "9f791b6b-44dd-40ae-984a-503a275605eb";
  const petId = "12e3d4aa-4962-4b9d-853c-9e91dc8cc10e";

  function imageFile(bytes: Uint8Array, type: string): File {
    return {
      type,
      size: bytes.byteLength,
      slice: () => ({ arrayBuffer: async () => bytes.buffer }) as Blob,
    } as File;
  }

  it("accepts a genuine PNG signature and creates an owner-scoped path", async () => {
    const file = imageFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png");
    const extension = petImageExtension(file);
    await expect(assertPetImageSignature(file, extension)).resolves.toBeUndefined();
    expect(petImagePath(userId, petId, extension)).toMatch(new RegExp(`^${userId}/${petId}/.+\\.png$`, "u"));
  });

  it("rejects HTML disguised with an image MIME type", async () => {
    const file = imageFile(new TextEncoder().encode("<html>not an image</html>"), "image/png");
    await expect(assertPetImageSignature(file, petImageExtension(file))).rejects.toThrow("이미지 파일 형식");
  });

  it("rejects unsupported MIME types and oversized files", () => {
    expect(() => petImageExtension(imageFile(new Uint8Array([1]), "image/svg+xml"))).toThrow();
    expect(() => petImageExtension(imageFile(new Uint8Array(2 * 1024 * 1024 + 1), "image/png"))).toThrow();
  });
});
