import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { reviewVenueMedia } from "@/lib/places/venue-media-review";

async function main() {
  const [filename, ...extra] = process.argv.slice(2);
  if (!filename || extra.length) throw new Error("usage");
  if ((await stat(filename)).size > 1_000_000) throw new Error("manifest_too_large");
  const manifest = z.object({ version: z.literal(1), entries: z.array(z.unknown()).max(1000) }).strict()
    .parse(JSON.parse(await readFile(filename, "utf8")));
  const results = manifest.entries.map((entry, index) => ({ index, ...reviewVenueMedia(entry) }));
  console.log(JSON.stringify({ results, eligible: results.filter(r => r.eligible).length, published: 0 }, null, 2));
  if (results.some(r => !r.eligible)) process.exitCode = 1;
}
main().catch(() => {
  console.error("검토 실패: 로컬 manifest 경로·형식·크기를 확인하세요. 사용법: npm run media:review -- <manifest.json>");
  process.exitCode = 1;
});
