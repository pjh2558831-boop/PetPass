import type { Metadata } from "next";
import { PlannerProgress } from "@/components/layout/planner-progress";
import { ItineraryEditor } from "@/components/itinerary/itinerary-editor";

export const metadata: Metadata = {
  title: "일정 편집",
};

export default function ItineraryPage() {
  return (
    <div className="page-shell py-8 sm:py-12">
      <PlannerProgress current={4} />
      <div className="mt-9">
        <ItineraryEditor />
      </div>
    </div>
  );
}
