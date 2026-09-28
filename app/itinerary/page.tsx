import type { Metadata } from "next";
import { ItineraryEditor } from "@/components/itinerary/itinerary-editor";

export const metadata: Metadata = {
  title: "상세 일정",
  robots: { index: false, follow: true },
};

export default function ItineraryPage() {
  return (
    <div className="page-shell py-8 sm:py-12 lg:py-14">
      <ItineraryEditor />
    </div>
  );
}
