import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { SavedRecommendationView } from "@/components/itinerary/saved-itinerary-view";
import { parseSavedRouteRecommendation } from "@/lib/storage/recommendation-storage";
import { createAuthServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SavedItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const supabase = await createAuthServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const { data } = await supabase.from("saved_itineraries").select("snapshot").eq("id", id).maybeSingle();
  const snapshot = parseSavedRouteRecommendation(data?.snapshot);
  if (!snapshot) notFound();
  return <div className="page-shell py-8 sm:py-12 lg:py-14"><SavedRecommendationView snapshot={snapshot} /></div>;
}
