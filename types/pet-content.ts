export interface PetNewsItem {
  id: string;
  title: string;
  originalUrl: string;
  sourceLabel: string;
  providedAt: string | null;
}

export interface PetEventItem {
  id: string;
  title: string;
  startDate: string;
  endDate: string | null;
  regionLabel: string;
  venueLabel: string | null;
  informationUrl: string | null;
  status: "upcoming" | "ongoing";
  source: "한국관광공사";
  checkedAt: string;
}

export interface ContentFeed<T> {
  state: "ready" | "empty" | "unavailable";
  items: T[];
  coverageLimited?: boolean;
}
