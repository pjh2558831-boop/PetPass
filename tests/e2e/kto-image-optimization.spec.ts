import { expect, test } from "@playwright/test";

const representativeKtoImages = [
  "https://tong.visitkorea.or.kr/cms/resource/fixture-jeju-01.jpg",
  "https://tong.visitkorea.or.kr/cms/resource/fixture-jeju-02.jpg",
] as const;

test("optimizes representative KTO images through the Next image pipeline", async ({
  request,
}) => {
  for (const imageUrl of representativeKtoImages) {
    const response = await request.get(
      `/_next/image?url=${encodeURIComponent(imageUrl)}&w=640&q=75`,
    );

    expect(response.status(), imageUrl).toBe(200);
    expect(response.headers()["content-type"], imageUrl).toMatch(/^image\//u);
    expect((await response.body()).byteLength, imageUrl).toBeGreaterThan(40);
  }
});
