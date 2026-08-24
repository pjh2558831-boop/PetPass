import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { deletePet, updatePet } from "@/app/account/pets/actions";
import { PetEditorForm } from "@/components/account/pet-editor-form";
import { DeletePetForm } from "@/components/account/delete-pet-form";
import { PET_IMAGE_BUCKET } from "@/lib/auth/pet-image";
import { savedPetProfileFromRow } from "@/lib/auth/pet-profile";
import { createAuthServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "반려동물 정보 수정" };
export const dynamic = "force-dynamic";

export default async function EditPetPage({ params, searchParams }: { params: Promise<{ petId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { petId } = await params;
  const supabase = await createAuthServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: row } = await supabase.from("pet_profiles").select("id, user_id, name, species, size, has_carrier, has_leash, has_muzzle, accepts_outdoor_only, image_path, created_at, updated_at").eq("id", petId).eq("user_id", userId).maybeSingle();
  if (!row) notFound();
  const pet = savedPetProfileFromRow(row);
  const imageUrl = row.image_path
    ? (await supabase.storage.from(PET_IMAGE_BUCKET).createSignedUrl(row.image_path, 3600)).data?.signedUrl ?? null
    : null;
  const { error } = await searchParams;
  return (
    <section className="site-shell py-12 sm:py-16">
      <div className="mx-auto mb-6 max-w-2xl">
        <p className="eyebrow">나의 반려동물</p>
        <h1 className="mt-2 text-3xl font-black">{pet.name} 정보 수정</h1>
      </div>
      <PetEditorForm action={updatePet.bind(null, petId)} pet={pet} imageUrl={imageUrl} error={error} submitLabel="변경사항 저장" />
      <DeletePetForm action={deletePet.bind(null, petId)} petName={pet.name} />
    </section>
  );
}
