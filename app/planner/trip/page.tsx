import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "여행 조건",
};

export default function TripPreferencesPage() {
  redirect("/planner/pet");
}
