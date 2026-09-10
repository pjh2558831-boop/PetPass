import type { KakaoCurrentMapSearch } from "@/types/kakao";
import type { Coordinates } from "@/types/place";

export interface ExplorerView {
  searchQuery: string;
  selectedId: string | null;
  activeBounds: KakaoCurrentMapSearch["rectangle"] | null;
  camera: { center: Coordinates; level: number } | null;
  listScroll: number;
  mobileMode: "map" | "list";
  rankingAsOf: string;
}
// Tab memory only. No place records, map objects, credentials or location history.
const views = new Map<string, { view: ExplorerView; expiresAt: number }>();
export function readExplorerView(key: string, now = Date.now()): ExplorerView | null {
  const entry = views.get(key);
  if (!entry || entry.expiresAt <= now) { views.delete(key); return null; }
  return entry.view;
}
export function saveExplorerView(key: string, view: ExplorerView, now = Date.now()): void {
  views.delete(key);
  views.set(key, { view, expiresAt: now + 300_000 });
  if (views.size > 20) views.delete(views.keys().next().value!);
}
