import type { Coordinates, PetPlace } from "@/types/place";

export function haversineKm(a: Coordinates, b: Coordinates): number {
  const radiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
}

export function orderByNearestNeighbor(places: PetPlace[]): PetPlace[] {
  if (places.length < 2) return [...places];
  const remaining = places.slice(1);
  const ordered = [places[0]];

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    remaining.forEach((candidate, index) => {
      const distance = haversineKm(current.coordinates, candidate.coordinates);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    ordered.push(remaining.splice(nearestIndex, 1)[0]);
  }

  return ordered;
}
