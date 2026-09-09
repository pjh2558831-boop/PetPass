interface InventoryPage {
  items: { id: string; category: string | null; imageUrl?: string | null }[];
  totalCount: number;
  hasNext: boolean;
  nextCursor?: number | null;
}

export async function scanInventoryPartition(read: (afterId?: number) => Promise<InventoryPage>) {
  const ids = new Set<string>();
  const categories: Record<string, { count: number; withImageUrl: number }> = {};
  let afterId: number | undefined;
  let total: number | undefined;
  for (let pageNumber = 0; pageNumber < 1000; pageNumber++) {
    const page = await read(afterId);
    total ??= page.totalCount;
    if (total !== page.totalCount) throw new Error("inventory_changed");
    for (const item of page.items) {
      if (ids.has(item.id)) throw new Error("duplicate_identity");
      ids.add(item.id);
      const key = item.category ?? "other";
      const group = categories[key] ??= { count: 0, withImageUrl: 0 };
      group.count++;
      if (item.imageUrl?.trim()) group.withImageUrl++;
    }
    if (!page.hasNext) {
      if (ids.size !== total) throw new Error("incomplete_inventory");
      return { ids: [...ids], categories, count: ids.size, pages: pageNumber + 1 };
    }
    if (!page.items.length || page.nextCursor == null || page.nextCursor <= (afterId ?? 0)) throw new Error("cursor_not_advancing");
    afterId = page.nextCursor;
  }
  throw new Error("inventory_page_budget_exhausted");
}
