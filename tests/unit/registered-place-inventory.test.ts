import { expect, it } from "vitest";
import { scanInventoryPartition } from "@/scripts/lib/registered-place-inventory";

const row = (id: number) => ({ id: `kakao:${id}`, provider: "kakao" as const, category: "cafe", imageUrl: null });
it("advances the cursor exactly once per page and preserves provider identity", async () => {
  const cursors: (number | undefined)[] = [];
  const result = await scanInventoryPartition(async afterId => {
    cursors.push(afterId);
    return { items: [row(afterId ? 9 : 4)], totalCount: 2, hasNext: !afterId, nextCursor: afterId ? 9 : 4 };
  });
  expect(cursors).toEqual([undefined, 4]);
  expect(result.ids).toEqual(["kakao:4", "kakao:9"]);
  expect(result.categories.cafe).toEqual({ count: 2, withImageUrl: 0 });
});
it("rejects replay, duplicates, partial pages and changing totals", async () => {
  await expect(scanInventoryPartition(async () => ({ items: [row(1)], totalCount: 3, hasNext: true, nextCursor: 1 }))).rejects.toThrow();
  await expect(scanInventoryPartition(async () => ({ items: [row(1), row(1)], totalCount: 2, hasNext: false, nextCursor: 1 }))).rejects.toThrow();
  await expect(scanInventoryPartition(async () => ({ items: [row(1)], totalCount: 3, hasNext: false, nextCursor: 1 }))).rejects.toThrow();
  await expect(scanInventoryPartition(async cursor => ({ items: [row(cursor ? 2 : 1)], totalCount: cursor ? 3 : 2, hasNext: !cursor, nextCursor: cursor ? 2 : 1 }))).rejects.toThrow();
  await expect(scanInventoryPartition(async () => { throw new Error("unavailable"); })).rejects.toThrow("unavailable");
});
