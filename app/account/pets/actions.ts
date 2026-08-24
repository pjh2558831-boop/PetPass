"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertPetImageSignature, PET_IMAGE_BUCKET, petImageExtension, petImagePath } from "@/lib/auth/pet-image";
import { savedPetProfileInputSchema, savedPetProfileToRow, savedPetProfileToUpdateRow } from "@/lib/auth/pet-profile";
import { createAuthServerClient } from "@/lib/supabase/server";

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function parsePet(formData: FormData, id: string) {
  const profile = savedPetProfileInputSchema.parse({
    name: formValue(formData, "name"),
    species: formValue(formData, "species"),
    size: formValue(formData, "size"),
    hasCarrier: formData.has("hasCarrier"),
    hasLeash: formData.has("hasLeash"),
    hasMuzzle: formData.has("hasMuzzle"),
    acceptsOutdoorOnly: formData.has("acceptsOutdoorOnly"),
  });
  return { ...profile, id };
}

function petFormError(message: string, petId?: string): never {
  const pathname = petId ? `/account/pets/${petId}/edit` : "/account/pets/new";
  redirect(`${pathname}?error=${encodeURIComponent(message)}`);
}

async function authenticatedUser() {
  const supabase = await createAuthServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId: z.string().uuid().parse(userId) };
}

async function uploadPetImage(
  supabase: Awaited<ReturnType<typeof createAuthServerClient>>,
  userId: string,
  petId: string,
  file: File,
): Promise<string> {
  const extension = petImageExtension(file);
  await assertPetImageSignature(file, extension);
  const path = petImagePath(userId, petId, extension);
  const { error } = await supabase.storage.from(PET_IMAGE_BUCKET).upload(path, await file.arrayBuffer(), {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error("반려동물 사진을 저장하지 못했습니다.");
  return path;
}

function selectedImage(formData: FormData): File | null {
  const file = formData.get("image");
  return file instanceof File && file.size > 0 ? file : null;
}

export async function createPet(formData: FormData) {
  const petId = crypto.randomUUID();
  let profile;
  try {
    profile = parsePet(formData, petId);
  } catch {
    petFormError("반려동물 정보를 확인해 주세요.");
  }
  const { supabase, userId } = await authenticatedUser();
  let imagePath: string | null = null;
  try {
    const image = selectedImage(formData);
    if (image) imagePath = await uploadPetImage(supabase, userId, petId, image);
    const { error } = await supabase.from("pet_profiles").insert(savedPetProfileToRow(userId, profile, imagePath));
    if (error) throw error;
  } catch (error) {
    if (imagePath) await supabase.storage.from(PET_IMAGE_BUCKET).remove([imagePath]);
    petFormError(error instanceof Error ? error.message : "반려동물 정보를 저장하지 못했습니다.");
  }
  revalidatePath("/account");
  redirect("/account?pet=saved");
}

export async function updatePet(petId: string, formData: FormData) {
  const parsedPetId = z.string().uuid().safeParse(petId);
  if (!parsedPetId.success) redirect("/account");
  let profile;
  try {
    profile = parsePet(formData, parsedPetId.data);
  } catch {
    petFormError("반려동물 정보를 확인해 주세요.", parsedPetId.data);
  }
  const { supabase, userId } = await authenticatedUser();
  const { data: current, error: readError } = await supabase
    .from("pet_profiles")
    .select("id, image_path")
    .eq("id", parsedPetId.data)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError || !current) redirect("/account");

  let nextImagePath = formData.has("removeImage") ? null : current.image_path;
  let uploadedPath: string | null = null;
  try {
    const image = selectedImage(formData);
    if (image) {
      uploadedPath = await uploadPetImage(supabase, userId, parsedPetId.data, image);
      nextImagePath = uploadedPath;
    }
    const { error } = await supabase
      .from("pet_profiles")
      .update(savedPetProfileToUpdateRow(userId, profile, nextImagePath))
      .eq("id", parsedPetId.data)
      .eq("user_id", userId);
    if (error) throw error;
  } catch (error) {
    if (uploadedPath) await supabase.storage.from(PET_IMAGE_BUCKET).remove([uploadedPath]);
    petFormError(error instanceof Error ? error.message : "반려동물 정보를 수정하지 못했습니다.", parsedPetId.data);
  }
  if (current.image_path && current.image_path !== nextImagePath) {
    await supabase.storage.from(PET_IMAGE_BUCKET).remove([current.image_path]);
  }
  revalidatePath("/account");
  redirect("/account?pet=updated");
}

export async function deletePet(petId: string) {
  const parsedPetId = z.string().uuid().safeParse(petId);
  if (!parsedPetId.success) redirect("/account");
  const { supabase, userId } = await authenticatedUser();
  const { data: current } = await supabase
    .from("pet_profiles")
    .select("image_path")
    .eq("id", parsedPetId.data)
    .eq("user_id", userId)
    .maybeSingle();
  if (!current) redirect("/account");
  const { error } = await supabase.from("pet_profiles").delete().eq("id", parsedPetId.data).eq("user_id", userId);
  if (error) redirect(`/account/pets/${parsedPetId.data}/edit?error=${encodeURIComponent("반려동물 정보를 삭제하지 못했습니다.")}`);
  if (current.image_path) await supabase.storage.from(PET_IMAGE_BUCKET).remove([current.image_path]);
  revalidatePath("/account");
  redirect("/account?pet=deleted");
}
