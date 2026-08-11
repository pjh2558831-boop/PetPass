import type { Metadata } from "next";
import { PlannerProgress } from "@/components/layout/planner-progress";
import { ItineraryEditor } from "@/components/itinerary/itinerary-editor";

export const metadata: Metadata = {
  title: "상세 일정",
};

export default function ItineraryPage() {
  return (
    <div className="page-shell py-8 sm:py-12 lg:py-14">
      <PlannerProgress current={3} />
      <div className="mt-9">
        <ItineraryEditor />
      </div>
    </div>
  );
}
