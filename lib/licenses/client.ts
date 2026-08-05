import "server-only";

import { LicenseRequestCache } from "@/lib/licenses/cache";
import { normalizeLocalDataRecords } from "@/lib/licenses/normalizers";
import { LocalDataProviderClient } from "@/lib/licenses/provider";
import type { ParsedLocalDataResponse } from "@/lib/licenses/schemas";
import type {
  LocalDataDataset,
  LocalDataLicenseRecord,
  LocalDataSourceMetadata,
} from "@/types/license";

const SEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const SEARCH_PAGE_SIZE = 20;

export interface LocalDataSearchQuery {
  dataset: LocalDataDataset;
  businessName: string;
  roadAddressCondition?: string;
}

export interface LocalDataSearchResult {
  dataset: LocalDataDataset;
  records: LocalDataLicenseRecord[];
  totalCount: number;
  source: LocalDataSourceMetadata;
}

export interface LocalDataProviderLike {
  request(
    dataset: LocalDataDataset,
    params: Record<string, string>,
  ): Promise<ParsedLocalDataResponse>;
}

export interface LocalDataSearchService {
  search(query: LocalDataSearchQuery): Promise<LocalDataSearchResult>;
}

function stableSearchKey(query: LocalDataSearchQuery): string {
  return [
    query.dataset,
    query.businessName.normalize("NFKC").toLocaleLowerCase("ko-KR").trim(),
    query.roadAddressCondition?.normalize("NFKC").trim() ?? "",
  ].join(":");
}

export class LocalDataClient implements LocalDataSearchService {
  constructor(
    private readonly provider: LocalDataProviderLike = new LocalDataProviderClient(),
    private readonly cache = new LicenseRequestCache(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  search(query: LocalDataSearchQuery): Promise<LocalDataSearchResult> {
    return this.cache.getOrLoad(
      stableSearchKey(query),
      SEARCH_CACHE_TTL_MS,
      async () => {
        const params: Record<string, string> = {
          pageNo: "1",
          numOfRows: String(SEARCH_PAGE_SIZE),
          returnType: "json",
          "cond[BPLC_NM::LIKE]": query.businessName,
        };
        if (query.roadAddressCondition) {
          params["cond[ROAD_NM_ADDR::LIKE]"] = query.roadAddressCondition;
        }
        const response = await this.provider.request(query.dataset, params);
        const retrievedAt = this.now().toISOString();
        const records = normalizeLocalDataRecords(response.items, {
          dataset: query.dataset,
          retrievedAt,
        });
        return {
          dataset: query.dataset,
          records,
          totalCount: response.totalCount,
          source: {
            provider: "Ministry of the Interior and Safety",
            dataset: query.dataset,
            operation: "info",
            retrievedAt,
            providerUpdatedAt:
              records.map((record) => record.providerUpdatedAt).find(Boolean) ?? null,
          },
        };
      },
    );
  }
}

let defaultClient: LocalDataClient | undefined;

export function getDefaultLocalDataClient(): LocalDataClient {
  defaultClient ??= new LocalDataClient();
  return defaultClient;
}
