import { describe, expect, it, vi } from "vitest";
import { createJejuKtoFixtureProvider } from "@/fixtures/jeju-kto-collection";
import {
  collectJejuKtoCatalog,
  executeJejuKtoCollection,
} from "@/lib/tour-api/collection/runner";
import { parseJejuKtoCliArgs } from "@/lib/tour-api/collection/cli";
import type {
  KtoCatalogCollectionRepository,
  KtoCatalogMapPlace,
} from "@/lib/tour-api/collection/contracts";

const NOW = "2026-08-19T05:00:00.000Z";

function repository() {
  const startRun = vi.fn<KtoCatalogCollectionRepository["startRun"]>(async () => ({
    runId: 77,
    completedDistrictCodes: new Set<"110" | "130">(),
  }));
  const checkpointDistrict = vi.fn<KtoCatalogCollectionRepository["checkpointDistrict"]>(async () => undefined);
  const markFailed = vi.fn<KtoCatalogCollectionRepository["markFailed"]>(async () => undefined);
  const finalizeCompletedRun = vi.fn<KtoCatalogCollectionRepository["finalizeCompletedRun"]>(async () => ({
    insertedRowCount: 3,
    updatedRowCount: 0,
    deactivatedRowCount: 1,
  }));
  return {
    value: {
      startRun,
      resumeRun: vi.fn<KtoCatalogCollectionRepository["resumeRun"]>(),
      checkpointDistrict,
      markFailed,
      finalizeCompletedRun,
    } satisfies KtoCatalogCollectionRepository,
    startRun,
    checkpointDistrict,
    markFailed,
    finalizeCompletedRun,
  };
}

describe("Jeju KTO catalog collection", () => {
  it("uses Service2 legal-dong 50 and keeps Jeju 110 distinct from Busan 110", async () => {
    const provider = createJejuKtoFixtureProvider();
    const result = await collectJejuKtoCatalog({ provider, now: () => new Date(NOW) });

    expect(provider.listCalls).toEqual([
      { regionCode: "50", districtCode: "110" },
      { regionCode: "50", districtCode: "130" },
    ]);
    expect(result.rows.map(({ provider_place_id }) => provider_place_id)).toEqual([
      "5001001",
      "5001002",
      "5002001",
    ]);
    expect(result.rows).toSatisfy((rows: KtoCatalogMapPlace[]) =>
      rows.every((row) => row.region_id === "jeju" && row.provider === "tour"),
    );
    expect(result.rows.find((row) => row.provider_place_id === "5001001")).toMatchObject({
      district_code: "110",
      district_name: "제주시",
    });
    expect(result.rows.some((row) => row.provider_place_id === "2601001")).toBe(false);
    expect(result.audit.districts["110"].rejectionCounts).toMatchObject({
      administrative_region_mismatch: 1,
    });
  });

  it("reports exact district audit totals and excludes shopping and invalid coordinates", async () => {
    const result = await collectJejuKtoCatalog({
      provider: createJejuKtoFixtureProvider(),
      now: () => new Date(NOW),
    });

    expect(result.audit.districts["110"]).toMatchObject({
      rawCount: 6,
      acceptedCount: 2,
      rejectedCount: 3,
      duplicateCount: 1,
      imageCoveredCount: 1,
      detailPetTourCoveredCount: 1,
      rawContentTypeCounts: { "12": 3, "14": 1, "38": 1, "39": 1 },
      categoryCounts: { attraction: 1, food: 1 },
      verdictCounts: { conditional: 1, unknown: 1 },
      rejectionCounts: {
        shopping_content_type: 1,
        out_of_region_coordinates: 1,
        administrative_region_mismatch: 1,
      },
    });
    expect(result.audit.districts["130"]).toMatchObject({
      rawCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      duplicateCount: 0,
      imageCoveredCount: 0,
      detailPetTourCoveredCount: 1,
      rawContentTypeCounts: { "32": 1 },
      categoryCounts: { accommodation: 1 },
    });
    expect(result.rows.some((row) => row.content_type_id === 38)).toBe(false);
    expect(result.rows.find((row) => row.provider_place_id === "5001002")?.image_url).toBeNull();
  });

  it("keeps dry-run as the default and performs no database mutation", async () => {
    const store = repository();
    const result = await executeJejuKtoCollection({
      provider: createJejuKtoFixtureProvider(),
      repository: store.value,
      now: () => new Date(NOW),
    });

    expect(result.mode).toBe("dry-run");
    expect(store.startRun).not.toHaveBeenCalled();
    expect(store.checkpointDistrict).not.toHaveBeenCalled();
    expect(store.finalizeCompletedRun).not.toHaveBeenCalled();
  });

  it("scopes every apply checkpoint and finalization by Jeju and tour provider", async () => {
    const store = repository();
    await executeJejuKtoCollection({
      mode: "apply",
      scope: "full",
      provider: createJejuKtoFixtureProvider(),
      repository: store.value,
      now: () => new Date(NOW),
    });

    expect(store.startRun).toHaveBeenCalledWith(expect.objectContaining({
      regionId: "jeju",
      provider: "tour",
      scope: "full",
      districtCodes: ["110", "130"],
    }));
    expect(store.checkpointDistrict).toHaveBeenCalledTimes(2);
    for (const [input] of store.checkpointDistrict.mock.calls) {
      expect(input).toMatchObject({ regionId: "jeju", provider: "tour", runId: 77 });
    }
    expect(store.finalizeCompletedRun).toHaveBeenCalledWith(expect.objectContaining({
      regionId: "jeju",
      provider: "tour",
      runId: 77,
      scope: "full",
    }));
  });

  it("does not partially activate records when a provider detail request fails", async () => {
    const store = repository();
    await expect(executeJejuKtoCollection({
      mode: "apply",
      scope: "full",
      provider: createJejuKtoFixtureProvider({ failContentId: "5002001" }),
      repository: store.value,
      now: () => new Date(NOW),
    })).rejects.toMatchObject({ code: "PROVIDER_FAILURE" });

    expect(store.finalizeCompletedRun).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith(expect.objectContaining({
      regionId: "jeju",
      provider: "tour",
      runId: 77,
    }));
  });

  it("treats structurally empty success responses as an audit failure with no writes", async () => {
    const store = repository();
    await expect(executeJejuKtoCollection({
      mode: "apply",
      provider: {
        async listDistrict(input) {
          return { records: [], page: input.page, pageSize: input.pageSize, totalCount: 0 };
        },
        async getPlaceDetail() {
          throw new Error("must not load detail");
        },
      },
      repository: store.value,
      now: () => new Date(NOW),
    })).rejects.toMatchObject({ code: "SUSPICIOUS_EMPTY_RESULT" });
    expect(store.finalizeCompletedRun).not.toHaveBeenCalled();
  });

  it("defaults CLI execution to dry-run and requires explicit apply for resume", () => {
    expect(parseJejuKtoCliArgs([])).toEqual({ mode: "dry-run", scope: "full" });
    expect(parseJejuKtoCliArgs(["--apply", "--scope=delta", "--resume=77"]))
      .toEqual({ mode: "apply", scope: "delta", resumeRunId: "77" });
    expect(() => parseJejuKtoCliArgs(["--resume=77"]))
      .toThrowError("Resume requires explicit --apply mode.");
    expect(() => parseJejuKtoCliArgs(["--dry-run", "--apply"]))
      .toThrowError("Choose exactly one collector mode.");
  });

  it("preserves snapshotted Busan KTO and Kakao counts across idempotent Jeju finalization", async () => {
    const catalog: Array<{
      regionId: string;
      provider: "tour" | "kakao";
      providerPlaceId: string;
      active: boolean;
    }> = [
      { regionId: "busan", provider: "tour", providerPlaceId: "2609001", active: true },
      { regionId: "busan", provider: "kakao", providerPlaceId: "9002", active: true },
      { regionId: "jeju", provider: "tour", providerPlaceId: "5000999", active: true },
    ];
    let staged: KtoCatalogMapPlace[] = [];
    const scopedRepository: KtoCatalogCollectionRepository = {
      async startRun() {
        staged = [];
        return { runId: 88, completedDistrictCodes: new Set() };
      },
      async resumeRun() {
        throw new Error("not used");
      },
      async checkpointDistrict(input) {
        expect(input).toMatchObject({ regionId: "jeju", provider: "tour" });
        staged.push(...input.rows);
      },
      async markFailed() {
        throw new Error("not used");
      },
      async finalizeCompletedRun(input) {
        expect(input).toMatchObject({ regionId: "jeju", provider: "tour", scope: "full" });
        const seen = new Set(staged.map((row) => row.provider_place_id));
        let insertedRowCount = 0;
        let updatedRowCount = 0;
        let deactivatedRowCount = 0;
        for (const row of staged) {
          const existing = catalog.find(
            (place) =>
              place.regionId === input.regionId &&
              place.provider === input.provider &&
              place.providerPlaceId === row.provider_place_id,
          );
          if (existing) {
            existing.active = true;
            updatedRowCount += 1;
          } else {
            catalog.push({
              regionId: input.regionId,
              provider: input.provider,
              providerPlaceId: row.provider_place_id,
              active: true,
            });
            insertedRowCount += 1;
          }
        }
        for (const place of catalog) {
          if (
            place.regionId === input.regionId &&
            place.provider === input.provider &&
            place.active &&
            !seen.has(place.providerPlaceId)
          ) {
            place.active = false;
            deactivatedRowCount += 1;
          }
        }
        return { insertedRowCount, updatedRowCount, deactivatedRowCount };
      },
    };
    const busanSnapshot = () => ({
      tour: catalog.filter((row) => row.regionId === "busan" && row.provider === "tour" && row.active).length,
      kakao: catalog.filter((row) => row.regionId === "busan" && row.provider === "kakao" && row.active).length,
    });
    const before = busanSnapshot();

    const first = await executeJejuKtoCollection({
      mode: "apply",
      scope: "full",
      provider: createJejuKtoFixtureProvider(),
      repository: scopedRepository,
      now: () => new Date(NOW),
    });
    const second = await executeJejuKtoCollection({
      mode: "apply",
      scope: "full",
      provider: createJejuKtoFixtureProvider(),
      repository: scopedRepository,
      now: () => new Date(NOW),
    });

    expect(before).toEqual({ tour: 1, kakao: 1 });
    expect(busanSnapshot()).toEqual(before);
    expect(first.database).toEqual({ insertedRowCount: 3, updatedRowCount: 0, deactivatedRowCount: 1 });
    expect(second.database).toEqual({ insertedRowCount: 0, updatedRowCount: 3, deactivatedRowCount: 0 });
    expect(catalog.find((row) => row.providerPlaceId === "5000999")?.active).toBe(false);
  });
});
