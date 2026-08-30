import {
  BadgePlus,
  Binoculars,
  Check,
  Coffee,
  House,
  PawPrint,
  Shapes,
  ShoppingBag,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import {
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
} from "@/lib/map-places/place-categories";

const CATEGORY_ICONS: Record<PlaceCategory, LucideIcon> = {
  attraction: Binoculars,
  food: Utensils,
  cafe: Coffee,
  accommodation: House,
  other: Shapes,
  shopping: ShoppingBag,
  veterinary: BadgePlus,
  pet_shop: PawPrint,
};

export function PlaceCategoryToggleGroup({
  title,
  categories,
  active,
  counts,
  onToggle,
}: {
  title: string;
  categories: readonly PlaceCategory[];
  active: readonly PlaceCategory[];
  counts: Record<PlaceCategory, number | null>;
  onToggle: (category: PlaceCategory) => void;
}) {
  return (
    <fieldset className="explorer-category-group">
      <legend className="sr-only">{title}</legend>
      <div>
        {categories.map((category) => {
          const selected = active.includes(category);
          const CategoryIcon = CATEGORY_ICONS[category];
          return (
            <button key={category} type="button" aria-pressed={selected} onClick={() => onToggle(category)}>
              <span className="explorer-category-group__check" aria-hidden="true">{selected ? <Check size={12} /> : null}</span>
              <span className="explorer-category-group__icon" data-category={category} aria-hidden="true"><CategoryIcon size={18} strokeWidth={2.3} /></span>
              <span>{PLACE_CATEGORY_LABELS[category]}</span>
              <small>{counts[category] ?? "…"}</small>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
