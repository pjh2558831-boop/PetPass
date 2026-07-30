import type { ItineraryStop } from "@/types/itinerary";
import type { PetPlace } from "@/types/place";

function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const value = hours * 60 + mins + minutes;
  return `${String(Math.floor(value / 60) % 24).padStart(2, "0")}:${String(
    value % 60,
  ).padStart(2, "0")}`;
}

export function schedulePlaces(
  places: PetPlace[],
  startTime: string,
): Array<Pick<ItineraryStop, "place" | "plannedArrival" | "plannedDeparture">> {
  let cursor = startTime;
  return places.map((place, index) => {
    if (index > 0) cursor = addMinutes(cursor, 20);
    const duration = place.category === "RESTAURANT" ? 75 : 60;
    const plannedDeparture = addMinutes(cursor, duration);
    const scheduled = {
      place,
      plannedArrival: cursor,
      plannedDeparture,
    };
    cursor = plannedDeparture;
    return scheduled;
  });
}
