import { expect, test } from "@playwright/test";

test("does not expose the removed generic Tourism upstream proxy", async ({
  request,
}) => {
  const formerlyAllowlisted = await request.get(
    "/api/tour?operation=areaBasedList2&arbitrary=value",
  );
  const unsupported = await request.get(
    "/api/tour?operation=unsupportedOperation",
  );

  expect(formerlyAllowlisted.status()).toBe(404);
  expect(unsupported.status()).toBe(404);
  const responseText = await formerlyAllowlisted.text();
  expect(responseText).not.toContain("apis.data.go.kr");
  expect(responseText).not.toContain("KorPetTourService2");
  expect(responseText).not.toContain('"resultCode"');
});
